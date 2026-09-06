@echo off
REM Starts ApexTune Diagnostics. Double-click this file.
setlocal
set "HERE=%~dp0"

REM Find a Python 3 interpreter. Each check is its own statement, because
REM "if cond cmd && cmd" parses ambiguously in cmd.exe.
set "PY="
where /q py.exe && set "PY=py"
if defined PY goto :run
where /q python.exe && set "PY=python"
if defined PY goto :run
where /q python3.exe && set "PY=python3"
if defined PY goto :run
goto :nopython

:run
"%PY%" "%HERE%apextune.py" %*
set "RC=%errorlevel%"
if not "%RC%"=="0" pause
exit /b %RC%

:nopython
echo.
echo   Python 3 was not found on this PC.
echo.
echo   Install it from https://www.python.org/downloads/ and tick
echo   "Add python.exe to PATH" during setup, or get it from the
echo   Microsoft Store. Then run this again.
echo.
pause
exit /b 1
