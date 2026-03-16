import { Server } from 'socket.io';
import { verifyToken } from '../utils/auth.js';
import { db } from '../db/index.js';

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No autorizado'));
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const memberships = db.prepare(`SELECT chat_id FROM chat_members WHERE user_id = ?`).all(socket.user.id);
    memberships.forEach(({ chat_id }) => socket.join(chat_id));
    socket.join(`user:${socket.user.id}`);

    socket.on('chat:join', ({ chatId }) => {
      const member = db.prepare(`SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?`).get(chatId, socket.user.id);
      if (member) socket.join(chatId);
    });
  });

  return io;
}
