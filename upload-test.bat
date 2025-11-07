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

REM 强制推送到远程 test-fanlink
git push -f origin test-fanlink

echo.
echo ========================================
echo 上传完成!
echo ========================================
pause