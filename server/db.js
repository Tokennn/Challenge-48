import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/air_map';

const pool = new Pool({
  connectionString: DATABASE_URL,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS readings (
      id BIGSERIAL PRIMARY KEY,
      measured_at TIMESTAMPTZ NOT NULL,
      city TEXT NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      aqi INTEGER NOT NULL,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_readings_measured_at ON readings (measured_at DESC);
    CREATE INDEX IF NOT EXISTS idx_readings_lat_lng ON readings (latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_readings_city ON readings (city);
    CREATE INDEX IF NOT EXISTS idx_readings_aqi ON readings (aqi);
  `);
}

export async function closeDb() {
  await pool.end();
}

export async function insertReadings(items) {
  if (!Array.isArray(items) || items.length === 0) return;

  const values = [];
  const placeholders = [];

  for (const item of items) {
    values.push(
      item.measuredAt,
      item.city,
      item.latitude,
      item.longitude,
      item.aqi,
      item.source
    );

    const index = values.length;
    placeholders.push(
      `($${index - 5}, $${index - 4}, $${index - 3}, $${index - 2}, $${index - 1}, $${index})`
    );
  }

  await pool.query(
    `
      INSERT INTO readings (measured_at, city, latitude, longitude, aqi, source)
      VALUES ${placeholders.join(', ')}
    `,
    values
  );
}

export async function countReadings() {
  const result = await pool.query('SELECT COUNT(*)::int AS total FROM readings');
  return result.rows[0]?.total ?? 0;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateStart(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseDateEnd(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeFilters(rawFilters) {
  const filters = {
    startDate: parseDateStart(rawFilters.startDate),
    endDate: parseDateEnd(rawFilters.endDate),
    minLat: parseOptionalNumber(rawFilters.minLat),
    maxLat: parseOptionalNumber(rawFilters.maxLat),
    minLng: parseOptionalNumber(rawFilters.minLng),
    maxLng: parseOptionalNumber(rawFilters.maxLng),
    minAqi: parseOptionalNumber(rawFilters.minAqi),
    maxAqi: parseOptionalNumber(rawFilters.maxAqi),
    limit: parseOptionalNumber(rawFilters.limit) ?? 300,
    aggregateBy: rawFilters.aggregateBy === 'city' ? 'city' : 'none',
  };

  if (filters.limit < 1 || filters.limit > 1000) {
    throw new Error('Le paramètre "limit" doit être compris entre 1 et 1000.');
  }

  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new Error('La date de début doit être antérieure ou égale à la date de fin.');
  }

  if (filters.minLat !== null && filters.maxLat !== null && filters.minLat > filters.maxLat) {
    throw new Error('Latitude min doit être <= latitude max.');
  }

  if (filters.minLng !== null && filters.maxLng !== null && filters.minLng > filters.maxLng) {
    throw new Error('Longitude min doit être <= longitude max.');
  }

  if (filters.minAqi !== null && filters.maxAqi !== null && filters.minAqi > filters.maxAqi) {
    throw new Error('Indice min doit être <= indice max.');
  }

  return filters;
}

function buildWhereClause(filters) {
  const conditions = [];
  const values = [];

  if (filters.startDate) {
    values.push(filters.startDate);
    conditions.push(`measured_at >= $${values.length}`);
  }

  if (filters.endDate) {
    values.push(filters.endDate);
    conditions.push(`measured_at <= $${values.length}`);
  }

  if (filters.minLat !== null) {
    values.push(filters.minLat);
    conditions.push(`latitude >= $${values.length}`);
  }

  if (filters.maxLat !== null) {
    values.push(filters.maxLat);
    conditions.push(`latitude <= $${values.length}`);
  }

  if (filters.minLng !== null) {
    values.push(filters.minLng);
    conditions.push(`longitude >= $${values.length}`);
  }

  if (filters.maxLng !== null) {
    values.push(filters.maxLng);
    conditions.push(`longitude <= $${values.length}`);
  }

  if (filters.minAqi !== null) {
    values.push(filters.minAqi);
    conditions.push(`aqi >= $${values.length}`);
  }

  if (filters.maxAqi !== null) {
    values.push(filters.maxAqi);
    conditions.push(`aqi <= $${values.length}`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, values };
}

export async function queryReadings(filters) {
  const { whereSql, values } = buildWhereClause(filters);

  if (filters.aggregateBy === 'city') {
    const limitPlaceholder = `$${values.length + 1}`;
    const queryValues = [...values, filters.limit];

    const rowsResult = await pool.query(
      `
        SELECT
          MIN(id)::bigint AS id,
          city,
          ROUND(AVG(aqi)::numeric, 0)::int AS aqi,
          ROUND(AVG(aqi)::numeric, 2)::float8 AS "avgAqi",
          COUNT(*)::int AS "sampleSize",
          AVG(latitude)::float8 AS latitude,
          AVG(longitude)::float8 AS longitude,
          MAX(measured_at) AS "measuredAt",
          'aggregated-city'::text AS source
        FROM readings
        ${whereSql}
        GROUP BY city
        ORDER BY AVG(aqi) DESC
        LIMIT ${limitPlaceholder}
      `,
      queryValues
    );

    const totalResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT city
          FROM readings
          ${whereSql}
          GROUP BY city
        ) grouped
      `,
      values
    );

    return {
      rows: rowsResult.rows,
      total: totalResult.rows[0]?.total ?? 0,
      mode: 'city',
    };
  }

  const limitPlaceholder = `$${values.length + 1}`;
  const queryValues = [...values, filters.limit];

  const rowsResult = await pool.query(
    `
      SELECT
        id,
        measured_at AS "measuredAt",
        city,
        latitude,
        longitude,
        aqi,
        source
      FROM readings
      ${whereSql}
      ORDER BY measured_at DESC
      LIMIT ${limitPlaceholder}
    `,
    queryValues
  );

  const totalResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM readings
      ${whereSql}
    `,
    values
  );

  return {
    rows: rowsResult.rows,
    total: totalResult.rows[0]?.total ?? 0,
    mode: 'none',
  };
}

export function getDbInfo() {
  return {
    provider: 'postgresql',
    urlConfigured: Boolean(process.env.DATABASE_URL),
    databaseUrl: DATABASE_URL,
  };
}
