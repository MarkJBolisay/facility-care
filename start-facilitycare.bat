@echo off
rem Double-click this file to run FacilityCare.
rem It opens two windows (backend + app) and then opens the app in your browser.
rem Keep both windows open while using the app. Close them to stop it.

title FacilityCare
cd /d "%~dp0"

echo.
echo   Starting FacilityCare...
echo.

rem Use "php" if it is installed, otherwise the PHP that comes with XAMPP.
set "PHP=php"
where php >nul 2>nul || set "PHP=C:\xampp\php\php.exe"
if not "%PHP%"=="php" if not exist "%PHP%" (
  echo   Hindi makita ang PHP. I-install ang XAMPP sa C:\xampp o idagdag ang php sa PATH.
  pause
  exit /b 1
)

rem --host=0.0.0.0 lets phones on the same Wi-Fi reach the backend.
start "FacilityCare - Backend (huwag isara)" cmd /k "cd /d "%~dp0backend" && "%PHP%" artisan serve --host=0.0.0.0 --port=8000"
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
echo   PARA SA PHONE APP (dapat parehong Wi-Fi):
echo   Sa login screen ng app, i-tap ang "Server" at i-type ang isa sa mga ito:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo       %%b:8000
echo.
echo   Kung "not reachable" pa rin sa phone, i-run ang "allow-phone-access.bat"
echo   (right-click, Run as administrator) para payagan ng firewall ang port 8000.
echo.
echo   Pwede mo nang isara ang window na ito.
echo   Huwag isara ang "Backend" at "App" windows habang ginagamit ang app.
echo.
pause
