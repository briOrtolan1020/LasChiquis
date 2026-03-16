import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function mapChat(chat, currentUserId) {
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_url AS avatarUrl, cm.role
    FROM chat_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.chat_id = ?
    ORDER BY u.name ASC
  `).all(chat.id);

  const directPartner = chat.type === 'direct'
    ? members.find((m) => m.id !== currentUserId)
    : null;

  return {
    id: chat.id,
    type: chat.type,
    name: chat.type === 'group' ? chat.name : directPartner?.name || 'Chat directo',
    avatarUrl: chat.type === 'group' ? chat.avatar_url : directPartner?.avatarUrl || null,
    members,
    lastMessage: chat.lastMessageId ? {
      id: chat.lastMessageId,
      content: chat.lastMessageContent,
      fileName: chat.lastMessageFileName,
      createdAt: chat.lastMessageCreatedAt,
      userId: chat.lastMessageUserId
    } : null,
    createdAt: chat.created_at
  };
}

router.get('/', (req, res) => {
  const chats = db.prepare(`
    SELECT c.*,
      m.id AS lastMessageId,
      m.content AS lastMessageContent,
      m.file_name AS lastMessageFileName,
      m.created_at AS lastMessageCreatedAt,
      m.user_id AS lastMessageUserId
    FROM chats c
    JOIN chat_members cm ON cm.chat_id = c.id
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages mm
      WHERE mm.chat_id = c.id
      ORDER BY mm.created_at DESC
      LIMIT 1
    )
    WHERE cm.user_id = ?
    ORDER BY COALESCE(m.created_at, c.created_at) DESC
  `).all(req.user.id);

  res.json({ chats: chats.map((chat) => mapChat(chat, req.user.id)) });
});

router.post('/direct', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ message: 'Falta userId' });
  }

  const existing = db.prepare(`
    SELECT c.id, c.type, c.name, c.avatar_url, c.created_at
    FROM chats c
    JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
    JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
    WHERE c.type = 'direct'
  `).get(req.user.id, userId);

  if (existing) {
    return res.json({ chat: mapChat(existing, req.user.id) });
  }

  const chatId = nanoid();
  const createdAt = new Date().toISOString();

  const insertChat = db.prepare(`
    INSERT INTO chats (id, type, created_by, created_at)
    VALUES (?, 'direct', ?, ?)
  `);
  const insertMember = db.prepare(`
    INSERT INTO chat_members (chat_id, user_id, role, joined_at)
    VALUES (?, ?, 'member', ?)
  `);

  const tx = db.transaction(() => {
    insertChat.run(chatId, req.user.id, createdAt);
    insertMember.run(chatId, req.user.id, createdAt);
    insertMember.run(chatId, userId, createdAt);
  });

  tx();

  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
  res.status(201).json({ chat: mapChat(chat, req.user.id) });
});

router.post('/group', (req, res) => {
  const { name, memberIds = [] } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ message: 'El grupo necesita nombre' });
  }

  const chatId = nanoid();
  const createdAt = new Date().toISOString();
  const uniqueMemberIds = Array.from(new Set([req.user.id, ...memberIds]));

  const insertChat = db.prepare(`
    INSERT INTO chats (id, type, name, created_by, created_at)
    VALUES (?, 'group', ?, ?, ?)
  `);
  const insertMember = db.prepare(`
    INSERT INTO chat_members (chat_id, user_id, role, joined_at)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertChat.run(chatId, name.trim(), req.user.id, createdAt);
    uniqueMemberIds.forEach((memberId) => {
      insertMember.run(chatId, memberId, memberId === req.user.id ? 'admin' : 'member', createdAt);
    });
  });

  tx();

  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
  res.status(201).json({ chat: mapChat(chat, req.user.id) });
});

router.get('/:chatId/messages', (req, res) => {
  const membership = db.prepare(`
    SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?
  `).get(req.params.chatId, req.user.id);

  if (!membership) {
    return res.status(403).json({ message: 'No pertenecés a este chat' });
  }

  const messages = db.prepare(`
    SELECT m.id, m.chat_id AS chatId, m.user_id AS userId, u.name AS userName, u.avatar_url AS userAvatar,
           m.content, m.file_name AS fileName, m.file_url AS fileUrl, m.file_type AS fileType,
           m.created_at AS createdAt
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.chat_id = ?
    ORDER BY m.created_at ASC
  `).all(req.params.chatId);

  res.json({ messages });
});

export default router;
