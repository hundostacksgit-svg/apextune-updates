#!/usr/bin/env bash
# Films the tune on a clean Windows 11 PC, through a real restart.
#
# The PC is a virtual machine on this Linux machine (KVM): Windows 11
# Enterprise, the evaluation image straight from Microsoft, installed
# unattended (autounattend.xml) onto an empty NVMe disk, with a TPM 2.0 and
# Secure Boot on, as Windows 11 expects. Its screen is recorded from here, so
# the recording runs on through the restart; its mouse and keyboard are
# driven from here (director.py), so they are the PC's own hardware input.
#
# The one thing staged is the licence check, as in ../film.ps1: the typed
# line fetches the real go.ps1 from omnidx.net, which (through OMNIDX_BASE,
# 127.0.0.1 only) takes the tune from a copy of the site served here, whose
# config names a licence server also here: the real Worker code under Node,
# issuing the key the way the key page does after a payment.
#
#   tools/promo/film/vm/run.sh OUT_DIR [--extreme]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../../.." && pwd)
OUT=$(realpath -m "$1"); shift
WORK=${WORK:-/mnt/film}
ISO=${ISO:-$WORK/iso/win11-enterprise-eval.iso}
ISO_URL='https://go.microsoft.com/fwlink/?linkid=2334167&clcid=0x409&culture=en-us&country=us'
mkdir -p "$OUT"
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$OUT/run-log.txt"; }
trap 'log "stopped at line $LINENO: $BASH_COMMAND"' ERR
sudo mkdir -p "$WORK" && sudo chown "$(id -u):$(id -g)" "$WORK"
mkdir -p "$(dirname "$ISO")"
df -h / /mnt 2>&1 | tee -a "$OUT/run-log.txt" || true

# ---------------------------------------------------------------- the machine
echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules >/dev/null
sudo udevadm control --reload-rules && sudo udevadm trigger --name-match=kvm
[ -w /dev/kvm ] || { log 'no KVM on this machine'; exit 1; }
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq qemu-system-x86 qemu-system-gui qemu-utils ovmf swtpm swtpm-tools genisoimage xvfb x11-utils ffmpeg python3-pil >/dev/null
log "qemu $(qemu-system-x86_64 --version | head -1)"

if [ ! -s "$ISO" ]; then
  log 'downloading the Windows 11 Enterprise evaluation image from Microsoft'
  curl -sSL --fail --retry 3 -o "$ISO" "$ISO_URL"
fi
log "image $(du -h "$ISO" | cut -f1) $(sha256sum "$ISO" | cut -c1-16)"

# The answers disc: autounattend.xml at its root, the helpers in film\.
ANS=$WORK/answer; rm -rf "$ANS"; mkdir -p "$ANS/film"
cp "$HERE/autounattend.xml" "$ANS/"
sed 's/$/\r/' "$HERE/setup.cmd" > "$ANS/film/setup.cmd"
cp "$HERE/agent.ps1" "$ANS/film/"
{ printf '\xff\xfe'; iconv -f UTF-8 -t UTF-16LE "$HERE/agent-task.xml"; } > "$ANS/film/agent-task.xml"
genisoimage -quiet -J -r -V ANSWERS -o "$WORK/answer.iso" "$ANS"

# ---------------------------------------------------------------- the site copy and the licence server
SITE=$WORK/site; rm -rf "$SITE"; mkdir -p "$SITE/tune"
cp "$REPO/go.ps1" "$SITE/"; cp -r "$REPO/tune/." "$SITE/tune/"
python3 - "$SITE/tune/config.json" <<'PY'
import json, sys
p = sys.argv[1]; c = json.load(open(p)); c['api'] = 'http://127.0.0.1:8787'
open(p, 'w').write(json.dumps(c, indent=2))
PY
python3 -m http.server 8090 --bind 127.0.0.1 --directory "$SITE" > "$OUT/site-log.txt" 2>&1 &
(cd "$REPO" && node tools/worker-serve.mjs --port 8787 --key-file "$WORK/key.txt" --log "$OUT/worker-serve.txt" > "$OUT/worker-out.txt" 2>&1 &)
for i in $(seq 60); do
  if curl -sf http://127.0.0.1:8787/v1/health >/dev/null && curl -sf http://127.0.0.1:8090/go.ps1 >/dev/null && [ -s "$WORK/key.txt" ]; then break; fi
  sleep 0.5
done
[ -s "$WORK/key.txt" ] || { log 'the site copy or licence server did not start'; exit 1; }
log "licence server up; key issued ($(cut -c1-9 "$WORK/key.txt")...)"

# ---------------------------------------------------------------- the PC
# The TPM: swtpm keeps its state where Ubuntu's AppArmor profile for it lets it write (libvirt's per-user folder).
TPM=$HOME/.local/share/libvirt/swtpm/film
rm -rf "$TPM"; mkdir -p "$TPM"
swtpm socket --tpm2 --tpmstate dir="$TPM" --ctrl type=unixio,path="$TPM/sock" --daemon --log file="$TPM/swtpm.log",level=1 \
  || { log 'swtpm did not start'; cat "$TPM/swtpm.log" 2>/dev/null | tail -5; sudo dmesg | grep -i 'apparmor.*swtpm' | tail -5; exit 1; }
for i in $(seq 20); do [ -S "$TPM/sock" ] && break; sleep 0.25; done
log "TPM up"
cp /usr/share/OVMF/OVMF_VARS_4M.ms.fd "$WORK/vars.fd"
rm -f "$WORK/win.qcow2"; qemu-img create -q -f qcow2 "$WORK/win.qcow2" 80G
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp > "$OUT/xvfb.txt" 2>&1 &
sleep 2
rm -f "$WORK/qmp.sock"
# The clock: the PC keeps local time, US Eastern, like a PC set up there.
DISPLAY=:99 TZ=America/New_York qemu-system-x86_64 -name 'Windows 11' \
  -enable-kvm -machine q35,smm=on -cpu host -smp 4 -m 8G \
  -global driver=cfi.pflash01,property=secure,value=on \
  -drive if=pflash,format=raw,unit=0,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.secboot.fd \
  -drive if=pflash,format=raw,unit=1,file="$WORK/vars.fd" \
  -chardev socket,id=chrtpm,path="$TPM/sock" -tpmdev emulator,id=tpm0,chardev=chrtpm -device tpm-crb,tpmdev=tpm0 \
  -drive if=none,id=disk0,file="$WORK/win.qcow2",format=qcow2,cache=unsafe,discard=unmap -device nvme,serial=OMNIDX0001,drive=disk0,bootindex=1 \
  -drive if=none,id=cd0,media=cdrom,readonly=on,file="$ISO" -device ide-cd,id=cdrom0,drive=cd0,bus=ide.0,bootindex=0 \
  -drive if=none,id=cd1,media=cdrom,readonly=on,file="$WORK/answer.iso" -device ide-cd,id=cdrom1,drive=cd1,bus=ide.1 \
  -netdev user,id=n0 -device e1000e,netdev=n0 \
  -device qemu-xhci,id=xhci -device usb-tablet,bus=xhci.0 \
  -device VGA,vgamem_mb=64,edid=on,xres=1920,yres=1080 \
  -display sdl -rtc base=localtime \
  -qmp unix:"$WORK/qmp.sock",server=on,wait=off \
  > "$OUT/qemu.txt" 2>&1 &
QEMU=$!
log "PC started (pid $QEMU)"

DISPLAY=:99 python3 "$HERE/director.py" --qmp "$WORK/qmp.sock" --out "$OUT" --key "$(cat "$WORK/key.txt")" --display :99 --boot-keys 30 "$@" || log "director exited $?"
wait "$QEMU" 2>/dev/null || true
cp "$TPM/swtpm.log" "$OUT/swtpm.txt" 2>/dev/null || true
log 'done'
ls -la "$OUT" | tee -a "$OUT/run-log.txt"
