"""Test subprocess.run with shell=True - full size images"""
import subprocess
import json
import time

API_URL = "http://127.0.0.1:7860"

payload = {
    "prompt": "a beautiful sunset over mountains",
    "negative_prompt": "blurry, bad quality",
    "steps": 20,
    "width": 512,
    "height": 512,
    "cfg_scale": 7.0,
    "sampler_name": "DPM++ 2M Karras",
    "seed": -1
}

print("Testing subprocess.run with shell=True - full size images")
print("=" * 60)

for i in range(5):
    print(f"\nGeneration {i+1}...")
    
    # Escape quotes for shell
    payload_str = json.dumps(payload).replace('"', '\\"')
    cmd = f'curl -s -X POST {API_URL}/sdapi/v1/txt2img -H "Content-Type: application/json" -d "{payload_str}" --max-time 120'
    
    start = time.time()
    result = subprocess.run(cmd, shell=True, capture_output=True, timeout=130)
    elapsed = time.time() - start
    
    if result.returncode == 0 and result.stdout:
        try:
            data = json.loads(result.stdout.decode('utf-8'))
            if data.get("images"):
                print(f"SUCCESS in {elapsed:.1f}s - got {len(data['images'])} image(s)")
            else:
                print(f"FAILED: No images in response")
                break
        except Exception as e:
            print(f"FAILED: {e}")
            break
    else:
        print(f"FAILED: code={result.returncode}")
        if result.stderr:
            print(f"stderr: {result.stderr.decode('utf-8', errors='replace')}")
        break
    
    time.sleep(1)

print("\n" + "=" * 60)
print("Test complete!")
