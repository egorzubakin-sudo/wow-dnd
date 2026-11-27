@echo off
where py >nul 2>nul
if errorlevel 1 goto python
py -3 "%~dp0start-atlas.py"
if errorlevel 1 pause
exit /b

:python
where python >nul 2>nul
if errorlevel 1 goto missing
python "%~dp0start-atlas.py"
if errorlevel 1 pause
exit /b

:missing
echo Install Python 3 from https://www.python.org/downloads/ and try again.
pause
