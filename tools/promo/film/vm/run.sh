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
# --edition: the PC installs OmniDx Edition from the answer disc at its first sign-in (edition/, with a key for the tune).
EDITION=0; for a in "$@"; do [ "$a" = "--edition" ] && EDITION=1; done
PREFIX=${PREFIX:-restart}
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
sleep 2
[ -e /dev/kvm ] && [ ! -w /dev/kvm ] && sudo chmod 666 /dev/kvm
log "kvm: $(ls -l /dev/kvm 2>&1); cpu: $(lscpu | grep -i -E 'virtualization|model name' | tr -s ' ' | tr '\n' ';')"
[ -w /dev/kvm ] || { log 'no KVM on this machine'; exit 1; }
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq qemu-system-x86 qemu-system-gui qemu-utils ovmf swtpm swtpm-tools genisoimage xvfb x11-utils xdotool ffmpeg python3-pil ntfs-3g >/dev/null
log "qemu $(qemu-system-x86_64 --version | head -1)"

if [ ! -s "$ISO" ]; then
  log 'downloading the Windows 11 Enterprise evaluation image from Microsoft'
  curl -sSL --fail --retry 3 -o "$ISO" "$ISO_URL"
fi
log "image $(du -h "$ISO" | cut -f1) $(sha256sum "$ISO" | cut -c1-16)"

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

# The answers disc: autounattend.xml at its root, the helpers in film\. With --edition, also OmniDx Edition in
# omnidx\edition (what the USB stick carries) and the key in omnidx\key.txt, and the first sign-in starts its setup.
ANS=$WORK/answer; rm -rf "$ANS"; mkdir -p "$ANS/film"
cp "$HERE/autounattend.xml" "$ANS/"
tr -d '\r' < "$HERE/setup.cmd" | sed 's/$/\r/' > "$ANS/film/setup.cmd"
{ grep -v '^exit /b 0' "$HERE/first-logon.cmd"
  [ "$EDITION" = 1 ] && echo 'for %%d in (D E F G H I J K L M) do if exist %%d:\omnidx\edition\first-logon.cmd call %%d:\omnidx\edition\first-logon.cmd'
  echo 'exit /b 0'; } | tr -d '\r' | sed 's/$/\r/' > "$ANS/film/first-logon.cmd"
cp "$HERE/agent.ps1" "$ANS/film/"
{ printf '\xff\xfe'; iconv -f UTF-8 -t UTF-16LE "$HERE/agent-task.xml"; } > "$ANS/film/agent-task.xml"
if [ "$EDITION" = 1 ]; then
  mkdir -p "$ANS/omnidx/edition"
  (cd "$REPO/edition" && git ls-files | grep -v '^ci/' | while read -r f; do mkdir -p "$ANS/omnidx/edition/$(dirname "$f")"; cp "$f" "$ANS/omnidx/edition/$f"; done)
  sed -i 's/\r*$/\r/' "$ANS/omnidx/edition/first-logon.cmd"
  cp "$WORK/key.txt" "$ANS/omnidx/key.txt"
  log "OmniDx Edition on the answer disc: $(find "$ANS/omnidx" -type f | wc -l) files"
fi
genisoimage -quiet -J -r -V ANSWERS -o "$WORK/answer.iso" "$ANS"

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
# Larger than the PC's screen: QEMU's window opens centred at the firmware's small size and grows from there.
Xvfb :99 -screen 0 3200x1800x24 -nolisten tcp > "$OUT/xvfb.txt" 2>&1 &
sleep 2
rm -f "$WORK/qmp.sock"
# The clock: the PC keeps local time, US Eastern, like a PC set up there. The CPU is the host's without its own
# virtualization extensions: with them, Windows 11 starts its hypervisor for memory integrity, and on some Intel
# hosts that nested start kills the machine ("KVM: entry failed"). Memory integrity is then simply unavailable.
DISPLAY=:99 TZ=America/New_York qemu-system-x86_64 -name 'Windows 11' \
  -enable-kvm -machine q35,smm=on -cpu host,-vmx,-svm -smp 4 -m 8G \
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

# While it runs: the newest screenshot and the logs, every five minutes, on a pre-release of their own,
# so a take can be looked at before it ends.
if [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GH_TOKEN:-}" ]; then
  (
    tag="$PREFIX-progress-${GITHUB_RUN_ID:-local}"
    gh release create "$tag" --repo "$GITHUB_REPOSITORY" --prerelease --title "$PREFIX take in progress" --notes "Progress of a filming run; deleted by the next run." >/dev/null 2>&1 || true
    while kill -0 "$QEMU" 2>/dev/null; do
      sleep 300
      latest=$(ls -t "$OUT"/*.png 2>/dev/null | head -1)
      [ -n "$latest" ] && cp "$latest" "$WORK/progress.png"
      gh release upload "$tag" --repo "$GITHUB_REPOSITORY" --clobber "$OUT/director-log.txt" "$OUT/run-log.txt" ${latest:+"$WORK/progress.png"} >/dev/null 2>&1 || true
    done
  ) &
fi

DISPLAY=:99 python3 "$HERE/director.py" --qmp "$WORK/qmp.sock" --out "$OUT" --key "$(cat "$WORK/key.txt")" --display :99 --boot-keys 30 "$@" || log "director exited $?"
# The director quits the PC when it is done; when it gave up instead, the PC is stopped here.
for i in $(seq 30); do kill -0 "$QEMU" 2>/dev/null || break; sleep 1; done
kill "$QEMU" 2>/dev/null || true
wait "$QEMU" 2>/dev/null || true
cp "$TPM/swtpm.log" "$OUT/swtpm.txt" 2>/dev/null || true

# The PC's own logs, read from its disk (read-only) once it is off: the helper's, Windows Setup's, the tune's.
(
  set +e
  sudo modprobe nbd max_part=8
  sudo qemu-nbd --read-only -c /dev/nbd0 "$WORK/win.qcow2" && sleep 3
  sudo mkdir -p /mnt/win
  part=$(lsblk -lnbo NAME,SIZE,TYPE /dev/nbd0 | awk '$3 == "part"' | sort -k2 -n | tail -1 | cut -d' ' -f1)
  echo "Windows partition: $part"
  sudo ntfs-3g -o ro,remove_hiberfile "/dev/$part" /mnt/win || sudo ntfs-3g -o ro,force "/dev/$part" /mnt/win
  mkdir -p "$OUT/disk"
  for f in film/agent-log.txt film/setup-log.txt film/first-logon.txt Windows/Panther/UnattendGC/setupact.log Windows/Panther/UnattendGC/setuperr.log Windows/Panther/setuperr.log Windows/System32/Tasks/FilmAgent Windows/System32/Tasks/FilmAgentUser ProgramData/OmniDx/Edition/setup-log.txt ProgramData/OmniDx/Edition/first-logon.txt ProgramData/OmniDx/Edition/undo-setup.tsv ProgramData/OmniDx/Edition/presets-undo.tsv ProgramData/OmniDx/Edition/edition.json Users/User/AppData/Local/OmniDx/edition-log.txt; do
    [ -f "/mnt/win/$f" ] && sudo cp "/mnt/win/$f" "$OUT/disk/$(echo "$f" | tr '/' '_')"
  done
  [ -d /mnt/win/OmniDx ] && sudo find /mnt/win/OmniDx -maxdepth 1 -type f \( -name '*.txt' -o -name '*.json' -o -name '*.html' \) -exec cp {} "$OUT/disk/" \;
  sudo ls /mnt/win/film > "$OUT/disk/film-folder.txt" 2>&1
  sudo chown -R "$(id -u):$(id -g)" "$OUT/disk"
  sudo umount /mnt/win; sudo qemu-nbd -d /dev/nbd0
) >> "$OUT/run-log.txt" 2>&1
log "read the PC's disk: $(ls "$OUT/disk" 2>/dev/null | tr '\n' ' ')"
log 'done'
ls -la "$OUT" | tee -a "$OUT/run-log.txt"
