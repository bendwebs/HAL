@echo off
echo Testing with START /WAIT - each curl in new cmd process
echo ========================================================

echo {"prompt":"a cat","steps":20,"width":512,"height":512,"cfg_scale":7,"seed":-1} > sd_payload.json

echo.
echo Generation 1...
start /wait cmd /c curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d @sd_payload.json -o sd_out_1.json --max-time 120
if exist sd_out_1.json (echo SUCCESS) else (echo FAILED)

echo.
echo Generation 2...
start /wait cmd /c curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d @sd_payload.json -o sd_out_2.json --max-time 120
if exist sd_out_2.json (echo SUCCESS) else (echo FAILED)

echo.
echo Generation 3...
start /wait cmd /c curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d @sd_payload.json -o sd_out_3.json --max-time 120
if exist sd_out_3.json (echo SUCCESS) else (echo FAILED)

del sd_payload.json 2>nul
echo.
echo Done!
