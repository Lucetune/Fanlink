@echo off
echo ========================================
echo  Lucetune Fanlink 自动上传脚本
echo  目标分支：test-fanlink
echo ========================================
echo.

REM 切换到脚本所在目录
cd /d "%~dp0"

REM 切换分支
git switch test-fanlink

REM 添加所有更改
git add .

REM 提交（自动生成时间戳备注）
git commit -m "Auto update on %date% %time%"

REM 推送到 GitHub
git push origin test-fanlink

echo.
echo ✅ 上传完成！
echo.
pause