import express from 'express';
import { config } from 'dotenv';

config();

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'aurum-ads-engine',
    version: '0.1.0',
    phase: 0,
    timestamp: new Date().toISOString()
  });
});

// Phase 1+ webhooks mounted here:
// app.use('/webhooks/line', lineWebhookHandler);
// app.use('/webhooks/meta', metaWebhookHandler);
// app.use('/webhooks/tiktok', tiktokWebhookHandler);
// app.use('/webhooks/pixel', pixelWebhookHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`aurum-ads-engine listening on :${PORT}`);
});
