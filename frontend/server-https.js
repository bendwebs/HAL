// Custom HTTPS server for HAL frontend (for mobile voice access)
const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = 3443;

// Check for certificates
const certPath = path.join(__dirname, '..', 'certs');
const keyFile = path.join(certPath, 'key.pem');
const certFile = path.join(certPath, 'cert.pem');

if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
  console.error('SSL certificates not found!');
  console.error('Please generate them with:');
  console.error('  cd certs');
  console.error('  openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem');
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(keyFile),
  cert: fs.readFileSync(certFile),
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, () => {
    console.log(`> HTTPS Server ready on https://${hostname}:${port}`);
    console.log(`> Access from your phone: https://192.168.1.29:${port}`);
    console.log('> Note: You may need to accept the self-signed certificate warning');
  });
});
