@echo off
cd /d "%~dp0"
echo Starting GBRSA Invoice System (Dev Mode)...
echo Killing existing processes to release file locks...
taskkill /F /IM electron.exe /T 2>nul
taskkill /F /IM "receipt-system.exe" /T 2>nul
npm run electron:dev
pause
