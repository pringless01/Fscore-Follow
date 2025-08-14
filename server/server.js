import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

const app = express();
app.use(express.json());
app.use(cookieParser());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

function getToken(req) {
  const header = req.get('Authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  return null;
}

export function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || !Array.isArray(req.user.roles) || !req.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use('/admin', requireAuth, requireAdmin, express.static(path.join(__dirname, 'public', 'admin'), { index: 'index.html' }));

// Örnek admin API uçları (place-holder)
app.get('/api/admin/health', requireAuth, requireAdmin, (_req, res) => {
  res.json({
    uptime: process.uptime(),
    db: { ok: true },
    redis: { ok: true },
    latestAudit: []
  });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
  res.json({ items: [] });
});

app.get('/api/admin/users/:id', requireAuth, requireAdmin, (_req, res) => {
  res.json({ user: { id: 0, email: 'test@example.com', roles: ['admin'], money: 0 }, contracts: [], audit: [] });
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/audit', requireAuth, requireAdmin, (_req, res) => {
  res.json({ items: [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
