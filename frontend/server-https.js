// Custom HTTPS server for HAL frontend (for mobile voice access)
// Also proxies /api/* to the backend for tunnel support (hal.bendwebs.com)
const { createServer: createHttpsServer } = require('https');
const { createServer: createHttpServer } = require('http');
const https = require('https');
const http = require('http');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const httpsPort = 3443;
const httpPort = 3000;

// Backend URL for API proxying
const BACKEND_URL = process.env.BACKEND_URL || 'https://localhost:8443';
const backendParsed = new URL(BACKEND_URL);
const backendIsHttps = backendParsed.protocol === 'https:';

// Check for certificates
const certPath = path.join(__dirname, '..', 'certs');
const keyFile = path.join(certPath, 'key.pem');
const certFile = path.join(certPath, 'cert.pem');

const hasCerts = fs.existsSync(keyFile) && fs.existsSync(certFile);

let httpsOptions = null;
if (hasCerts) {
  httpsOptions = {
    key: fs.readFileSync(keyFile),
    cert: fs.readFileSync(certFile),
  };
} else {
  console.warn('SSL certificates not found - HTTPS server will not start');
  console.warn('HTTP server will still run on port', httpPort);
}

/**
 * Proxy a request to the backend API server
 */
function proxyToBackend(req, res) {
  const reqModule = backendIsHttps ? https : http;

  const options = {
    hostname: backendParsed.hostname,
    port: backendParsed.port || (backendIsHttps ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: backendParsed.host,
    },
    // Allow self-signed certs on backend
    rejectUnauthorized: false,
  };

  const proxyReq = reqModule.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy Error]', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Backend unavailable' }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

/**
 * Request handler - proxies /api/* and /health to backend, rest to Next.js
 */
function createRequestHandler(handle) {
  return async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      const pathname = parsedUrl.pathname;

      // Proxy API and health requests to the backend
      if (pathname.startsWith('/api/') || pathname === '/health') {
        return proxyToBackend(req, res);
      }

      // Everything else goes to Next.js
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  };
}

const app = next({ dev, hostname, port: httpsPort });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const handler = createRequestHandler(handle);

  // Always start HTTP server (for tunnel access)
  createHttpServer(handler).listen(httpPort, hostname, () => {
    console.log(`> HTTP  Server ready on http://${hostname}:${httpPort}`);
    console.log(`> Tunnel access: http://localhost:${httpPort} -> hal.bendwebs.com`);
  });

  // Start HTTPS server if certs are available
  if (httpsOptions) {
    createHttpsServer(httpsOptions, handler).listen(httpsPort, hostname, () => {
      console.log(`> HTTPS Server ready on https://${hostname}:${httpsPort}`);
      console.log(`> Mobile access: https://192.168.1.29:${httpsPort}`);
      console.log('> Note: You may need to accept the self-signed certificate warning');
    });
  }

  console.log(`> API proxy: /api/* -> ${BACKEND_URL}`);
});
