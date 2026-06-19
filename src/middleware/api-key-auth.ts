import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config';

/**
 * Constant-time comparison to avoid leaking key length / contents via timing.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key');
  if (!apiKey || !safeEqual(apiKey, config.apiKey)) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid or missing X-API-Key header',
    });
  }
  return next();
}
