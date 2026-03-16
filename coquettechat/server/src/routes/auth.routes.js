import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { signToken } from '../utils/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Faltan datos obligatorios' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ message: 'Ese email ya está registrado' });
  }

  const id = nanoid();
  const passwordHash = await bcrypt.hash(password, 10);
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name.trim(), email.toLowerCase(), passwordHash, createdAt);

  const user = { id, name: name.trim(), email: email.toLowerCase() };
  const token = signToken(user);
  return res.status(201).json({ user, token });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email y contraseña son obligatorios' });
  }

  const user = db.prepare(`
    SELECT id, name, email, password_hash, avatar_url
    FROM users
    WHERE email = ?
  `).get(email.toLowerCase());

  if (!user) {
    return res.status(401).json({ message: 'Credenciales inválidas' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ message: 'Credenciales inválidas' });
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_url
  };

  const token = signToken(safeUser);
  return res.json({ user: safeUser, token });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, avatar_url
    FROM users
    WHERE id = ?
  `).get(req.user.id);

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url
    }
  });
});

export default router;
