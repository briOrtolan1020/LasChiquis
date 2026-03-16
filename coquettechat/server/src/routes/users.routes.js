import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, avatar_url AS avatarUrl, created_at AS createdAt
    FROM users
    WHERE id != ?
    ORDER BY name ASC
  `).all(req.user.id);

  res.json({ users });
});

export default router;
