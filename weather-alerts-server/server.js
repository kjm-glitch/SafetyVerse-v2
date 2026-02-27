const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./db');
const weather = require('./weather');
const { startScheduler, runWeatherCheck } = require('./cron');
const { renderAlertEmail, sendAlertEmail, isEmailConfigured } = require('./emailer');
const { evaluateThresholds, evaluateForecast, evaluateNwsAlerts } = require('./alerts');

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

app.get('/api/sites', async (req, res) => {
  try {
    const sites = await db.getAllSites();
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sites/:id', async (req, res) => {
  try {
    const site = await db.getSiteById(req.params.id);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sites', async (req, res) => {
  try {
    const { name, city, state, latitude, longitude, manager_name, manager_email } = req.body;
    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Name, latitude, and longitude are required' });
    }
    const site = await db.createSite({
      name, city: city || null, state: state || null,
      latitude: parseFloat(latitude), longitude: parseFloat(longitude),
      manager_name: manager_name || null, manager_email: manager_email || null
    });
    res.status(201).json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sites/:id', async (req, res) => {
  try {
    const existing = await db.getSiteById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Site not found' });
    const { name, city, state, latitude, longitude, manager_name, manager_email } = req.body;
    const updated = await db.updateSite(req.params.id, {
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

app.delete('/api/sites/:id', async (req, res) => {
  try {
    const existing = await db.getSiteById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Site not found' });
    await db.deactivateSite(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Weather ─────────────────────────────────────────────

app.get('/api/weather/all', async (req, res) => {
  try {
    const sites = await db.getAllSites();
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
    const site = await db.getSiteById(req.params.siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    const conditions = await weather.fetchAllConditions(site.latitude, site.longitude);
    res.json({ site, conditions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alerts ──────────────────────────────────────────────

app.get('/api/alerts', async (req, res) => {
  try {
    const { siteId, limit = 50, offset = 0 } = req.query;
    const alerts = await db.getAlertHistory({
      siteId: siteId ? parseInt(siteId) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/alerts/active', async (req, res) => {
  try {
    const alerts = await db.getActiveAlerts();
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

// ── Admin: Email Testing & Manual Triggers ─────────────

// Test that email (Resend API) is configured
app.get('/api/admin/email-status', (req, res) => {
  const configured = isEmailConfigured();
  res.json({
    configured,
    provider: 'Resend HTTP API',
    from: config.EMAIL.from,
    apiKeySet: !!(config.EMAIL.auth.pass && config.EMAIL.auth.pass.startsWith('re_'))
  });
});

// Send a test email to verify SMTP delivery works
app.post('/api/admin/test-email', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Recipient email (to) is required' });

    if (!isEmailConfigured()) {
      return res.status(400).json({ error: 'Email is not configured. Check SMTP environment variables.' });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <div style="background:#2563eb;color:#fff;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;">Email Test Successful ✓</h2>
        </div>
        <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 10px;">This is a test email from <strong>TheSafetyVerse Weather Alerts</strong>.</p>
          <p style="margin:0 0 10px;">If you're reading this, your SMTP configuration is working correctly.</p>
          <p style="margin:0;color:#64748b;font-size:13px;">
            Host: ${config.EMAIL.host} | Port: ${config.EMAIL.port} | Secure: ${config.EMAIL.secure}<br>
            Sent at: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Denver' })} MST
          </p>
        </div>
      </div>`;

    const result = await sendAlertEmail(to, '[TEST] SafetyVerse Weather Alerts — Email Delivery Test', html);

    if (result.sent) {
      res.json({ success: true, message: `Test email sent to ${to}`, messageId: result.messageId });
    } else {
      res.status(500).json({ success: false, error: result.reason || 'Unknown error sending email' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manually trigger alert emails for a specific site (bypasses cooldown)
app.post('/api/admin/send-alert/:siteId', async (req, res) => {
  try {
    const site = await db.getSiteById(req.params.siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    if (!site.manager_email) return res.status(400).json({ error: 'No manager email set for this site' });

    if (!isEmailConfigured()) {
      return res.status(400).json({ error: 'Email is not configured. Check SMTP environment variables.' });
    }

    // Fetch current weather for the site
    const conditions = await weather.fetchAllConditions(site.latitude, site.longitude);

    // Evaluate all alert sources
    const currentAlerts = evaluateThresholds(conditions);
    const forecastAlerts = evaluateForecast(conditions);
    const nwsAlerts = evaluateNwsAlerts(conditions.nwsAlerts);
    const allAlerts = [...currentAlerts, ...forecastAlerts, ...nwsAlerts];

    if (allAlerts.length === 0) {
      // Send an "all clear" summary email instead
      const c = conditions.current;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#22c55e;color:#fff;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;">All Clear — No Active Alerts</h2>
            <p style="margin:6px 0 0;opacity:0.9;font-size:13px;">Manual check triggered by admin</p>
          </div>
          <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px;">
            <h3 style="margin:0 0 12px;">${site.name} — ${site.city || ''}${site.state ? ', ' + site.state : ''}</h3>
            <table style="font-size:14px;color:#334155;width:100%;">
              <tr><td style="padding:4px 0;width:45%;">Temperature:</td><td><strong>${c.temperature}°F</strong></td></tr>
              <tr><td style="padding:4px 0;">Feels Like:</td><td><strong>${c.apparent_temperature}°F</strong></td></tr>
              <tr><td style="padding:4px 0;">Wind Speed:</td><td><strong>${c.wind_speed} mph</strong></td></tr>
              <tr><td style="padding:4px 0;">Air Quality:</td><td><strong>${c.aqi != null ? c.aqi + ' (' + c.aqi_label + ')' : 'N/A'}</strong></td></tr>
              <tr><td style="padding:4px 0;">Conditions:</td><td>${c.weather_description}</td></tr>
            </table>
            ${conditions.nwsAlerts.length > 0 ? '<p style="margin-top:12px;color:#ea580c;"><strong>NWS Alerts:</strong> ' + conditions.nwsAlerts.map(n => n.event).join(', ') + '</p>' : ''}
            <p style="margin-top:16px;color:#94a3b8;font-size:12px;">Sent at: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Denver' })} MST</p>
          </div>
        </div>`;

      const result = await sendAlertEmail(
        site.manager_email,
        `[ALL CLEAR] Weather Status — ${site.name}`,
        html
      );

      return res.json({
        success: result.sent,
        alertsFound: 0,
        emailsSent: result.sent ? 1 : 0,
        message: result.sent
          ? `All-clear status email sent to ${site.manager_email}`
          : `Failed to send: ${result.reason}`
      });
    }

    // Send each alert email (bypassing cooldown)
    let emailsSent = 0;
    const results = [];
    for (const alert of allAlerts) {
      const severityPrefix = { warning: 'WARNING', watch: 'WATCH', advisory: 'ADVISORY' };
      const prefix = severityPrefix[alert.severity] || 'ALERT';
      const subject = `[${prefix}] ${alert.label} — ${site.name}`;
      const html = renderAlertEmail(alert, site, conditions, conditions.hourly);

      const result = await sendAlertEmail(site.manager_email, subject, html);
      if (result.sent) emailsSent++;
      results.push({ alert: alert.label, severity: alert.severity, sent: result.sent, error: result.reason });

      // Record in alert history
      const forecastData = alert.nwsDetail ? alert.nwsDetail : conditions.hourly;
      await db.insertAlert({
        site_id: site.id,
        alert_type: alert.type,
        severity: alert.severity || 'watch',
        threshold_value: alert.threshold,
        actual_value: alert.actual,
        description: (alert.description || '') + ' [MANUAL]',
        conditions_json: JSON.stringify(conditions.current),
        forecast_json: JSON.stringify(forecastData),
        email_sent: result.sent ? 1 : 0,
        email_recipient: site.manager_email
      });
    }

    res.json({
      success: emailsSent > 0,
      alertsFound: allAlerts.length,
      emailsSent,
      message: `${emailsSent}/${allAlerts.length} alert email(s) sent to ${site.manager_email}`,
      details: results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a sample protocol email (for testing operational response formatting)
app.post('/api/admin/test-protocol', async (req, res) => {
  try {
    const { to, alertType = 'cold_temp', severity = 'watch' } = req.body;
    const recipient = to || 'katie.mead@cencoregroup.com';

    if (!isEmailConfigured()) {
      return res.status(400).json({ error: 'Email is not configured.' });
    }

    // Use a real site for sample data
    const sites = await db.getAllSites();
    const site = sites[0] || { name: 'Test Site', city: 'Denver', state: 'CO', latitude: 39.7, longitude: -104.9 };

    // Fetch real weather so forecast table is populated
    const conditions = await weather.fetchAllConditions(site.latitude, site.longitude);

    // Build a fake alert to test the protocol rendering
    const fakeAlert = {
      type: alertType,
      severity: severity,
      label: `${alertType.replace(/_/g, ' ').toUpperCase()} ${severity.toUpperCase()}`,
      threshold: alertType === 'heat_index' ? 95 : alertType === 'cold_temp' ? 20 : alertType === 'wind_speed' ? 45 : 150,
      actual: alertType === 'heat_index' ? 102 : alertType === 'cold_temp' ? 12 : alertType === 'wind_speed' ? 55 : 175,
      unit: alertType === 'aqi' ? '' : (alertType === 'wind_speed' ? ' mph' : '°F'),
      description: `[TEST] Sample ${severity} alert for protocol email verification`
    };

    const severityPrefix = { warning: 'WARNING', watch: 'WATCH', advisory: 'ADVISORY' };
    const prefix = severityPrefix[severity] || 'ALERT';
    const subject = `[${prefix}] [TEST] ${fakeAlert.label} — ${site.name}`;
    const html = renderAlertEmail(fakeAlert, site, conditions, conditions.hourly);

    const result = await sendAlertEmail(recipient, subject, html);

    res.json({
      success: result.sent,
      message: result.sent
        ? `Test protocol email (${alertType}/${severity}) sent to ${recipient}`
        : `Failed: ${result.reason}`,
      alertType,
      severity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ───────────────────────────────────────────────

db.initDb().then(() => {
  app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`Weather Alerts server running on port ${config.PORT}`);
    startScheduler();
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
