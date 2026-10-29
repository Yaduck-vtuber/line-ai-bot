@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

REM Clean up any stale electron processes
taskkill /f /im electron.exe >nul 2>nul

REM Check if server is running on port 3000
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Starting Nono local server on port 3000...
    start "NonoServer" /min cmd /c "set PATH=C:\Program Files\nodejs;%%PATH%% && cd /d ""%~dp0"" && npm.cmd run dev"
    ping 127.0.0.1 -n 4 >nul
) else (
    echo Nono server is already running on http://localhost:3000
)

REM Launch desktop window
echo Launching Nono desktop companion...
if exist "%~dp0node_modules\electron\cli.js" (
    start "NonoDesktop" /min cmd /c "set PATH=C:\Program Files\nodejs;%%PATH%% && cd /d ""%~dp0"" && node ""node_modules\electron\cli.js"" electron-main.cjs"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000 --window-size=1220,840
) else (
    start "" "http://localhost:3000"
)

ping 127.0.0.1 -n 2 >nul
exit /b 0
