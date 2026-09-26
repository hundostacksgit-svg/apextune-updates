@echo off
rem Runs once, at the first sign-in (FirstLogonCommands). The filming helper's
rem sign-in task for this account, run at once; and the helper started
rem directly as well, in case neither task starts (agent.ps1 keeps to one copy).
echo %date% %time% first-logon as %USERNAME% >> C:\film\first-logon.txt
schtasks /query /tn FilmAgent >> C:\film\first-logon.txt 2>&1
schtasks /create /tn FilmAgentUser /sc onlogon /ru "%USERDOMAIN%\%USERNAME%" /it /rl highest /tr "conhost.exe --headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\film\agent.ps1" /f >> C:\film\first-logon.txt 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\film\agent-register.ps1 >> C:\film\first-logon.txt 2>&1
schtasks /run /tn FilmAgent >> C:\film\first-logon.txt 2>&1
schtasks /run /tn FilmAgentUser >> C:\film\first-logon.txt 2>&1
start "" conhost.exe --headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\film\agent.ps1
exit /b 0
