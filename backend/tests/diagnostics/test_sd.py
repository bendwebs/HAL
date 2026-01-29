"""Test script to isolate SD connection issue"""
import subprocess
import json
import time

API_URL = "http://127.0.0.1:7860"

def generate_image(prompt: str, num: int):
    payload = {
        "prompt": prompt,
        "negative_prompt": "blurry, bad quality",
        "width": 512,
        "height": 512,
        "steps": 20,
        "cfg_scale": 7.0,
        "sampler_name": "DPM++ 2M Karras",
        "seed": -1,
        "batch_size": 1
    }
    
    print(f"\n=== Generation {num} ===")
    print(f"Sending request...")
    start = time.time()
    
    result = subprocess.run(
        [
            'curl', '-s', '-X', 'POST',
            f'{API_URL}/sdapi/v1/txt2img',
            '-H', 'Content-Type: application/json',
            '-d', json.dumps(payload),
            '--max-time', '60'
        ],
        capture_output=True,
        timeout=65
    )
    
    elapsed = time.time() - start
    
    if result.returncode != 0:
        print(f"FAILED: curl returned {result.returncode}")
        print(f"stderr: {result.stderr.decode('utf-8', errors='replace')}")
        return False
    
    if not result.stdout:
        print(f"FAILED: empty response")
        return False
    
    try:
        data = json.loads(result.stdout.decode('utf-8'))
        if data.get("images"):
            print(f"SUCCESS: Generated in {elapsed:.1f}s")
            return True
        else:
            print(f"FAILED: No images in response")
            return False
    except Exception as e:
        print(f"FAILED: {e}")
        return False

if __name__ == "__main__":
    print("Testing SD API with multiple sequential requests...")
    print("Make sure SD is running!")
    
    for i in range(5):
        success = generate_image("a cute cat", i + 1)
        if not success:
            print(f"\nFailed on generation {i + 1}")
            break
        time.sleep(1)  # Small delay between requests
    
    print("\nTest complete!")
