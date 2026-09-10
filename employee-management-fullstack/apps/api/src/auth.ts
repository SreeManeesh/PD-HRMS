import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';

const secret = process.env.JWT_SECRET || 'dev-secret-change-me';

type TokenPayload = { userId: string; organizationId: string; roles: string[] };

export function issueToken(payload: TokenPayload) {
  return jwt.sign(payload, secret, { expiresIn: '2h' });
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function auth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.header('authorization');
  if (!bearer?.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication required' });
  try {
    const payload = jwt.verify(bearer.slice(7), secret) as TokenPayload;
    res.locals.auth = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
