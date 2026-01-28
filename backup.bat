@echo off
setlocal

:: --------------------------------------------------------
:: PROJECT SOURCE BACKUP SCRIPT (FIXED)
:: --------------------------------------------------------

:: 1. Get robust timestamp using PowerShell (Avoids locale issues)
for /f "usebackq tokens=*" %%a in (`powershell -Command "Get-Date -Format 'yyyy-MM-dd_HHmm'"`) do set "TIMESTAMP=%%a"

:: 2. Robust Path Handling
:: %~dp0 contains a trailing backslash which escapes quotes in some commands.
:: We strip it here to be safe.
set "SOURCE=%~dp0"
if "%SOURCE:~-1%"=="\" set "SOURCE=%SOURCE:~0,-1%"

set "BACKUP_ROOT=%SOURCE%\.."
set "DEST=%BACKUP_ROOT%\Source_%TIMESTAMP%"

echo.
echo ========================================================
echo   BACKING UP PROJECT SOURCE CODE
echo ========================================================
echo.
echo   [Time]    %TIMESTAMP%
echo   [Source]  "%SOURCE%"
echo   [Target]  "%DEST%"
echo.
echo   Please wait...

:: 3. Run Robocopy
:: Uses simple quotes around paths that now definitely don't have trailing backslashes.
robocopy "%SOURCE%" "%DEST%" /E /XD "node_modules" ".git" ".gemini" "dist" "dist_electron" "dist-electron" "dist_electron_beta" ".vscode" ".idea" "coverage" "release" /XF "*.log" "*.tmp" "Backup_Source_Code.bat" /R:0 /W:0 /NJH /NJS

if %ERRORLEVEL% GTR 7 (
    echo.
    echo   [ERROR] Backup encountered errors.
    pause
    exit /b
)

echo.
echo   [COMPRESSING] Zipping backup folder...
echo.

set "ZIP_FILE=%BACKUP_ROOT%\gbrsa-invoice-system_%TIMESTAMP%.zip"

powershell -Command "Compress-Archive -Path '%DEST%\*' -DestinationPath '%ZIP_FILE%'"

if exist "%ZIP_FILE%" (
    echo.
    echo   [CLEANUP] Removing temporary folder...
    rmdir /s /q "%DEST%"
    echo.
    echo   [SUCCESS] Backup Zipped: %ZIP_FILE%
) else (
    echo.
    echo   [ERROR] Failed to create zip file.
)

echo.
echo ========================================================
echo.
echo Closing in 3 seconds...
timeout /t 3
exit
