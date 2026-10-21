@echo off
title SmartCNC - Controleur CNC GRBL 1.1 (Arduino Uno + CNC Shield V3.0)
color 0B
echo ============================================================================
echo   SMART CNC - Interface de Commande GRBL 1.1 (Arduino Uno + CNC Shield V3)
echo ============================================================================
echo.
echo Demarrage du serveur SmartCNC sur http://localhost:3000 ...
echo Ouverture automatique du navigateur dans 3 secondes...
echo.
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
call npm.cmd run dev
pause
