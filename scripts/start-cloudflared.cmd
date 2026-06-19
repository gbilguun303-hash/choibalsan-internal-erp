@echo off
setlocal

set "APP_DIR=C:\Users\HYDN\Downloads\choibalsan_internal_app\choibalsan_internal_app"
set "CLOUDFLARED=C:\Program Files (x86)\cloudflared\cloudflared.exe"
cd /d "%APP_DIR%" || exit /b 1

if not exist logs mkdir logs

:: cloudflared аль хэдийн ажиллаж байвал дахин эхлүүлэхгүй
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*cloudflared.exe' }; if ($p) { exit 0 } else { exit 1 }"
if %ERRORLEVEL%==0 exit /b 0

:: ERP сервер (port 4000) бэлэн болтол хүлээнэ — хамгийн ихдээ 60 секунд
echo [%DATE% %TIME%] ERP сервер бэлэн болтол хүлээж байна...>> logs\cloudflared.log
set WAITED=0
:WAIT_LOOP
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %ERRORLEVEL%==0 goto SERVER_READY
set /a WAITED+=3
if %WAITED% GEQ 60 goto SERVER_READY
timeout /t 3 /nobreak >nul
goto WAIT_LOOP

:SERVER_READY
echo [%DATE% %TIME%] ERP сервер бэлэн (%WAITED%s хүлээсэн). Cloudflare tunnel эхэлж байна...>> logs\cloudflared.log
"%CLOUDFLARED%" tunnel run choibalsan-erp >> logs\cloudflared.log 2>&1
