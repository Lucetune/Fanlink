chcp 65001 >nul
@echo off
REM ========================================
REM Lucetune Fanlink 自动上传脚本 - test分支
REM ========================================

REM 进入你的本地仓库
cd /d "C:\(A) Document\lucetune fanlink\Fanlink"

REM 确保在 test-fanlink 分支
git checkout test-fanlink

REM 添加所有更改
git add -A

REM 提交，时间戳自动生成
for /f "tokens=2-4 delims=/- " %%a in ('date /t') do set mydate=%%c/%%a/%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set mytime=%%a:%%b
git commit -m "Auto update on %mydate% %mytime%"

REM 无限重试上传
:retry_push
REM 强制推送到远程 test-fanlink
git push -f origin test-fanlink

REM 检查是否上传成功
if %errorlevel% neq 0 (
    REM 上传失败，显示错误并重试
    echo 上传失败，正在重试...
    timeout /t 5 >nul
    goto retry_push
)

echo.
echo ========================================
echo 上传完成!
echo ========================================
pause