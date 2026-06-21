import express from 'express';
import { config } from './config';
import { logger } from './lib/logger';
import campaignsRouter from './routes/campaigns';
import diagRouter from './routes/diag';
import webhooksRouter from './routes/webhooks';
import { getWebhookConfig } from './webhooks/config';
import { getNotificationReadiness } from './webhooks/notify';

export const app = express();

// Phase 1 webhooks need the raw request body for HMAC signature verification,
// so the raw parser is mounted on this path BEFORE the global JSON parser. Each
// handler parses JSON itself from the Buffer. (express.json sets req._body and
// would otherwise consume the stream before the verifier sees it.)
app.use('/api/v1/webhooks', express.raw({ type: '*/*', limit: '5mb' }), webhooksRouter);

app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  const wh = getWebhookConfig();
  const notifications = getNotificationReadiness();
  res.json({
    status: 'ok',
    service: 'aurum-ads-engine',
    version: '0.5.2',
    phase: 4,
    features: {
      meta: { ready: !config.meta.mockMode, mockMode: config.meta.mockMode },
      tiktok: { ready: !config.tiktok.mockMode, mockMode: config.tiktok.mockMode },
      webhooks: {
        mockMode: wh.mockMode,
        metaVerifyToken: Boolean(wh.metaVerifyToken),
        tiktokSecret: Boolean(wh.tiktokSecret),
        notifications,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// Phase 2/3 · Meta + TikTok Marketing API campaign endpoints
app.use('/api/v1/campaigns', campaignsRouter);

// Diagnostics · Meta configuration health (/api/v1/diag/meta)
app.use('/api/v1/diag', diagRouter);

// Start the server unless imported by tests (supertest drives `app` directly).
if (require.main === module) {
  app.listen(config.port, () => {
    logger.info('server.listening', { port: config.port });
  });
}
