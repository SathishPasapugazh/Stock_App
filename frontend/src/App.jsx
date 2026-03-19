"""
start.py — Launch Flask backend + React frontend with a single command.
Usage: python start.py
"""

import subprocess, sys, os, time, signal, threading

FLASK_CMD = [sys.executable, "app.py"]
REACT_DIR = r"C:\Users\saisa\PycharmProjects\Stackapp\frontend"  # ← your React folder
REACT_CMD = ["npm", "run", "dev"]

processes = []

def stream_output(proc, label, color_code):
    color, reset = f"\033[{color_code}m", "\033[0m"
    for line in iter(proc.stdout.readline, b""):
        print(f"{color}[{label}]{reset} {line.decode(errors='replace').rstrip()}")

def shutdown(signum=None, frame=None):
    print("\n\033[33m[start.py] Shutting down...\033[0m")
    for p in processes:
        try: p.terminate()
        except: pass
    sys.exit(0)

signal.signal(signal.SIGINT,  shutdown)
signal.signal(signal.SIGTERM, shutdown)

print("\033[34m[start.py] Starting Flask on http://localhost:5000\033[0m")
flask_proc = subprocess.Popen(FLASK_CMD, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               cwd=os.path.dirname(os.path.abspath(__file__)))
processes.append(flask_proc)
threading.Thread(target=stream_output, args=(flask_proc, "Flask", "34"), daemon=True).start()

time.sleep(1.5)

if not os.path.isdir(REACT_DIR):
    print(f"\033[31m[start.py] React dir not found: {REACT_DIR}\033[0m")
    shutdown()

print(f"\033[32m[start.py] Starting React...\033[0m")
react_proc = subprocess.Popen(REACT_CMD, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               cwd=REACT_DIR, shell=True)
processes.append(react_proc)
threading.Thread(target=stream_output, args=(react_proc, "React", "32"), daemon=True).start()

print("\033[33m[start.py] Both servers running. Ctrl+C to stop.\033[0m\n")

while True:
    time.sleep(2)
    for label, proc in [("Flask", flask_proc), ("React", react_proc)]:
        if proc.poll() is not None:
            print(f"\033[31m[start.py] {label} exited (code {proc.returncode}). Shutting down.\033[0m")
            shutdown()
