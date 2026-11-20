@echo off
title DLB AUTO MARKETING - Live Server & Cloudflare Tunnel
echo ====================================================
echo Starting DLB AUTO MARKETING Fullstack Server...
echo ====================================================
start /B npx tsx src/index.ts
timeout /t 4 /nobreak >nul
echo.
echo ====================================================
echo Connecting Cloudflare Live Public Tunnel...
echo Copy the https://*.trycloudflare.com link below!
echo Anyone can open it on Mobile or PC anywhere!
echo ====================================================
.\scripts\cloudflared.exe tunnel --url http://localhost:3001
pause
