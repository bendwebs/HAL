@echo off
echo Testing SD with batch file - 5 generations
echo ============================================

echo {"prompt":"a cat","steps":20,"width":512,"height":512,"cfg_scale":7,"seed":-1} > sd_payload.json

for /L %%i in (1,1,5) do (
    echo.
    echo Generation %%i...
    curl -s -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d @sd_payload.json -o sd_out_%%i.json --max-time 120
    if errorlevel 1 (
        echo FAILED
        goto :end
    )
    echo SUCCESS
    timeout /t 1 /nobreak >nul
)

:end
del sd_payload.json 2>nul
echo.
echo Done!
