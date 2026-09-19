// BNA — static server (no dependencies). Works on Railway, Render, Heroku, or locally: `node server.js`
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_PASSWORD_HASH = ADMIN_PASSWORD ? crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex') : null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/api/admin/auth') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        const enteredPassword = typeof body.password === 'string' ? body.password : '';

        if (!ADMIN_PASSWORD_HASH) {
          res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ ok: false, message: 'ADMIN_PASSWORD is not configured on the server.' }));
        }

        const enteredHash = crypto.createHash('sha256').update(enteredPassword).digest('hex');
        const isValid = crypto.timingSafeEqual(Buffer.from(ADMIN_PASSWORD_HASH, 'hex'), Buffer.from(enteredHash, 'hex'));

        res.writeHead(isValid ? 200 : 401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: isValid, message: isValid ? 'Authorized' : 'Invalid password' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'Invalid request body' }));
      }
    });
    return;
  }

  let urlPath = decodeURIComponent(url.pathname);
  if (urlPath === '/') urlPath = '/index.html';
  // allow clean URLs: /login -> /login.html
  if (!path.extname(urlPath)) urlPath += '.html';

  const filePath = path.normalize(path.join(PUBLIC, urlPath));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta charset="utf-8"><title>404</title><p style="font-family:sans-serif;text-align:center;margin-top:20vh">404 — الصفحة غير موجودة / Page non trouvée<br><a href="/">الرئيسية</a></p>');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(data);
  });
}).listen(PORT, () => console.log(`BNA app running on port ${PORT}`));
