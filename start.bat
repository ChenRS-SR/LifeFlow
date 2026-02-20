@echo off
chcp 65001 >nul
echo ==========================================
echo    LifeFlow 一键启动脚本
echo ==========================================
echo.

:: 设置路径
set BACKEND_DIR=%~dp0backend
set FRONTEND_DIR=%~dp0frontend
set VENV_PYTHON=%BACKEND_DIR%\venv\Scripts\python.exe
set VENV_PIP=%BACKEND_DIR%\venv\Scripts\pip.exe

echo [1/5] 清理旧进程...
taskkill /f /im python.exe 2>nul
taskkill /f /im uvicorn.exe 2>nul
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak >nul
echo     完成
echo.

echo [2/5] 检查环境...
if not exist "%VENV_PYTHON%" (
    echo     错误: 虚拟环境不存在，请先运行安装脚本
    pause
    exit /b 1
)
echo     完成
echo.

echo [3/5] 启动后端服务...
cd /d "%BACKEND_DIR%"
start "LifeFlow 后端" cmd /k "echo 正在启动后端... && %VENV_PYTHON% -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo     等待后端启动...
:wait_backend
timeout /t 1 /nobreak >nul
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 1 -ErrorAction Stop; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"
if errorlevel 1 goto wait_backend
echo     后端已就绪
echo.

echo [4/5] 启动前端服务...
cd /d "%FRONTEND_DIR%"
start "LifeFlow 前端" cmd /k "npm run dev"
echo     完成
echo.

echo [5/5] 打开浏览器...
timeout /t 3 /nobreak >nul
start http://localhost:3000
echo     完成
echo.

echo ==========================================
echo    启动成功！
echo    前端: http://localhost:3000
echo    后端: http://127.0.0.1:8000
echo ==========================================
echo.
echo 提示: 关闭弹出的两个命令行窗口即可停止服务
echo.
pause
