@echo off
cd /d "%~dp0"
node -e "const [major,minor]=process.versions.node.split('.').map(Number);if(major<24||(major===24&&minor<13))process.exit(1)" >nul 2>&1
if errorlevel 1 (
  echo Instale Node.js 24.13 ou superior para executar o sistema.
  pause
  exit /b 1
)
node -e "require.resolve('tsx'); require.resolve('cheerio'); require.resolve('nodemailer')" >nul 2>&1
if errorlevel 1 (
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node scripts/check-running.mjs
if errorlevel 2 (
  pause
  exit /b 1
)
if not errorlevel 1 exit /b 0
call npm start
pause
