@echo off
title بوابة الموظفين - Eskaros Attendance
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js غير مثبت على هذا الجهاز.
  echo حمّل النسخة LTS من https://nodejs.org ثم شغّل هذا الملف مرة أخرى.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\pg\package.json" (
  echo.
  echo جارٍ تثبيت الحزم (مرة واحدة فقط)...
  call npm install --omit=dev
  if errorlevel 1 (
    echo.
    echo تعذّر تثبيت الحزم. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo ============================================
echo    بوابة الموظفين - جارٍ التشغيل...
echo ============================================
echo.
echo اترك هذه النافذة مفتوحة أثناء استخدام التطبيق.
echo للإيقاف اضغط Ctrl+C.
echo.

node server\index.js
echo.
pause
