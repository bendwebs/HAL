"""
HAL 2.0 - HTTPS Backend Server
Used for mobile voice access which requires secure context
"""
import uvicorn
import os
import socket

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    cert_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "certs")
    cert_file = os.path.join(cert_dir, "cert.pem")
    key_file = os.path.join(cert_dir, "key.pem")

    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print("SSL certificates not found!")
        print(f"Expected at: {cert_dir}")
        print("Generate: openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem")
        exit(1)

    lan_ip = get_lan_ip()
    print(f"Starting HTTPS backend on https://{lan_ip}:8443")

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8443,
        ssl_keyfile=key_file,
        ssl_certfile=cert_file,
        reload=True
    )
