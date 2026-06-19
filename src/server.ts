import express from 'express';
import { config } from './config';
import { logger } from './lib/logger';
import campaignsRouter from './routes/campaigns';

export const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'aurum-ads-engine',
    version: '0.2.0',
    phase: 2,
    features: {
      meta: { ready: !config.meta.mockMode, mockMode: config.meta.mockMode },
    },
    timestamp: new Date().toISOString(),
  });
});

// Phase 2 · Meta Marketing API campaign endpoints
app.use('/api/v1/campaigns', campaignsRouter);

// Phase 1+ webhooks mounted here (deferred):
// app.use('/webhooks/line', lineWebhookHandler);
// app.use('/webhooks/meta', metaWebhookHandler);
// app.use('/webhooks/tiktok', tiktokWebhookHandler);
// app.use('/webhooks/pixel', pixelWebhookHandler);

// Start the server unless imported by tests (supertest drives `app` directly).
if (require.main === module) {
  app.listen(config.port, () => {
    logger.info('server.listening', { port: config.port });
  });
}
