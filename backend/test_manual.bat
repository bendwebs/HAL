@echo off
echo Running the EXACT manual curl command 4 times
echo ==============================================

echo.
echo Generation 1...
curl -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}"
echo.
echo Done 1

pause

echo.
echo Generation 2...
curl -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}"
echo.
echo Done 2

pause

echo.
echo Generation 3...
curl -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}"
echo.
echo Done 3

pause

echo.
echo Generation 4...
curl -X POST http://127.0.0.1:7860/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{\"prompt\":\"test\",\"steps\":5,\"width\":64,\"height\":64}"
echo.
echo Done 4

echo.
echo All done!
pause
