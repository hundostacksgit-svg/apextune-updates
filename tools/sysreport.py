#!/usr/bin/env python3
"""
OmniDx companion system report.

A browser is sandboxed and cannot see disk SMART health, CPU temperatures,
installed memory modules or running processes. This script can. It uses only
the Python standard library and the tools already on your machine.

Usage:
    python3 tools/sysreport.py            # print, and write a .txt next to it
    python3 tools/sysreport.py --stdout   # print only
    python3 tools/sysreport.py --json     # machine-readable output

Nothing is uploaded. Everything is read-only.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime

IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")


def run(cmd, timeout=12):
    """Run a command and return stdout, or '' if it is unavailable or fails."""
    try:
        out = subprocess.run(
            cmd,
            shell=isinstance(cmd, str),
            capture_output=True,
            text=True,
            timeout=timeout,
            errors="replace",
        )
        return (out.stdout or "").strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def read(path):
    try:
        with open(path, "r", errors="replace") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def human(n):
    try:
        n = float(n)
    except (TypeError, ValueError):
        return "unknown"
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if abs(n) < 1024 or unit == "PB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return f"{n:.1f} PB"


# --------------------------------------------------------------------------
# collectors
# --------------------------------------------------------------------------

def collect_system():
    d = {
        "hostname": socket.gethostname(),
        "os": f"{platform.system()} {platform.release()}",
        "os_version": platform.version(),
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "generated": datetime.now().isoformat(timespec="seconds"),
    }
    if IS_MAC:
        ver = run(["sw_vers", "-productVersion"])
        name = run(["sw_vers", "-productName"])
        if ver:
            d["os"] = f"{name or 'macOS'} {ver}"
        model = run(["sysctl", "-n", "hw.model"])
        if model:
            d["model"] = model
    elif IS_LINUX:
        for line in read("/etc/os-release").splitlines():
            if line.startswith("PRETTY_NAME="):
                d["os"] = line.split("=", 1)[1].strip('"')
        model = read("/sys/devices/virtual/dmi/id/product_name")
        vendor = read("/sys/devices/virtual/dmi/id/sys_vendor")
        if model:
            d["model"] = f"{vendor} {model}".strip()
    elif IS_WIN:
        out = run(["powershell", "-NoProfile", "-Command",
                   "(Get-CimInstance Win32_ComputerSystem | "
                   "Select-Object Manufacturer,Model | Format-List | Out-String).Trim()"])
        if out:
            d["model"] = " ".join(out.split())

    # uptime
    if IS_LINUX:
        up = read("/proc/uptime").split()
        if up:
            d["uptime"] = fmt_secs(float(up[0]))
    elif IS_MAC:
        m = re.search(r"sec = (\d+)", run(["sysctl", "-n", "kern.boottime"]))
        if m:
            d["uptime"] = fmt_secs(time.time() - int(m.group(1)))
    elif IS_WIN:
        out = run(["powershell", "-NoProfile", "-Command",
                   "((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalSeconds"])
        try:
            d["uptime"] = fmt_secs(float(out))
        except ValueError:
            pass
    return d


def fmt_secs(s):
    s = int(s)
    days, rem = divmod(s, 86400)
    hours, rem = divmod(rem, 3600)
    mins = rem // 60
    if days:
        return f"{days}d {hours}h {mins}m"
    if hours:
        return f"{hours}h {mins}m"
    return f"{mins}m"


def collect_cpu():
    d = {"logical_cores": os.cpu_count()}
    if IS_LINUX:
        info = read("/proc/cpuinfo")
        m = re.search(r"model name\s*:\s*(.+)", info)
        if m:
            d["model"] = m.group(1).strip()
        d["physical_cores"] = len(set(re.findall(r"core id\s*:\s*(\d+)", info))) or None
        mhz = re.findall(r"cpu MHz\s*:\s*([\d.]+)", info)
        if mhz:
            d["current_mhz"] = f"{max(float(x) for x in mhz):.0f}"
        try:
            d["load_average"] = ", ".join(f"{x:.2f}" for x in os.getloadavg())
        except OSError:
            pass
        gov = read("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor")
        if gov:
            d["scaling_governor"] = gov
    elif IS_MAC:
        d["model"] = run(["sysctl", "-n", "machdep.cpu.brand_string"])
        phys = run(["sysctl", "-n", "hw.physicalcpu"])
        if phys:
            d["physical_cores"] = phys
        try:
            d["load_average"] = ", ".join(f"{x:.2f}" for x in os.getloadavg())
        except OSError:
            pass
    elif IS_WIN:
        out = run(["powershell", "-NoProfile", "-Command",
                   "$c=Get-CimInstance Win32_Processor|Select-Object -First 1;"
                   "'{0}|{1}|{2}|{3}' -f $c.Name,$c.NumberOfCores,$c.MaxClockSpeed,$c.LoadPercentage"])
        parts = out.split("|")
        if len(parts) == 4:
            d["model"], d["physical_cores"], d["max_mhz"], d["load_percent"] = [p.strip() for p in parts]
    d.setdefault("model", platform.processor() or "unknown")
    return d


def collect_memory():
    d = {}
    if IS_LINUX:
        info = {}
        for line in read("/proc/meminfo").splitlines():
            k, _, v = line.partition(":")
            info[k.strip()] = v.strip()

        def kb(key):
            m = re.match(r"(\d+)", info.get(key, ""))
            return int(m.group(1)) * 1024 if m else 0

        total, avail = kb("MemTotal"), kb("MemAvailable")
        d["total"] = human(total)
        d["available"] = human(avail)
        d["used"] = human(total - avail)
        if total:
            d["used_percent"] = f"{(total - avail) / total * 100:.0f}%"
        swap_t, swap_f = kb("SwapTotal"), kb("SwapFree")
        if swap_t:
            d["swap"] = f"{human(swap_t - swap_f)} used of {human(swap_t)}"
    elif IS_MAC:
        total = run(["sysctl", "-n", "hw.memsize"])
        if total.isdigit():
            d["total"] = human(int(total))
        vm = run(["vm_stat"])
        page = re.search(r"page size of (\d+)", vm)
        psize = int(page.group(1)) if page else 4096
        free = re.search(r"Pages free:\s+(\d+)", vm)
        spec = re.search(r"Pages speculative:\s+(\d+)", vm)
        if free and total.isdigit():
            avail = (int(free.group(1)) + int(spec.group(1) if spec else 0)) * psize
            d["available"] = human(avail)
            d["used"] = human(int(total) - avail)
            d["used_percent"] = f"{(int(total) - avail) / int(total) * 100:.0f}%"
    elif IS_WIN:
        out = run(["powershell", "-NoProfile", "-Command",
                   "$o=Get-CimInstance Win32_OperatingSystem;"
                   "'{0}|{1}' -f ($o.TotalVisibleMemorySize*1KB),($o.FreePhysicalMemory*1KB)"])
        parts = out.split("|")
        if len(parts) == 2:
            try:
                total, free = float(parts[0]), float(parts[1])
                d["total"], d["available"], d["used"] = human(total), human(free), human(total - free)
                d["used_percent"] = f"{(total - free) / total * 100:.0f}%"
            except ValueError:
                pass
        sticks = run(["powershell", "-NoProfile", "-Command",
                      "(Get-CimInstance Win32_PhysicalMemory | ForEach-Object "
                      "{'{0} {1}MHz {2}' -f [math]::Round($_.Capacity/1GB),$_.Speed,$_.Manufacturer}) -join '; '"])
        if sticks:
            d["modules"] = sticks
    return d


def collect_disks():
    disks = []
    seen = set()
    if IS_WIN:
        import string
        roots = [f"{c}:\\" for c in string.ascii_uppercase if os.path.exists(f"{c}:\\")]
    else:
        roots = ["/"]
        for line in read("/proc/mounts").splitlines():
            parts = line.split()
            if len(parts) > 2 and parts[0].startswith("/dev/") and parts[2] not in ("squashfs",):
                roots.append(parts[1])
        if IS_MAC:
            roots += [p for p in ("/System/Volumes/Data",) if os.path.exists(p)]

    for root in roots:
        try:
            real = os.path.realpath(root)
            if real in seen:
                continue
            seen.add(real)
            usage = shutil.disk_usage(root)
        except OSError:
            continue
        if usage.total == 0:
            continue
        pct = usage.used / usage.total * 100
        disks.append({
            "mount": root,
            "total": human(usage.total),
            "used": human(usage.used),
            "free": human(usage.free),
            "used_percent": f"{pct:.0f}%",
            "warning": "LOW SPACE" if pct > 90 else "",
        })
    return disks


def collect_smart():
    """Disk health, when the OS will tell us without extra software."""
    out = []
    if IS_WIN:
        r = run(["powershell", "-NoProfile", "-Command",
                 "(Get-PhysicalDisk | ForEach-Object {'{0} | {1} | health: {2} | {3}' -f "
                 "$_.FriendlyName,$_.MediaType,$_.HealthStatus,$_.OperationalStatus}) -join \"`n\""])
        out = [l for l in r.splitlines() if l.strip()]
    elif IS_MAC:
        r = run(["diskutil", "info", "-all"])
        name = None
        for line in r.splitlines():
            if "Device / Media Name:" in line:
                name = line.split(":", 1)[1].strip()
            if "SMART Status:" in line:
                status = line.split(":", 1)[1].strip()
                out.append(f"{name or 'disk'} | SMART: {status}")
                name = None
    elif IS_LINUX:
        if shutil.which("smartctl"):
            devs = re.findall(r"^(\S+)", run(["smartctl", "--scan"]), re.M)
            for dev in devs[:6]:
                r = run(["smartctl", "-H", dev])
                m = re.search(r"(SMART overall-health.*|SMART Health Status.*)", r)
                if m:
                    out.append(f"{dev} | {m.group(1).strip()}")
        if not out:
            # Filter the virtual devices out *before* limiting, or a machine with
            # a dozen snap loop mounts reports no real disks at all.
            for block in sorted(os.listdir("/sys/block")):
                if re.match(r"(loop|ram|zram|dm-|sr)\d*", block):
                    continue
                size = read(f"/sys/block/{block}/size")
                if not (size.isdigit() and int(size) > 0):
                    continue
                rot = read(f"/sys/block/{block}/queue/rotational")
                model = read(f"/sys/block/{block}/device/model")
                kind = "HDD" if rot == "1" else "SSD/Flash"
                label = f"/dev/{block} | {kind} | {human(int(size) * 512)}"
                if model:
                    label += f" | {model}"
                out.append(label)
                if len(out) >= 8:
                    break
            if out:
                out.append("(install smartmontools for real SMART health: apt install smartmontools)")
    return out


def collect_temps():
    temps = []
    if IS_LINUX:
        base = "/sys/class/thermal"
        if os.path.isdir(base):
            for zone in sorted(os.listdir(base)):
                if not zone.startswith("thermal_zone"):
                    continue
                val = read(f"{base}/{zone}/temp")
                label = read(f"{base}/{zone}/type") or zone
                if val.lstrip("-").isdigit():
                    c = int(val) / 1000
                    if 0 < c < 150:
                        flag = "  <-- HOT" if c > 85 else ""
                        temps.append(f"{label}: {c:.1f} C{flag}")
        hwmon = "/sys/class/hwmon"
        if os.path.isdir(hwmon) and not temps:
            for mon in sorted(os.listdir(hwmon)):
                name = read(f"{hwmon}/{mon}/name")
                for f in sorted(os.listdir(f"{hwmon}/{mon}")):
                    if re.fullmatch(r"temp\d+_input", f):
                        val = read(f"{hwmon}/{mon}/{f}")
                        if val.isdigit():
                            temps.append(f"{name}/{f}: {int(val)/1000:.1f} C")
    elif IS_MAC:
        r = run(["powermetrics", "--samplers", "smc", "-i1", "-n1"], timeout=8)
        for line in r.splitlines():
            if "die temperature" in line.lower():
                temps.append(line.strip())
        if not temps:
            temps.append("(macOS needs sudo for temperatures: sudo powermetrics --samplers smc)")
    elif IS_WIN:
        r = run(["powershell", "-NoProfile", "-Command",
                 "try{(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature "
                 "-ErrorAction Stop | ForEach-Object {'{0:N1} C' -f (($_.CurrentTemperature/10)-273.15)}) "
                 "-join \"`n\"}catch{''}"])
        temps = [l for l in r.splitlines() if l.strip()]
        if not temps:
            temps.append("(Windows exposes no temperature sensor without extra software)")
    return temps


def collect_battery():
    d = {}
    if IS_LINUX:
        base = "/sys/class/power_supply"
        if os.path.isdir(base):
            for bat in sorted(os.listdir(base)):
                if not bat.lower().startswith("bat"):
                    continue
                cap = read(f"{base}/{bat}/capacity")
                status = read(f"{base}/{bat}/status")
                full = read(f"{base}/{bat}/energy_full") or read(f"{base}/{bat}/charge_full")
                design = read(f"{base}/{bat}/energy_full_design") or read(f"{base}/{bat}/charge_full_design")
                d["charge"] = f"{cap}%" if cap else "unknown"
                d["status"] = status or "unknown"
                if full.isdigit() and design.isdigit() and int(design):
                    health = int(full) / int(design) * 100
                    d["health"] = f"{health:.0f}% of design capacity"
                    if health < 80:
                        d["warning"] = "Battery has degraded past 80% — replacement is worth considering"
                cyc = read(f"{base}/{bat}/cycle_count")
                if cyc.isdigit() and int(cyc):
                    d["cycles"] = cyc
                break
    elif IS_MAC:
        r = run(["pmset", "-g", "batt"])
        m = re.search(r"(\d+)%;\s*([\w\s]+);", r)
        if m:
            d["charge"], d["status"] = f"{m.group(1)}%", m.group(2).strip()
        r2 = run(["system_profiler", "SPPowerDataType"])
        cyc = re.search(r"Cycle Count:\s*(\d+)", r2)
        cond = re.search(r"Condition:\s*(.+)", r2)
        maxc = re.search(r"Maximum Capacity:\s*(\d+)", r2)
        if cyc:
            d["cycles"] = cyc.group(1)
        if cond:
            d["condition"] = cond.group(1).strip()
        if maxc:
            d["health"] = f"{maxc.group(1)}% of design capacity"
    elif IS_WIN:
        out = run(["powershell", "-NoProfile", "-Command",
                   "$b=Get-CimInstance Win32_Battery|Select-Object -First 1;"
                   "if($b){'{0}|{1}' -f $b.EstimatedChargeRemaining,$b.BatteryStatus}"])
        parts = out.split("|")
        if len(parts) == 2 and parts[0].strip():
            d["charge"] = f"{parts[0].strip()}%"
            d["status"] = "charging" if parts[1].strip() == "2" else "on battery"
            d["note"] = "run 'powercfg /batteryreport' for full wear detail"
    return d


def collect_gpu():
    out = []
    if IS_LINUX:
        r = run("lspci 2>/dev/null | grep -Ei 'vga|3d|display'")
        out = [re.sub(r"^\S+\s+", "", l).strip() for l in r.splitlines() if l.strip()]
        if shutil.which("nvidia-smi"):
            n = run(["nvidia-smi", "--query-gpu=name,temperature.gpu,memory.used,memory.total",
                     "--format=csv,noheader"])
            out += [l.strip() for l in n.splitlines() if l.strip()]
    elif IS_MAC:
        r = run(["system_profiler", "SPDisplaysDataType"])
        for line in r.splitlines():
            if "Chipset Model:" in line or "VRAM" in line:
                out.append(line.strip())
    elif IS_WIN:
        r = run(["powershell", "-NoProfile", "-Command",
                 "(Get-CimInstance Win32_VideoController | ForEach-Object "
                 "{'{0} | {1} | driver {2}' -f $_.Name,(& {if($_.AdapterRAM){'{0:N0} MB' -f "
                 "($_.AdapterRAM/1MB)}else{'?'}}),$_.DriverVersion}) -join \"`n\""])
        out = [l for l in r.splitlines() if l.strip()]
    return out


def collect_network():
    out = []
    if IS_WIN:
        r = run(["powershell", "-NoProfile", "-Command",
                 "(Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object "
                 "{'{0} | {1} | {2}' -f $_.Name,$_.LinkSpeed,$_.MacAddress}) -join \"`n\""])
        out = [l for l in r.splitlines() if l.strip()]
    else:
        r = run(["ip", "-brief", "address"]) or run(["ifconfig"])
        out = [l.strip() for l in r.splitlines() if l.strip()][:14]
    try:
        out.append(f"hostname resolves to: {socket.gethostbyname(socket.gethostname())}")
    except OSError:
        pass
    return out


def collect_processes(limit=8):
    rows = []
    if IS_WIN:
        r = run(["powershell", "-NoProfile", "-Command",
                 f"(Get-Process | Sort-Object WS -Descending | Select-Object -First {limit} | "
                 "ForEach-Object {'{0,-28} {1,10}' -f $_.ProcessName,("
                 "'{0:N0} MB' -f ($_.WS/1MB))}) -join \"`n\""])
        rows = [l for l in r.splitlines() if l.strip()]
    else:
        r = run(["ps", "-eo", "comm,pmem,rss", "--sort=-rss"]) or run(["ps", "-A", "-o", "comm,pmem,rss"])
        lines = r.splitlines()[1:]
        for line in lines[:limit]:
            parts = line.split()
            if len(parts) >= 3:
                name = " ".join(parts[:-2])[:28]
                rows.append(f"{name:<28} {parts[-1]:>10} KB  ({parts[-2]}%)")
    return rows


# --------------------------------------------------------------------------
# output
# --------------------------------------------------------------------------

def build():
    return {
        "system": collect_system(),
        "cpu": collect_cpu(),
        "memory": collect_memory(),
        "disks": collect_disks(),
        "disk_health": collect_smart(),
        "temperatures": collect_temps(),
        "battery": collect_battery(),
        "gpu": collect_gpu(),
        "network": collect_network(),
        "top_processes": collect_processes(),
    }


def render(data):
    W = 66
    L = ["=" * W, "OMNIDX SYSTEM REPORT".center(W), "=" * W, ""]

    def kv(title, mapping):
        L.append(f"-- {title.upper()} " + "-" * max(0, W - len(title) - 4))
        if not mapping:
            L.append("  (not available on this platform)")
        for k, v in mapping.items():
            if v not in (None, "", []):
                L.append(f"  {k.replace('_', ' ').title():<24} {v}")
        L.append("")

    def lst(title, items):
        L.append(f"-- {title.upper()} " + "-" * max(0, W - len(title) - 4))
        if not items:
            L.append("  (nothing reported)")
        for i in items:
            L.append(f"  {i}")
        L.append("")

    kv("System", data["system"])
    kv("Processor", data["cpu"])
    kv("Memory", data["memory"])

    L.append("-- STORAGE " + "-" * (W - 11))
    if not data["disks"]:
        L.append("  (nothing reported)")
    for d in data["disks"]:
        flag = f"  <-- {d['warning']}" if d["warning"] else ""
        L.append(f"  {d['mount']:<26} {d['used']:>10} / {d['total']:<10} "
                 f"({d['used_percent']} used, {d['free']} free){flag}")
    L.append("")

    lst("Disk health", data["disk_health"])
    lst("Temperatures", data["temperatures"])
    kv("Battery", data["battery"])
    lst("Graphics", data["gpu"])
    lst("Network interfaces", data["network"])
    lst("Top processes by memory", data["top_processes"])

    L.append("=" * W)
    L.append("Read-only snapshot. Nothing was uploaded or changed.")
    L.append("Pair this with the in-app System scan for a complete picture.")
    L.append("=" * W)
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description="OmniDx companion system report")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    ap.add_argument("--stdout", action="store_true", help="do not write a file")
    ap.add_argument("-o", "--out", default="omnidx-system-report.txt", help="output file path")
    args = ap.parse_args()

    print("Collecting system information…", file=sys.stderr)
    data = build()
    text = json.dumps(data, indent=2) if args.json else render(data)
    print(text)

    if not args.stdout:
        try:
            with open(args.out, "w", encoding="utf-8") as fh:
                fh.write(text)
            print(f"\nSaved to {os.path.abspath(args.out)}", file=sys.stderr)
        except OSError as exc:
            print(f"\nCould not write {args.out}: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
