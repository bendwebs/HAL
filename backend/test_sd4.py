"""Test with output to file instead of capture"""
import subprocess
import json
import time
import os

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

print("Testing with output to file")
print("=" * 60)

# Write payload to file
with open("sd_payload.json", "w") as f:
    json.dump(payload, f)

for i in range(5):
    print(f"\nGeneration {i+1}...")
    
    output_file = f"sd_output_{i}.json"
    cmd = f'curl -s -X POST {API_URL}/sdapi/v1/txt2img -H "Content-Type: application/json" -d @sd_payload.json -o {output_file} --max-time 120'
    
    start = time.time()
    # Don't capture output - let it write to file
    result = subprocess.run(cmd, shell=True, timeout=130)
    elapsed = time.time() - start
    
    if result.returncode == 0 and os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if data.get("images"):
                print(f"SUCCESS in {elapsed:.1f}s - got {len(data['images'])} image(s)")
                # Clean up
                os.remove(output_file)
            else:
                print(f"FAILED: No images in response")
                break
        except Exception as e:
            print(f"FAILED: {e}")
            break
    else:
        print(f"FAILED: code={result.returncode}")
        break
    
    time.sleep(1)

# Cleanup
try:
    os.remove("sd_payload.json")
except:
    pass

print("\n" + "=" * 60)
print("Test complete!")
