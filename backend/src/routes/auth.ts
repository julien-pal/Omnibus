import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getConfig, saveConfig } from '../config/manager';

const router = express.Router();

// Simple in-memory rate limiter for the login endpoint
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_MAX_ATTEMPTS = 10;

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (!checkLoginRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const { username, password } = req.body as { username: string; password: string };
  const appConfig = getConfig('app');

  if (!appConfig.auth || !appConfig.auth.enabled) {
    const secret = appConfig.jwtSecret;
    if (!secret) return res.status(500).json({ error: 'Server misconfigured: JWT secret not set' });
    const token = jwt.sign({ username: 'admin', role: 'admin', profileId: 'default' }, secret, { expiresIn: '30d' });
    return res.json({ token, user: { username: 'admin', role: 'admin' } });
  }

  if (username !== appConfig.auth.username) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!appConfig.auth.passwordHash) {
    return res
      .status(401)
      .json({ error: 'Password not set. Please configure authentication in settings.' });
  }

  const valid = await bcrypt.compare(password, appConfig.auth.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const secret = appConfig.jwtSecret;
  if (!secret) return res.status(500).json({ error: 'Server misconfigured: JWT secret not set' });
  const token = jwt.sign({ username, role: 'admin', profileId: 'default' }, secret, { expiresIn: '30d' });
  res.json({ token, user: { username, role: 'admin' } });
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const appConfig = getConfig('app');
  const authEnabled = appConfig.auth?.enabled || false;

  // This route is outside the auth middleware, so decode the token manually
  let user: { username: string; role: string; profileId?: string } | null = null;
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ') && appConfig.jwtSecret) {
    try {
      user = jwt.verify(authHeader.slice(7), appConfig.jwtSecret) as { username: string; role: string; profileId?: string };
    } catch {
      /* invalid/expired token */
    }
  }

  res.json({
    authEnabled,
    username: appConfig.auth?.username || 'admin',
    user: user ? { username: user.username, role: user.role, profileId: user.profileId || null } : null,
  });
});

export default router;
