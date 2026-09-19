// BNA — static server with real applicant persistence. Works on Railway, Render, Heroku, or locally: `node server.js`
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'applications.json');
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

function ensureDataFile() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(APPLICATIONS_FILE)) {
      fs.writeFileSync(APPLICATIONS_FILE, '[]', 'utf8');
    }
  } catch (err) {
    console.error('Failed to initialize data store:', err);
  }
}

function readApplications() {
  try {
    const raw = fs.readFileSync(APPLICATIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeApplications(applications) {
  fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(applications, null, 2), 'utf8');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(realIp).trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function normalizeApplication(payload, req) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const fullName = String(data.fullName || data.name || 'مقدم طلب').trim();
  const app = {
    id: data.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: fullName,
    fullName,
    email: String(data.email || '').trim(),
    idNum: String(data.idNum || data.nationalId || data.id_number || '').trim(),
    phone: String(data.phone || data.mobile || '').trim(),
    wilaya: String(data.wilaya || '').trim(),
    commune: String(data.commune || '').trim(),
    zip: String(data.zip || '').trim(),
    street: String(data.street || '').trim(),
    address: String(data.address || [data.wilaya, data.commune, data.street].filter(Boolean).join(' / ') || '').trim(),
    status: String(data.status || 'new').trim() || 'new',
    createdAt: new Date().toISOString(),
    ip: getClientIp(req),
  };
  return app;
}

ensureDataFile();

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
          return res.end(JSON.stringify({ ok: false, message: 'لم يتم تهيئة كلمة مرور لوحة الإدارة على الخادم.' }));
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

  if (req.method === 'GET' && url.pathname === '/api/applications') {
    const apps = readApplications();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(apps));
  }

  if (req.method === 'POST' && url.pathname === '/api/applications') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        const current = readApplications();
        const normalized = normalizeApplication(body, req);
        const duplicate = current.find(item =>
          (item.phone && item.phone === normalized.phone) ||
          (item.idNum && item.idNum === normalized.idNum) ||
          (item.email && item.email === normalized.email)
        );

        const list = duplicate
          ? current.map(item => (item.phone === normalized.phone || item.idNum === normalized.idNum || item.email === normalized.email ? { ...item, ...normalized, id: item.id || normalized.id } : item))
          : [normalized, ...current];

        writeApplications(list);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, count: list.length, application: normalized }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'Invalid application payload' }));
      }
    });
    return;
  }

  let urlPath = decodeURIComponent(url.pathname);
  if (urlPath === '/') urlPath = '/index.html';
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
