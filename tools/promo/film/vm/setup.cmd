@echo off
rem Runs once while Windows sets itself up (specialize, as SYSTEM). Only the
rem filming's own plumbing; Windows' security settings are left as they come
rem (Windows Update aside, step 3).
rem
rem 1. go.ps1 honours OMNIDX_BASE for 127.0.0.1 only. Inside this PC,
rem    127.0.0.1:8090 (the site copy) and :8787 (the licence server) are passed
rem    on to the machine filming it, which QEMU names 10.0.2.2.
setx OMNIDX_BASE http://127.0.0.1:8090 /m
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8090 connectaddress=10.0.2.2 connectport=8090
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8787 connectaddress=10.0.2.2 connectport=8787
rem 2. Edge's first-run welcome would open over the tune's report; the report is what is filmed.
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v HideFirstRunExperience /t REG_DWORD /d 1 /f
rem 3. This throwaway PC takes no Windows updates: an update installing during a
rem    restart crashed the virtual machine (take 5 of the Edition run: "KVM: entry
rem    failed" at 30%), and the first-run screen froze in take 4. Windows Update
rem    is pointed at a closed local port. The PCs the Edition and the tune are
rem    for keep Windows Update exactly as it is.
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate" /v WUServer /t REG_SZ /d http://127.0.0.1:9 /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate" /v WUStatusServer /t REG_SZ /d http://127.0.0.1:9 /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate" /v DoNotConnectToWindowsUpdateInternetLocations /t REG_DWORD /d 1 /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" /v UseWUServer /t REG_DWORD /d 1 /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" /v NoAutoUpdate /t REG_DWORD /d 1 /f
rem    Nor does it encrypt its disk by itself (Windows 11 24H2 turns BitLocker on
rem    for a new install with a TPM): the filming machine reads the PC's logs off
rem    the disk afterwards, which take 6 could not.
reg add "HKLM\SYSTEM\CurrentControlSet\Control\BitLocker" /v PreventDeviceEncryption /t REG_DWORD /d 1 /f
rem 4. Microsoft Defender watches everything on this PC but the helper's own folder. The helper asks the filming
rem    machine what to do and runs it (a window's place, a process list, a file read), which is the shape of a
rem    remote-control trojan: from takes 6 to 8 it ran at the first sign-in and never again after a restart, while
rem    every other sign-in task started. Its folder is kept out of scanning, by policy here and again at the first
rem    sign-in (agent-register.ps1). The PCs the Edition and the tune are for keep Defender as it is.
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows Defender\Exclusions" /v Exclusions_Paths /t REG_DWORD /d 1 /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows Defender\Exclusions\Paths" /v "C:\film" /t REG_SZ /d 0 /f
rem 5. The helper that tells the filming machine where things are on screen, at every sign-in. Task Scheduler's own
rem    log is switched on (Windows leaves it off), so a sign-in where the helper never starts says why.
wevtutil sl Microsoft-Windows-TaskScheduler/Operational /e:true
schtasks /create /tn FilmAgent /xml C:\film\agent-task.xml /f > C:\film\setup-log.txt 2>&1
netsh interface portproxy show all >> C:\film\setup-log.txt 2>&1
exit /b 0
