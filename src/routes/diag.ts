import { Router } from 'express';
import { apiKeyAuth } from '../middleware/api-key-auth';
import { runMetaDiagnostics } from '../platforms/meta/diag';
import { logger } from '../lib/logger';

const router = Router();
router.use(apiKeyAuth);

/**
 * GET /api/v1/diag/meta — Meta configuration health check.
 *
 * Validates env vars, token validity + scope coverage, page-in-scope,
 * ad-account ownership, pixel ownership, page tasks, and lead-form read.
 * Always returns 200 with a structured verdict (even when checks fail) so the
 * misconfiguration can be diagnosed without reading server logs.
 */
router.get('/meta', async (_req, res) => {
  try {
    const report = await runMetaDiagnostics();
    return res.json(report);
  } catch (err) {
    // Defensive: runMetaDiagnostics swallows per-check failures, so reaching
    // here means something unexpected (not a Graph rejection) went wrong.
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('diag.meta.error', { message });
    return res.status(500).json({ ok: false, error: 'diag_failed', message });
  }
});

export default router;
