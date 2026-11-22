import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http.js';
import { AUTH_COOKIE, cookieOptions, requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// Limitation simple des tentatives de connexion (en mémoire, par IP)
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

router.post('/login', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  const entry = attempts.get(ip);
  if (entry && entry.count >= MAX_ATTEMPTS && entry.until > Date.now()) {
    throw new HttpError(429, 'Trop de tentatives, réessayez dans quelques minutes');
  }

  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    const e = entry && entry.until > Date.now() ? entry : { count: 0, until: Date.now() + WINDOW_MS };
    e.count++;
    attempts.set(ip, e);
    throw new HttpError(401, 'Email ou mot de passe incorrect');
  }
  attempts.delete(ip);

  res.cookie(AUTH_COOKIE, signToken(user.id), cookieOptions);
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Au moins 8 caractères'),
});

router.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = passwordSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Mot de passe actuel incorrect');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  res.json({ ok: true });
});

export default router;
