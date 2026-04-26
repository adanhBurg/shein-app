@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "APP_DIR=%ROOT_DIR%lamar-shein"
set "FRONTEND_PORT=8181"
set "BACKEND_PORT=8787"
set "FRONTEND_URL=http://localhost:%FRONTEND_PORT%"

title Lamar SHEIN Local Launcher

echo.
echo ========================================
echo   Lamar SHEIN - Local Dev Launcher
echo ========================================
echo.

if not exist "%APP_DIR%\package.json" (
  echo Could not find "%APP_DIR%\package.json".
  echo Make sure this file is in the repository root.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js LTS from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  echo Reinstall Node.js LTS from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

cd /d "%APP_DIR%"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check the error above.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo Starting backend on http://localhost:%BACKEND_PORT% ...
start "Lamar SHEIN Backend" cmd /k "cd /d ""%APP_DIR%"" && set ""PORT=%BACKEND_PORT%"" && set ""CORS_ORIGIN=%FRONTEND_URL%"" && npm.cmd run backend"

echo Starting React frontend on %FRONTEND_URL% ...
start "Lamar SHEIN Frontend" cmd /k "cd /d ""%APP_DIR%"" && npm.cmd run dev -- --host 127.0.0.1 --port %FRONTEND_PORT%"

echo.
echo ========================================
echo   App is starting
echo ========================================
echo.
echo Frontend URL:
echo   %FRONTEND_URL%
echo.
echo Backend API:
echo   http://localhost:%BACKEND_PORT%
echo.
echo Keep the two opened terminal windows running while using the app.
echo To stop the app, press Ctrl+C in both opened windows.
echo.
pause
