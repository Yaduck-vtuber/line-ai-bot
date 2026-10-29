@echo off
chcp 65001 >nul
title Nono 3D 桌面小夥伴啟動器
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

echo 正在清理可能殘留的背景視窗行程...
taskkill /f /im electron.exe >nul 2>nul

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [✓] Nono 伺服器已在背景運行中！
) else (
    echo [i] 正在啟動 Nono 伺服器...
    start "NonoServer" /min cmd /c "set PATH=C:\Program Files\nodejs;%PATH% && cd /d "%~dp0" && npm.cmd run dev"
    echo 正在等待伺服器準備完成...
    timeout /t 4 /nobreak >nul
)

echo 正在啟動 Nono 無邊框去背桌面視窗...
if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000 --window-size=1220,840
) else (
    start "" "http://localhost:3000"
)
exit
