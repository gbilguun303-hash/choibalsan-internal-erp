@echo off
setlocal

set "APP_DIR=C:\Users\HYDN\Downloads\choibalsan_internal_app\choibalsan_internal_app"
cd /d "%APP_DIR%" || exit /b 1

if not exist logs mkdir logs

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %ERRORLEVEL%==0 exit /b 0

echo [%DATE% %TIME%] Starting ERP server...>> logs\erp-server.log
node server.js >> logs\erp-server.log 2>&1
