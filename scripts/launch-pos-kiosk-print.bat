@echo off
setlocal

rem Launch Laundry POS with Chromium silent-printing enabled.
rem Set a real receipt printer as the Windows default printer before using this launcher.
set "APP_URL=https://laundry-pos-web-production.up.railway.app"
set "PROFILE=%LOCALAPPDATA%\LaundryPOS-KioskProfile"
set "BROWSER="

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined BROWSER (
  echo Microsoft Edge or Google Chrome was not found.
  echo Install Edge or Chrome, then run this file again.
  pause
  exit /b 1
)

start "Laundry POS" "%BROWSER%" --no-first-run --no-default-browser-check --kiosk-printing --app="%APP_URL%" --user-data-dir="%PROFILE%"
exit /b 0
