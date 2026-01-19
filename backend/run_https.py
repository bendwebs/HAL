"""
HTTPS Server wrapper for HAL Backend
Use this for mobile voice access which requires secure context
"""
import uvicorn
import ssl
import os

if __name__ == "__main__":
    # Certificate paths
    cert_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "certs")
    cert_file = os.path.join(cert_dir, "cert.pem")
    key_file = os.path.join(cert_dir, "key.pem")
    
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print("SSL certificates not found!")
        print(f"Expected at: {cert_dir}")
        print("Please generate them first.")
        exit(1)
    
    print(f"Starting HTTPS server with certificates from {cert_dir}")
    print("Access from mobile: https://192.168.1.29:8443")
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8443,
        ssl_keyfile=key_file,
        ssl_certfile=cert_file,
        reload=True
    )
