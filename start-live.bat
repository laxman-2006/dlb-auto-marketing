@echo off
title DLB AUTO MARKETING - Live Web Link
color 0A
cls
echo ================================================================
echo           DLB AUTO MARKETING - LIVE SERVER LAUNCHER            
echo ================================================================
echo.
echo [1/2] Starting backend server on port 3001...
start "DLB Backend Server" /min cmd /c "npx tsx src/index.ts"
timeout /t 4 /nobreak >nul

echo [2/2] Connecting Cloudflare Live Public Tunnel...
echo.
echo ================================================================
echo   COPY THE LINK BELOW (starts with https://....trycloudflare.com)
echo   Aap ye link kisi ko bhi Mobile ya PC par bhej sakte hain!
echo   (Is window ko BAND MAT KAREIN jab tak live rakhna ho)
echo ================================================================
echo.
.\scripts\cloudflared.exe tunnel --url http://localhost:3001
pause
