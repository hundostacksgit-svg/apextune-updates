@echo off
rem OmniDx Edition: runs once, at the first sign-in after Windows installs (the USB stick's answer file calls it).
rem Copies the Edition off the stick and runs its setup in a window you can watch. The PC restarts when it is done.
set "SRC=%~dp0"
set "DST=%ProgramData%\OmniDx\Edition\source"
if not exist "%DST%" mkdir "%DST%"
robocopy "%SRC%." "%DST%" /E /XD bin /NFL /NDL /NJH /NJS /NP > nul
echo %date% %time% first sign-in: setup started from %SRC% >> "%ProgramData%\OmniDx\Edition\first-logon.txt"
start "OmniDx Edition setup" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DST%\setup.ps1"
exit /b 0
