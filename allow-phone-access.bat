@echo off
rem Lets phones on the same Wi-Fi reach the FacilityCare backend (port 8000).
rem Run once: right-click this file -> "Run as administrator".

title FacilityCare - Allow phone access
net session >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Kailangan itong i-run bilang administrator.
  echo   Right-click ang "allow-phone-access.bat" -^> "Run as administrator".
  echo.
  pause
  exit /b 1
)

echo.
echo   Pinapayagan ang port 8000 sa Windows Firewall...
netsh advfirewall firewall delete rule name="FacilityCare backend (port 8000)" >nul 2>nul
netsh advfirewall firewall add rule name="FacilityCare backend (port 8000)" dir=in action=allow protocol=TCP localport=8000 profile=any
if errorlevel 1 (
  echo   Hindi naidagdag ang firewall rule.
  pause
  exit /b 1
)

echo.
echo   Tapos na. Maaabot na ng phone ang backend sa port 8000 (parehong Wi-Fi).
echo   Hindi na kailangang i-run ulit ito.
echo.
pause
