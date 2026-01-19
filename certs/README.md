# SSL Certificates for HTTPS Mobile Access

This directory contains SSL certificates for local HTTPS access (required for mobile voice features).

## ⚠️ SECURITY NOTE

**TODO: Regenerate all certificates** - Previous keys were briefly exposed in git history and should be considered compromised.

To regenerate:
```cmd
cd certs
del *.pem *.crt *.cer *.der *.csr *.srl

# Generate CA key and certificate
openssl genrsa -out ca-key.pem 2048
openssl req -x509 -new -nodes -key ca-key.pem -sha256 -days 365 -out ca-cert.pem -config ca.cnf

# Generate server key and certificate signed by CA
openssl genrsa -out key.pem 2048
openssl req -new -key key.pem -out server.csr -config server.cnf
openssl x509 -req -in server.csr -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -out cert.pem -days 365 -extensions v3_req -extfile server.cnf

# Generate mobile-friendly CA cert (DER format)
openssl x509 -in ca-cert.pem -out hal-ca.der -outform DER
```

## Files

- `ca-key.pem` - CA private key (KEEP SECRET)
- `ca-cert.pem` - CA certificate (install on mobile devices)
- `key.pem` - Server private key (KEEP SECRET)
- `cert.pem` - Server certificate
- `hal-ca.der` - CA certificate in DER format (for mobile installation)
- `ca.cnf` - OpenSSL config for CA
- `server.cnf` - OpenSSL config for server cert
- `openssl.cnf` - Legacy config (can be removed)

## Mobile Installation

1. Serve the certs directory: `python -m http.server 9999 --bind 0.0.0.0`
2. On mobile, navigate to `http://<your-ip>:9999/hal-ca.der`
3. Install as CA certificate (Android: Settings → Security → Install certificate → CA certificate)
4. For Android Chrome, also add to `chrome://flags` → "Insecure origins treated as secure"
