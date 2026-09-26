@echo off
rem The filming helper, started so that a start that goes nowhere says why: each start is noted in
rem task-ran.txt, and whatever PowerShell prints (an antivirus refusal, a script error) goes to agent-out.txt.
echo %date% %time% start as %USERNAME% >> C:\film\task-ran.txt
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\film\agent.ps1 >> C:\film\agent-out.txt 2>&1
echo %date% %time% powershell ended with %errorlevel% >> C:\film\task-ran.txt
