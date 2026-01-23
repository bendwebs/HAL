import GPUtil

gpus = GPUtil.getGPUs()
print(f"GPUs found: {len(gpus)}")
for g in gpus:
    print(f"  {g.name}: {g.memoryUsed:.0f}/{g.memoryTotal:.0f}MB, Load: {g.load*100:.1f}%, Temp: {g.temperature}C")
