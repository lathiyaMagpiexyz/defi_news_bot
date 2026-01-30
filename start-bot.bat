@echo off
echo Starting DeFi News Bot...
echo.
cd /d "%~dp0"
echo Current directory: %CD%
echo.
echo Checking Node.js...
node --version
echo.
echo Starting bot...
echo.
node node_modules/tsx/dist/cli.mjs src/index.ts
echo.
echo.
if %errorlevel% neq 0 (
    echo ERROR: Bot failed to start! Error code: %errorlevel%
    echo.
)
echo Press any key to close this window...
pause >nul
