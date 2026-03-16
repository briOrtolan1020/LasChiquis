import { verifyToken } from '../utils/auth.js';

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'No autorizado' });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido o vencido' });
  }
}
