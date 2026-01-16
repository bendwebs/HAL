@echo off
echo ===========================================
echo HAL Backend - Python Environment Upgrade
echo ===========================================
echo.

cd /d E:\Coding\Hal\backend

echo Current venv Python version:
venv\Scripts\python.exe --version

echo.
echo Step 1: Backing up current venv...
if exist venv_backup rmdir /s /q venv_backup
ren venv venv_backup
echo Backup created at venv_backup

echo.
echo Step 2: Creating new venv with Python 3.11...
echo Using: C:\Users\Steve\AppData\Local\Programs\Python\Python311\python.exe
C:\Users\Steve\AppData\Local\Programs\Python\Python311\python.exe -m venv venv

echo.
echo Step 3: Upgrading pip...
venv\Scripts\python.exe -m pip install --upgrade pip

echo.
echo Step 4: Installing requirements...
venv\Scripts\pip.exe install -r requirements.txt

echo.
echo Step 5: Verifying mem0ai installation...
venv\Scripts\pip.exe show mem0ai

echo.
echo Step 6: Testing mem0 import...
venv\Scripts\python.exe test_mem0.py

echo.
echo ===========================================
echo DONE! If successful, you can delete venv_backup
echo Restart your backend server now.
echo ===========================================
pause
