@echo off
echo Starting DeFi News Bot...
cd /d "%~dp0"
node node_modules/tsx/dist/cli.mjs src/index.ts
pause
