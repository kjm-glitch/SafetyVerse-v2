const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./db');
const weather = require('./weather');
const { startScheduler, runWeatherCheck } = require('./cron');

const app = express();
app.use(express.json());

// Serve the frontend
app.use(express.static(config.STATIC_DIR));

// CORS for local development (dashboard served from file:// or different port)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Job Sites ───────────────────────────────────────────

app.get('/api/sites', (req, res) => {
  try {
    const sites = db.getAllSites();
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sites/:id', (req, res) => {
  try {
    const site = db.getSiteById(req.params.id);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sites', (req, res) => {
  try {
    const { name, city, state, latitude, longitude, manager_name, manager_email } = req.body;
    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Name, latitude, and longitude are required' });
    }
    const site = db.createSite({
      name, city: city || null, state: state || null,
      latitude: parseFloat(latitude), longitude: parseFloat(longitude),
      manager_name: manager_name || null, manager_email: manager_email || null
    });
    res.status(201).json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sites/:id', (req, res) => {
  try {
    const existing = db.getSiteById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Site not found' });
    const { name, city, state, latitude, longitude, manager_name, manager_email } = req.body;
    const updated = db.updateSite(req.params.id, {
      name: name || existing.name,
      city: city !== undefined ? city : existing.city,
      state: state !== undefined ? state : existing.state,
      latitude: latitude != null ? parseFloat(latitude) : existing.latitude,
      longitude: longitude != null ? parseFloat(longitude) : existing.longitude,
      manager_name: manager_name !== undefined ? manager_name : existing.manager_name,
      manager_email: manager_email !== undefined ? manager_email : existing.manager_email
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sites/:id', (req, res) => {
  try {
    const existing = db.getSiteById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Site not found' });
    db.deactivateSite(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Weather ─────────────────────────────────────────────

app.get('/api/weather/all', async (req, res) => {
  try {
    const sites = db.getAllSites();
    const results = await Promise.allSettled(
      sites.map(async site => {
        const conditions = await weather.fetchAllConditions(site.latitude, site.longitude);
        return { site, conditions };
      })
    );
    const data = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { site: sites[i], conditions: null, error: r.reason?.message };
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/weather/:siteId', async (req, res) => {
  try {
    const site = db.getSiteById(req.params.siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    const conditions = await weather.fetchAllConditions(site.latitude, site.longitude);
    res.json({ site, conditions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alerts ──────────────────────────────────────────────

app.get('/api/alerts', (req, res) => {
  try {
    const { siteId, limit = 50, offset = 0 } = req.query;
    const alerts = db.getAlertHistory({
      siteId: siteId ? parseInt(siteId) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/alerts/active', (req, res) => {
  try {
    const alerts = db.getActiveAlerts();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alerts/check-now', async (req, res) => {
  try {
    const result = await runWeatherCheck();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Thresholds config ───────────────────────────────────

app.get('/api/config/thresholds', (req, res) => {
  res.json(config.THRESHOLDS);
});

// ── Start ───────────────────────────────────────────────

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Weather Alerts server running on port ${config.PORT}`);
  startScheduler();
});
