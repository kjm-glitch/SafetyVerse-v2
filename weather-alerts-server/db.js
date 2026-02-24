const Database = require('better-sqlite3');
const config = require('./config');
const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(config.DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS job_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT,
    state TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    manager_name TEXT,
    manager_email TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alert_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    severity TEXT DEFAULT 'watch',
    threshold_value REAL NOT NULL,
    actual_value REAL NOT NULL,
    description TEXT,
    conditions_json TEXT,
    forecast_json TEXT,
    email_sent INTEGER DEFAULT 0,
    email_recipient TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (site_id) REFERENCES job_sites(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS alert_cooldowns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    last_alerted_at TEXT NOT NULL,
    UNIQUE(site_id, alert_type),
    FOREIGN KEY (site_id) REFERENCES job_sites(id) ON DELETE CASCADE
  );
`);

// ── Migration: add severity + description columns if missing ──
try {
  db.exec(`ALTER TABLE alert_history ADD COLUMN severity TEXT DEFAULT 'watch'`);
} catch (e) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE alert_history ADD COLUMN description TEXT`);
} catch (e) { /* column already exists */ }

// ── Job Sites ───────────────────────────────────────────

const stmts = {
  getAllSites: db.prepare('SELECT * FROM job_sites WHERE is_active = 1 ORDER BY name'),
  getSiteById: db.prepare('SELECT * FROM job_sites WHERE id = ?'),
  createSite: db.prepare(`
    INSERT INTO job_sites (name, city, state, latitude, longitude, manager_name, manager_email)
    VALUES (@name, @city, @state, @latitude, @longitude, @manager_name, @manager_email)
  `),
  updateSite: db.prepare(`
    UPDATE job_sites
    SET name = @name, city = @city, state = @state,
        latitude = @latitude, longitude = @longitude,
        manager_name = @manager_name, manager_email = @manager_email,
        updated_at = datetime('now')
    WHERE id = @id
  `),
  deactivateSite: db.prepare('UPDATE job_sites SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?'),

  // Alert history
  insertAlert: db.prepare(`
    INSERT INTO alert_history (site_id, alert_type, severity, threshold_value, actual_value, description, conditions_json, forecast_json, email_sent, email_recipient)
    VALUES (@site_id, @alert_type, @severity, @threshold_value, @actual_value, @description, @conditions_json, @forecast_json, @email_sent, @email_recipient)
  `),
  getAlertHistory: db.prepare(`
    SELECT ah.*, js.name as site_name, js.city, js.state
    FROM alert_history ah
    JOIN job_sites js ON ah.site_id = js.id
    ORDER BY ah.created_at DESC
    LIMIT ? OFFSET ?
  `),
  getAlertHistoryBySite: db.prepare(`
    SELECT ah.*, js.name as site_name, js.city, js.state
    FROM alert_history ah
    JOIN job_sites js ON ah.site_id = js.id
    WHERE ah.site_id = ?
    ORDER BY ah.created_at DESC
    LIMIT ? OFFSET ?
  `),
  getActiveAlerts: db.prepare(`
    SELECT ah.*, js.name as site_name, js.city, js.state, js.manager_name, js.manager_email
    FROM alert_history ah
    JOIN job_sites js ON ah.site_id = js.id
    WHERE ah.created_at >= datetime('now', '-4 hours')
    ORDER BY
      CASE ah.severity
        WHEN 'warning' THEN 1
        WHEN 'watch' THEN 2
        WHEN 'advisory' THEN 3
        ELSE 4
      END,
      ah.created_at DESC
  `),

  // Cooldowns
  getCooldown: db.prepare('SELECT last_alerted_at FROM alert_cooldowns WHERE site_id = ? AND alert_type = ?'),
  setCooldown: db.prepare(`
    INSERT INTO alert_cooldowns (site_id, alert_type, last_alerted_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(site_id, alert_type)
    DO UPDATE SET last_alerted_at = datetime('now')
  `),
};

module.exports = {
  db,

  getAllSites() {
    return stmts.getAllSites.all();
  },

  getSiteById(id) {
    return stmts.getSiteById.get(id);
  },

  createSite(data) {
    const result = stmts.createSite.run(data);
    return { id: result.lastInsertRowid, ...data };
  },

  updateSite(id, data) {
    stmts.updateSite.run({ id, ...data });
    return this.getSiteById(id);
  },

  deactivateSite(id) {
    stmts.deactivateSite.run(id);
  },

  insertAlert(data) {
    const result = stmts.insertAlert.run(data);
    return result.lastInsertRowid;
  },

  getAlertHistory({ siteId, limit = 50, offset = 0 } = {}) {
    if (siteId) {
      return stmts.getAlertHistoryBySite.all(siteId, limit, offset);
    }
    return stmts.getAlertHistory.all(limit, offset);
  },

  getActiveAlerts() {
    return stmts.getActiveAlerts.all();
  },

  isCooldownActive(siteId, alertType) {
    const row = stmts.getCooldown.get(siteId, alertType);
    if (!row) return false;
    const lastAlerted = new Date(row.last_alerted_at + 'Z');
    const hoursAgo = (Date.now() - lastAlerted.getTime()) / (1000 * 60 * 60);
    return hoursAgo < config.COOLDOWN_HOURS;
  },

  setCooldown(siteId, alertType) {
    stmts.setCooldown.run(siteId, alertType);
  }
};
