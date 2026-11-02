@echo off
rem Double-click this file to run FacilityCare.
rem It opens two windows (backend + app) and then opens the app in your browser.
rem Keep both windows open while using the app. Close them to stop it.

title FacilityCare
cd /d "%~dp0"

echo.
echo   Starting FacilityCare...
echo.

start "FacilityCare - Backend (huwag isara)" cmd /k "cd /d "%~dp0backend" && php artisan serve --host=0.0.0.0 --port=8000"
start "FacilityCare - App (huwag isara)" cmd /k "cd /d "%~dp0frontend" && npm start -- --host 0.0.0.0"

echo   Hinihintay na mag-load ang app (mga 10-30 segundo)...
set tries=0
:wait
timeout /t 3 /nobreak >nul
set /a tries+=1
curl -s -o nul http://localhost:4200 && goto ready
if %tries% lss 60 goto wait
echo   Hindi nag-load ang app. Tingnan ang "App" window para sa error.
pause
exit /b 1

:ready
start "" http://localhost:4200
echo.
echo   Bukas na ang FacilityCare sa browser: http://localhost:4200
echo.
echo   Para sa phone (parehong Wi-Fi), ito ang IP ng PC na ito:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo     %%a
echo.
echo   Pwede mo nang isara ang window na ito.
echo   Huwag isara ang "Backend" at "App" windows habang ginagamit ang app.
echo.
pause
