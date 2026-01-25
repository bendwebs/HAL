@echo off
echo Testing with interrupt call between each generation
echo ====================================================

echo.
echo Generation 1...
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}" -o out1.json --max-time 30
if exist out1.json (echo SUCCESS) else (echo FAILED)
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/interrupt >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo Generation 2...
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}" -o out2.json --max-time 30
if exist out2.json (echo SUCCESS) else (echo FAILED)
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/interrupt >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo Generation 3...
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}" -o out3.json --max-time 30
if exist out3.json (echo SUCCESS) else (echo FAILED)
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/interrupt >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo Generation 4...
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}" -o out4.json --max-time 30
if exist out4.json (echo SUCCESS) else (echo FAILED)
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/interrupt >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo Generation 5...
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}" -o out5.json --max-time 30
if exist out5.json (echo SUCCESS) else (echo FAILED)
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/interrupt >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo Generation 6...
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}" -o out6.json --max-time 30
if exist out6.json (echo SUCCESS) else (echo FAILED)

del out*.json 2>nul
echo.
echo Done!
