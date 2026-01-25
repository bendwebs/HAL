@echo off
echo Testing with Connection: close header
echo ======================================

for /L %%i in (1,1,10) do (
    echo.
    echo Generation %%i...
    curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -H "Connection: close" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}" -o out%%i.json --max-time 30
    if exist out%%i.json (echo SUCCESS) else (echo FAILED & goto :end)
)

:end
del out*.json 2>nul
echo.
echo Done!
