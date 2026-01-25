@echo off
echo Testing SD with longer delays between requests
echo ================================================

echo {"prompt":"a cat","steps":20,"width":512,"height":512,"cfg_scale":7,"seed":-1} > sd_payload.json

echo.
echo Generation 1...
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d @sd_payload.json -o sd_out_1.json --max-time 120
if errorlevel 1 (echo FAILED & goto :end)
echo SUCCESS

echo Waiting 10 seconds...
timeout /t 10 /nobreak

echo.
echo Generation 2...
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d @sd_payload.json -o sd_out_2.json --max-time 120
if errorlevel 1 (echo FAILED & goto :end)
echo SUCCESS

echo Waiting 10 seconds...
timeout /t 10 /nobreak

echo.
echo Generation 3...
curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d @sd_payload.json -o sd_out_3.json --max-time 120
if errorlevel 1 (echo FAILED & goto :end)
echo SUCCESS

:end
del sd_payload.json 2>nul
echo.
echo Done!
