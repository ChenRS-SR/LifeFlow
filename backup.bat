@echo off
set timestamp=%date:~0,4%%date:~5,2%%date:~8,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set timestamp=%timestamp: =0%

:: 确保上级目录的 backups 文件夹存在
if not exist "..\backups" mkdir "..\backups"

copy backend\lifeflow.db ..\backups\lifeflow-backup-%timestamp%.db
echo 备份完成: ..\backups\lifeflow-backup-%timestamp%.db
pause
