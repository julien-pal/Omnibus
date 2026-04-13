import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config/manager';

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const appConfig = getConfig('app');

  if (!appConfig.auth || !appConfig.auth.enabled) {
    // Auth disabled — still honour a JWT if present so profiles can separate progress
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ') && appConfig.jwtSecret) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), appConfig.jwtSecret) as {
          username: string;
          role: string;
          profileId: string;
        };
        req.user = decoded;
        next();
        return;
      } catch {
        // Token invalid/expired — fall through to anonymous
      }
    }
    req.user = { username: 'anonymous', role: 'admin', profileId: 'default' };
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const secret = appConfig.jwtSecret;
    if (!secret) {
      res.status(500).json({ error: 'Server misconfigured: JWT secret not set' });
      return;
    }
    const decoded = jwt.verify(token, secret) as {
      username: string;
      role: string;
      profileId: string;
      iat?: number;
      exp?: number;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export default authMiddleware;
