import { countReadings, insertReadings } from './db.js';
import { generateMockBatch } from './mock.js';

function mapExternalReading(item) {
  const latitude = Number(item.latitude ?? item.lat ?? item?.position?.lat);
  const longitude = Number(item.longitude ?? item.lng ?? item?.position?.lng);
  const aqi = Number(item.aqi ?? item.index ?? item.indice);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(aqi)) {
    return null;
  }

  return {
    measuredAt: new Date(
      item.measuredAt || item.timestamp || item.date || Date.now()
    ).toISOString(),
    city: item.city || item.zone || item.name || 'Zone inconnue',
    latitude,
    longitude,
    aqi: Math.round(aqi),
    source: 'data-team-endpoint',
  };
}

async function fetchBatchFromDataSource(dataSourceUrl) {
  if (!dataSourceUrl) {
    return generateMockBatch(8);
  }

  try {
    const response = await fetch(dataSourceUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload.data || [];

    const mapped = rows.map(mapExternalReading).filter(Boolean);

    return mapped.length ? mapped : generateMockBatch(8);
  } catch {
    return generateMockBatch(8);
  }
}

export async function bootstrapMockData() {
  const existing = await countReadings();
  if (existing > 0) return;

  const now = Date.now();
  const seeded = [];

  for (let offset = 48; offset >= 0; offset -= 1) {
    const measuredAt = new Date(now - offset * 30 * 60 * 1000).toISOString();
    seeded.push(...generateMockBatch(4, measuredAt));
  }

  await insertReadings(seeded);
}

export function startWorker({ intervalMs, dataSourceUrl, onTickError }) {
  const effectiveIntervalMs = Math.max(10_000, intervalMs || 120_000);
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;

    try {
      const batch = await fetchBatchFromDataSource(dataSourceUrl);
      await insertReadings(batch);
    } catch (error) {
      if (onTickError) onTickError(error);
    } finally {
      running = false;
    }
  };

  void run();

  const timer = setInterval(() => {
    void run();
  }, effectiveIntervalMs);

  return () => clearInterval(timer);
}
