@echo off
cd /d "%~dp0"
echo Killing existing processes to release file locks...
taskkill /F /IM "GBRSA Invoice System.exe" 2>nul
taskkill /F /IM "electron.exe" 2>nul
timeout /t 2 /nobreak >nul

echo Building GBRSA Invoice System (.exe)...
echo Cleaning previous build artifacts...
if exist "dist_electron" (
    echo Removing old dist_electron folder...
    rmdir /s /q "dist_electron"
)
if exist "dist_electron" (
    echo ERROR: Could not remove dist_electron. Check if files are still open.
    pause
    exit /b 1
)

echo This may take a minute.
call npm run electron:build
if %errorlevel% neq 0 (
    echo Build Failed! Check errors above.
    pause
    exit /b %errorlevel%
)
echo Build Successful!
echo Installer is in dist-electron folder.
explorer "dist-electron"
pause
