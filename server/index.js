import express from 'express';
import cors from 'cors';
import {
  closeDb,
  getDbInfo,
  initDb,
  normalizeFilters,
  queryReadings,
} from './db.js';
import { bootstrapMockData, startWorker } from './worker.js';

const PORT = Number(process.env.PORT || 8787);
const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 120000);
const ENABLE_WORKER = process.env.ENABLE_WORKER !== 'false';
const DATA_SOURCE_URL = process.env.DATA_SOURCE_URL || '';

async function main() {
  await initDb();
  await bootstrapMockData();

  let stopWorker = null;
  if (ENABLE_WORKER) {
    stopWorker = startWorker({
      intervalMs: WORKER_INTERVAL_MS,
      dataSourceUrl: DATA_SOURCE_URL,
      onTickError: (error) => {
        console.error('[air-map][worker] Tick error:', error.message);
      },
    });
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      database: getDbInfo(),
      workerEnabled: ENABLE_WORKER,
      workerIntervalMs: WORKER_INTERVAL_MS,
      dataSourceConfigured: Boolean(DATA_SOURCE_URL),
      now: new Date().toISOString(),
    });
  });

  app.get('/api/readings', async (req, res) => {
    try {
      const normalized = normalizeFilters(req.query);
      const result = await queryReadings(normalized);

      res.json({
        data: result.rows,
        meta: {
          total: result.total,
          returned: result.rows.length,
          mode: result.mode,
          generatedAt: new Date().toISOString(),
          filters: normalized,
        },
      });
    } catch (error) {
      res.status(400).json({
        error: error.message || 'Paramètres invalides.',
      });
    }
  });

  const server = app.listen(PORT, () => {
    console.log(`[air-map] API disponible sur http://localhost:${PORT}`);
  });

  async function shutdown() {
    if (stopWorker) stopWorker();

    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[air-map] Impossible de démarrer le serveur:', error);
  process.exit(1);
});
