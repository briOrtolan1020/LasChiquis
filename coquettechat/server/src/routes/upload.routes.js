import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db/index.js';

const router = Router();
router.use(requireAuth);

const uploadDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

router.post('/:chatId', upload.single('file'), (req, res) => {
  const { chatId } = req.params;
  const { content = '' } = req.body;

  const membership = db.prepare(`
    SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?
  `).get(chatId, req.user.id);

  if (!membership) {
    return res.status(403).json({ message: 'No pertenecés a este chat' });
  }

  if (!req.file && !content.trim()) {
    return res.status(400).json({ message: 'Debés enviar texto o archivo' });
  }

  const messageId = nanoid();
  const createdAt = new Date().toISOString();
  const publicBase = process.env.PUBLIC_SERVER_URL || `http://localhost:${process.env.PORT || 4000}`;
  const fileUrl = req.file ? `${publicBase}/uploads/${req.file.filename}` : null;

  db.prepare(`
    INSERT INTO messages (id, chat_id, user_id, content, file_name, file_url, file_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    chatId,
    req.user.id,
    content.trim() || null,
    req.file?.originalname || null,
    fileUrl,
    req.file?.mimetype || null,
    createdAt
  );

  const user = db.prepare(`SELECT name, avatar_url FROM users WHERE id = ?`).get(req.user.id);

  const message = {
    id: messageId,
    chatId,
    userId: req.user.id,
    userName: user.name,
    userAvatar: user.avatar_url,
    content: content.trim() || null,
    fileName: req.file?.originalname || null,
    fileUrl,
    fileType: req.file?.mimetype || null,
    createdAt
  };

  req.app.get('io').to(chatId).emit('message:new', message);
  res.status(201).json({ message });
});

export default router;
