@echo off
rem Runs once while Windows sets itself up (specialize, as SYSTEM). Only the
rem filming's own plumbing; Windows' security settings are left as they come.
rem
rem 1. go.ps1 honours OMNIDX_BASE for 127.0.0.1 only. Inside this PC,
rem    127.0.0.1:8090 (the site copy) and :8787 (the licence server) are passed
rem    on to the machine filming it, which QEMU names 10.0.2.2.
setx OMNIDX_BASE http://127.0.0.1:8090 /m
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8090 connectaddress=10.0.2.2 connectport=8090
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8787 connectaddress=10.0.2.2 connectport=8787
rem 2. Edge's first-run welcome would open over the tune's report; the report is what is filmed.
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v HideFirstRunExperience /t REG_DWORD /d 1 /f
rem 3. The helper that tells the filming machine where things are on screen, at every sign-in.
schtasks /create /tn FilmAgent /xml C:\film\agent-task.xml /f
exit /b 0
