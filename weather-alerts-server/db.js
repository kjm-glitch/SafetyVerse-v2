const { Pool, types } = require('pg');
const config = require('./config');

// Return TIMESTAMPTZ as ISO strings (not JS Date objects)
// so the frontend's new Date(...) parsing works consistently
types.setTypeParser(1184, (val) => val); // TIMESTAMPTZ
types.setTypeParser(1114, (val) => val); // TIMESTAMP

// Create connection pool
// Use SSL only when DATABASE_URL contains a non-internal host (e.g., Railway's managed Postgres add-on)
// Internal networking (*.railway.internal) does not use SSL
const useSSL = !!process.env.DATABASE_URL && !config.DATABASE_URL.includes('.railway.internal');
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

// ── Schema ──────────────────────────────────────────────

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_sites (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      state TEXT,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      manager_name TEXT,
      manager_email TEXT,
      is_active SMALLINT DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alert_history (
      id SERIAL PRIMARY KEY,
      site_id INTEGER NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'watch',
      threshold_value DOUBLE PRECISION NOT NULL,
      actual_value DOUBLE PRECISION NOT NULL,
      description TEXT,
      conditions_json JSONB,
      forecast_json JSONB,
      email_sent SMALLINT DEFAULT 0,
      email_recipient TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alert_cooldowns (
      id SERIAL PRIMARY KEY,
      site_id INTEGER NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      last_alerted_at TIMESTAMPTZ NOT NULL,
      UNIQUE(site_id, alert_type)
    );
  `);
  console.log('[DB] PostgreSQL tables initialized');
}

// ── Job Sites ───────────────────────────────────────────

async function getAllSites() {
  const { rows } = await pool.query(
    'SELECT * FROM job_sites WHERE is_active = 1 ORDER BY name'
  );
  return rows;
}

async function getSiteById(id) {
  const { rows } = await pool.query(
    'SELECT * FROM job_sites WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function createSite(data) {
  const { rows } = await pool.query(
    `INSERT INTO job_sites (name, city, state, latitude, longitude, manager_name, manager_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [data.name, data.city, data.state, data.latitude, data.longitude, data.manager_name, data.manager_email]
  );
  return { id: rows[0].id, ...data };
}

async function updateSite(id, data) {
  await pool.query(
    `UPDATE job_sites
     SET name = $1, city = $2, state = $3,
         latitude = $4, longitude = $5,
         manager_name = $6, manager_email = $7,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $8`,
    [data.name, data.city, data.state, data.latitude, data.longitude, data.manager_name, data.manager_email, id]
  );
  return getSiteById(id);
}

async function deactivateSite(id) {
  await pool.query(
    'UPDATE job_sites SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id]
  );
}

// ── Alert History ───────────────────────────────────────

async function insertAlert(data) {
  const { rows } = await pool.query(
    `INSERT INTO alert_history (site_id, alert_type, severity, threshold_value, actual_value, description, conditions_json, forecast_json, email_sent, email_recipient)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [data.site_id, data.alert_type, data.severity, data.threshold_value, data.actual_value, data.description, data.conditions_json, data.forecast_json, data.email_sent, data.email_recipient]
  );
  return rows[0].id;
}

async function getAlertHistory({ siteId, limit = 50, offset = 0 } = {}) {
  if (siteId) {
    const { rows } = await pool.query(
      `SELECT ah.*, js.name as site_name, js.city, js.state
       FROM alert_history ah
       JOIN job_sites js ON ah.site_id = js.id
       WHERE ah.site_id = $1
       ORDER BY ah.created_at DESC
       LIMIT $2 OFFSET $3`,
      [siteId, limit, offset]
    );
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT ah.*, js.name as site_name, js.city, js.state
     FROM alert_history ah
     JOIN job_sites js ON ah.site_id = js.id
     ORDER BY ah.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function getActiveAlerts() {
  const { rows } = await pool.query(
    `SELECT ah.*, js.name as site_name, js.city, js.state, js.manager_name, js.manager_email
     FROM alert_history ah
     JOIN job_sites js ON ah.site_id = js.id
     WHERE ah.created_at >= now() - interval '4 hours'
     ORDER BY
       CASE ah.severity
         WHEN 'warning' THEN 1
         WHEN 'watch' THEN 2
         WHEN 'advisory' THEN 3
         ELSE 4
       END,
       ah.created_at DESC`
  );
  return rows;
}

// ── Cooldowns ───────────────────────────────────────────

async function isCooldownActive(siteId, alertType) {
  const { rows } = await pool.query(
    'SELECT last_alerted_at FROM alert_cooldowns WHERE site_id = $1 AND alert_type = $2',
    [siteId, alertType]
  );
  if (rows.length === 0) return false;
  const lastAlerted = new Date(rows[0].last_alerted_at);
  const hoursAgo = (Date.now() - lastAlerted.getTime()) / (1000 * 60 * 60);
  return hoursAgo < config.COOLDOWN_HOURS;
}

async function setCooldown(siteId, alertType) {
  await pool.query(
    `INSERT INTO alert_cooldowns (site_id, alert_type, last_alerted_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(site_id, alert_type)
     DO UPDATE SET last_alerted_at = CURRENT_TIMESTAMP`,
    [siteId, alertType]
  );
}

// ── Exports ─────────────────────────────────────────────

module.exports = {
  pool,
  initDb,
  getAllSites,
  getSiteById,
  createSite,
  updateSite,
  deactivateSite,
  insertAlert,
  getAlertHistory,
  getActiveAlerts,
  isCooldownActive,
  setCooldown
};
