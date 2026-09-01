// The Climate — backend server
// Plain Express + JSON-file storage (no native/DB dependencies required).
// Run:  npm install   then   npm start
// Env:  PORT (default 3000), ADMIN_KEY (default "changeme" — set your own before deploying)

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'yash';

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- tiny JSON-file helpers ----------
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- public API ----------

// GET /api/products — full catalog, powers the frontend grid + quiz
app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  res.json({ products });
});

// POST /api/newsletter — { email }  → adds to La Liste, de-duplicated
app.post('/api/newsletter', (req, res) => {
  const { email } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'A valid email address is required.' });
  }
  const subscribers = readJSON(SUBSCRIBERS_FILE, []);
  const normalized = email.trim().toLowerCase();
  const already = subscribers.some(s => s.email === normalized);
  if (!already) {
    subscribers.push({ email: normalized, subscribedAt: new Date().toISOString() });
    writeJSON(SUBSCRIBERS_FILE, subscribers);
  }
  res.json({ ok: true, alreadySubscribed: already });
});

// POST /api/contact — { name, email, message }
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !isValidEmail(email) || !message) {
    return res.status(400).json({ ok: false, error: 'Name, a valid email, and a message are required.' });
  }
  const messages = readJSON(MESSAGES_FILE, []);
  messages.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: String(name).trim().slice(0, 200),
    email: email.trim().toLowerCase(),
    message: String(message).trim().slice(0, 4000),
    receivedAt: new Date().toISOString(),
    read: false
  });
  writeJSON(MESSAGES_FILE, messages);
  res.json({ ok: true });
});

// ---------- lightweight admin API (protected by ADMIN_KEY) ----------
function requireAdmin(req, res, next) {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized. Pass ?key=YOUR_ADMIN_KEY.' });
  }
  next();
}

app.get('/api/admin/subscribers', requireAdmin, (req, res) => {
  res.json({ subscribers: readJSON(SUBSCRIBERS_FILE, []) });
});

app.get('/api/admin/messages', requireAdmin, (req, res) => {
  res.json({ messages: readJSON(MESSAGES_FILE, []) });
});

// Simple product management: add/update/delete — protected the same way.
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const product = req.body || {};
  if (!product.key || !product.name) {
    return res.status(400).json({ ok: false, error: '"key" and "name" are required.' });
  }
  const products = readJSON(PRODUCTS_FILE, []);
  const idx = products.findIndex(p => p.key === product.key);
  if (idx >= 0) products[idx] = { ...products[idx], ...product };
  else products.push(product);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, products });
});

app.delete('/api/admin/products/:key', requireAdmin, (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const next = products.filter(p => p.key !== req.params.key);
  writeJSON(PRODUCTS_FILE, next);
  res.json({ ok: true, products: next });
});

// A tiny built-in admin page — no separate build step needed.
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>The Climate — Admin</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0a0a0b;color:#ece4d6;padding:40px;max-width:900px;margin:0 auto;}
    h1{font-weight:500;} input{background:#1c1512;border:1px solid #3a332c;color:#ece4d6;padding:10px;width:280px;margin-right:10px;}
    button{background:#c8a15c;border:none;color:#0a0a0b;padding:10px 18px;cursor:pointer;font-weight:600;}
    table{width:100%;border-collapse:collapse;margin-top:24px;} td,th{border-bottom:1px solid #3a332c;padding:8px;text-align:left;font-size:14px;}
    section{margin-top:50px;}
  </style></head><body>
    <h1>The Climate — Admin</h1>
    <p>Enter your admin key to view subscribers and messages.</p>
    <input id="key" type="password" placeholder="Admin key">
    <button onclick="load()">View</button>
    <section><h2>Newsletter Subscribers</h2><table id="subTable"><thead><tr><th>Email</th><th>Subscribed</th></tr></thead><tbody></tbody></table></section>
    <section><h2>Contact Messages</h2><table id="msgTable"><thead><tr><th>Name</th><th>Email</th><th>Message</th><th>Received</th></tr></thead><tbody></tbody></table></section>
    <script>
      async function load(){
        const key = document.getElementById('key').value;
        const s = await fetch('/api/admin/subscribers?key=' + encodeURIComponent(key)).then(r => r.json());
        const m = await fetch('/api/admin/messages?key=' + encodeURIComponent(key)).then(r => r.json());
        if (s.error) { alert(s.error); return; }
        document.querySelector('#subTable tbody').innerHTML = (s.subscribers||[]).map(x =>
          '<tr><td>'+x.email+'</td><td>'+new Date(x.subscribedAt).toLocaleString()+'</td></tr>').join('');
        document.querySelector('#msgTable tbody').innerHTML = (m.messages||[]).map(x =>
          '<tr><td>'+x.name+'</td><td>'+x.email+'</td><td>'+x.message+'</td><td>'+new Date(x.receivedAt).toLocaleString()+'</td></tr>').join('');
      }
    </script>
  </body></html>`);
});

app.listen(PORT, () => {
  console.log(`The Climate server running → http://localhost:${PORT}`);
  console.log(`Admin panel            → http://localhost:${PORT}/admin  (key: ${ADMIN_KEY})`);
});
