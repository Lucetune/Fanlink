@echo off
REM ========================================
REM Lucetune Fanlink - Merge test-fanlink to main
REM ========================================

echo =======================================
echo Starting merge from test-fanlink to main
echo =======================================

REM 保存本地改动（stash）
git stash -u

REM 切换到 test-fanlink
git checkout test-fanlink
git pull origin test-fanlink

REM 切换到 main，强制覆盖本地
git checkout main

REM 用 test-fanlink 的内容覆盖 main
git checkout test-fanlink -- .

REM 提交更改
git add .
git commit -m "Merge updates from test-fanlink on %date% %time%"

REM 推送到远程 main
git push origin main

REM 切回 test-fanlink
git checkout test-fanlink

REM 恢复本地 stash（如果有的话）
git stash pop

echo =======================================
echo Merge completed and pushed to main!
echo =======================================
pause