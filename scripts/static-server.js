// Serves the production build (dist/, shipped alongside this script by the
// installer) on localhost and opens it in the default browser. id_card has
// no backend of its own — everything lives in the browser's IndexedDB — so
// this is deliberately not a persistent Windows Service: it's a plain
// foreground process that exits when its console window is closed, started
// on demand from a Start Menu / Desktop shortcut. Zero npm dependencies, so
// the installer never needs to bundle node_modules.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, '..', 'dist');
const DEFAULT_PORT = 4173;
const MAX_PORT_ATTEMPTS = 20;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const resolved = path.normalize(path.join(root, decoded));
  if (!resolved.startsWith(root)) return root; // reject path traversal, fall back to root
  return resolved;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function requestHandler(req, res) {
  let filePath = safeJoin(ROOT, req.url === '/' ? '/index.html' : req.url);
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.access(filePath, fs.constants.R_OK, (accessErr) => {
      // id_card has no client-side router — anything not found under dist/
      // (e.g. a bare refresh) falls back to index.html rather than a 404.
      serveFile(res, accessErr ? path.join(ROOT, 'index.html') : filePath);
    });
  });
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, (err) => {
    if (err) console.warn(`Could not auto-open browser: ${err.message}`);
  });
}

function listen(port, attemptsLeft) {
  const server = http.createServer(requestHandler);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(`Failed to start server: ${err.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log('============================================');
    console.log('ID Card App');
    console.log('============================================');
    console.log(`Serving ${ROOT}`);
    console.log(`Open at ${url}`);
    console.log('Close this window to stop the app.');
    console.log('============================================');
    openBrowser(url);
  });
}

if (!fs.existsSync(ROOT)) {
  console.error(`Build output not found at ${ROOT}. The installer should have shipped it alongside this script.`);
  process.exit(1);
}

listen(DEFAULT_PORT, MAX_PORT_ATTEMPTS);
