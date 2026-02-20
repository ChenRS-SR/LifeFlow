@echo off
chcp 65001 >nul
echo ==========================================
echo    LifeFlow 安装脚本
echo ==========================================
echo.

set BACKEND_DIR=%~dp0backend
set FRONTEND_DIR=%~dp0frontend

:: 检查 Python
echo [1/4] 检查 Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo     错误: 未安装 Python，请先安装 Python 3.11+
    pause
    exit /b 1
)
echo     完成
echo.

:: 检查 Node
echo [2/4] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo     错误: 未安装 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)
echo     完成
echo.

:: 安装后端依赖
echo [3/4] 安装后端依赖...
cd /d "%BACKEND_DIR%"
if not exist "venv" (
    echo     创建虚拟环境...
    python -m venv venv
)
echo     激活虚拟环境并安装依赖...
call venv\Scripts\activate.bat
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
echo     完成
echo.

:: 安装前端依赖
echo [4/4] 安装前端依赖...
cd /d "%FRONTEND_DIR%"
echo     安装 npm 包...
npm install --registry=https://registry.npmmirror.com
echo     完成
echo.

echo ==========================================
echo    安装完成！
echo    现在可以运行 start.bat 启动服务
echo ==========================================
pause
