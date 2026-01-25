"""Minimal test to find the SD issue"""
import subprocess
import json
import time
import os

API_URL = "http://127.0.0.1:7860"

payload = {
    "prompt": "a cute cat",
    "steps": 5,
    "width": 64,
    "height": 64
}

print("Test 1: Using subprocess.run with shell=True")
print("=" * 50)

for i in range(3):
    print(f"\nAttempt {i+1}...")
    cmd = f'curl -s -X POST {API_URL}/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{json.dumps(payload).replace(chr(34), chr(92)+chr(34))}"'
    print(f"Command: {cmd[:100]}...")
    
    start = time.time()
    result = subprocess.run(cmd, shell=True, capture_output=True, timeout=30)
    elapsed = time.time() - start
    
    if result.returncode == 0 and result.stdout:
        try:
            data = json.loads(result.stdout.decode('utf-8'))
            if data.get("images"):
                print(f"SUCCESS in {elapsed:.1f}s")
            else:
                print(f"No images in response")
        except:
            print(f"Failed to parse JSON")
    else:
        print(f"Failed: code={result.returncode}")
    
    time.sleep(0.5)

print("\n" + "=" * 50)
print("Test 2: Using os.system (fire and forget style)")
print("=" * 50)

# Write payload to file
with open("test_payload.json", "w") as f:
    json.dump(payload, f)

for i in range(3):
    print(f"\nAttempt {i+1}...")
    start = time.time()
    
    # Use os.system which is more like running from command line
    exit_code = os.system(f'curl -s -X POST {API_URL}/sdapi/v1/txt2img -H "Content-Type: application/json" -d @test_payload.json -o test_output_{i}.json --max-time 30')
    
    elapsed = time.time() - start
    
    if exit_code == 0:
        try:
            with open(f"test_output_{i}.json", "r") as f:
                data = json.load(f)
            if data.get("images"):
                print(f"SUCCESS in {elapsed:.1f}s")
            else:
                print(f"No images")
        except Exception as e:
            print(f"Error: {e}")
    else:
        print(f"Failed with code {exit_code}")
    
    time.sleep(0.5)

# Cleanup
try:
    os.remove("test_payload.json")
    for i in range(3):
        os.remove(f"test_output_{i}.json")
except:
    pass

print("\nDone!")
