@echo off
chcp 65001 >nul
title Nono 3D 桌面小夥伴伺服器
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo Nono 伺服器已在背景運行中，正在開啟桌面視窗...
) else (
    echo 正在背景啟動 Nono 3D 伺服器...
    start "NonoServer" /min cmd /c "set PATH=C:\Program Files\nodejs;%PATH% && cd /d "%~dp0" && npm.cmd run dev"
    timeout /t 3 /nobreak >nul
)

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000 --window-size=1180,820
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --window-size=1180,820
) else (
    start "" "http://localhost:3000"
)
exit
