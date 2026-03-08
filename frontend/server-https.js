// HAL 2.0 - Custom server with API proxying and LAN access
// Serves both HTTP and HTTPS, proxies /api/* to backend
const { createServer: createHttpsServer } = require('https');
const { createServer: createHttpServer } = require('http');
const https = require('https');
const http = require('http');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');
const os = require('os');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const httpsPort = 3443;
const httpPort = 3000;

// Backend URL for API proxying
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
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
  console.warn('[HAL] SSL certificates not found - HTTPS server will not start');
}

/**
 * Auto-detect LAN IP address
 */
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
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
    rejectUnauthorized: false,
  };

  const proxyReq = reqModule.request(options, (proxyRes) => {
    // Copy headers, ensuring SSE streams work
    const headers = { ...proxyRes.headers };
    res.writeHead(proxyRes.statusCode, headers);
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
  const lanIp = getLanIp();

  // Always start HTTP server (for LAN desktop access + tunnel)
  createHttpServer(handler).listen(httpPort, hostname, () => {
    console.log(`[HAL] HTTP  ready: http://localhost:${httpPort}`);
    console.log(`[HAL] LAN access:  http://${lanIp}:${httpPort}`);
  });

  // Start HTTPS server if certs are available (needed for mobile voice)
  if (httpsOptions) {
    createHttpsServer(httpsOptions, handler).listen(httpsPort, hostname, () => {
      console.log(`[HAL] HTTPS ready: https://localhost:${httpsPort}`);
      console.log(`[HAL] Mobile:      https://${lanIp}:${httpsPort} (accept self-signed cert)`);
    });
  }

  console.log(`[HAL] API proxy:   /api/* -> ${BACKEND_URL}`);
});
