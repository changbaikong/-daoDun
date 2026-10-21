@echo off
setlocal
cd /d "%~dp0"

echo.
echo   ============================================
echo    Jk Blog - local launcher
echo   ============================================
echo.

if not exist "data\master.db" (
  echo   [setup] demo data not found, seeding...
  call npm run seed
  echo.
)

echo   Starting server in a new window...
echo   (close the "Jk Blog Server" window to stop it)
start "Jk Blog Server" cmd /k "npm start"

echo   Waiting for the server...
ping -n 4 127.0.0.1 >nul

start "" "http://127.0.0.1:4173/"

echo.
echo   URL: http://127.0.0.1:4173/
echo   If the browser did not open, copy the URL above and open it manually.
echo.
echo   Press any key to close this launcher window.
pause >nul
endlocal
exit
