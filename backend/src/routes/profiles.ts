import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, saveConfig } from '../config/manager';
import { Profile } from '../types';

const router = express.Router();

// GET /api/profiles — list all profiles (public info only)
router.get('/', (_req, res) => {
  const config = getConfig('app');
  const profiles = (config.auth.profiles || []).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    hasPassword: !!p.passwordHash,
  }));
  res.json({ profiles });
});

// POST /api/profiles/select — select a profile, returns new JWT with profileId
router.post('/select', async (req, res) => {
  const { profileId, password } = req.body as { profileId: string; password?: string };
  if (!profileId) return res.status(400).json({ error: 'profileId is required' });

  const config = getConfig('app');
  const profile = (config.auth.profiles || []).find((p) => p.id === profileId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  // Check password if profile has one
  if (profile.passwordHash) {
    if (!password) return res.status(401).json({ error: 'Password required' });
    const valid = await bcrypt.compare(password, profile.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
  }

  const secret = config.jwtSecret;
  if (!secret) return res.status(500).json({ error: 'Server misconfigured: JWT secret not set' });

  const token = jwt.sign(
    { username: profile.name, role: profile.role, profileId: profile.id },
    secret,
    { expiresIn: '30d' },
  );
  res.json({ token, profile: { id: profile.id, name: profile.name, role: profile.role } });
});

// GET /api/profiles/current — return current profile from JWT
router.get('/current', (req, res) => {
  if (!req.user?.profileId || req.user.profileId === 'default') {
    return res.json({ profile: null });
  }
  const config = getConfig('app');
  const profile = (config.auth.profiles || []).find((p) => p.id === req.user!.profileId);
  if (!profile) return res.json({ profile: null });
  res.json({ profile: { id: profile.id, name: profile.name, role: profile.role } });
});

// ---- Admin-only endpoints below ----

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// POST /api/profiles — create a profile
// First profile: no auth required, forced admin role
// Subsequent profiles: admin only
router.post('/', async (req, res) => {
  const config = getConfig('app');
  if (!config.auth.profiles) config.auth.profiles = [];
  const isFirstProfile = config.auth.profiles.length === 0;

  if (!isFirstProfile && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { name, role, password } = req.body as { name?: string; role?: string; password?: string };
  if (!name) return res.status(400).json({ error: 'name is required' });

  // First profile is always admin
  const profileRole = isFirstProfile ? 'admin' : (role === 'admin' ? 'admin' : 'user');

  let passwordHash: string | undefined;
  if (password) {
    const salt = await bcrypt.genSalt(10);
    passwordHash = await bcrypt.hash(password, salt);
  }

  const profile: Profile = {
    id: uuidv4(),
    name,
    role: profileRole,
    ...(passwordHash ? { passwordHash } : {}),
  };

  config.auth.profiles.push(profile);
  saveConfig('app', config);

  res.status(201).json({ id: profile.id, name: profile.name, role: profile.role, hasPassword: !!passwordHash });
});

// PUT /api/profiles/:id — update a profile (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  const { name, role, password, removePassword } = req.body as {
    name?: string;
    role?: string;
    password?: string;
    removePassword?: boolean;
  };

  const config = getConfig('app');
  const profiles = config.auth.profiles || [];
  const idx = profiles.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Profile not found' });

  const profile = profiles[idx];
  if (name) profile.name = name;
  if (role === 'admin' || role === 'user') profile.role = role;
  if (password) {
    const salt = await bcrypt.genSalt(10);
    profile.passwordHash = await bcrypt.hash(password, salt);
  }
  if (removePassword) {
    delete profile.passwordHash;
  }

  config.auth.profiles[idx] = profile;
  saveConfig('app', config);
  res.json({ id: profile.id, name: profile.name, role: profile.role, hasPassword: !!profile.passwordHash });
});

// DELETE /api/profiles/:id — delete a profile (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  const config = getConfig('app');
  const profiles = config.auth.profiles || [];
  const target = profiles.find((p) => p.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Profile not found' });

  // Prevent deleting the last admin
  if (target.role === 'admin') {
    const adminCount = profiles.filter((p) => p.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin profile' });
    }
  }

  config.auth.profiles = profiles.filter((p) => p.id !== req.params.id);
  saveConfig('app', config);
  res.json({ ok: true });
});

export default router;
