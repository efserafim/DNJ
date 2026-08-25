@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Iniciando o DNJ 2026 com banco automatico...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 pause
