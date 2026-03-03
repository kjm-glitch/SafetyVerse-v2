const cron = require('node-cron');
const config = require('./config');
const db = require('./db');
const weather = require('./weather');
const { evaluateThresholds, evaluateForecast, evaluateNwsAlerts } = require('./alerts');
const { renderBundledAlertEmail, sendAlertEmail } = require('./emailer');

// ── Severity ranking for subject line ──────────────────
const SEVERITY_RANK = { warning: 0, watch: 1, advisory: 2 };

// ── Work-hours gating ──────────────────────────────────
// Returns true if the alert should be suppressed (advisory + outside work hours)
function isOvernightSuppressed(alert) {
  // Only suppress advisories — warnings and watches are safety-critical 24/7
  if (alert.severity !== 'advisory') return false;

  const tz = config.DEFAULT_TIMEZONE || 'America/Denver';
  const now = new Date();

  // Get current local time in HH:MM (24h format)
  const localTimeStr = now.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });

  const [hours, minutes] = localTimeStr.split(':').map(Number);
  const currentMinutes = hours * 60 + minutes;

  const [startH, startM] = config.WORK_HOURS.start.split(':').map(Number);
  const [endH, endM] = config.WORK_HOURS.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;  // 330 = 5:30 AM
  const endMinutes = endH * 60 + endM;        // 1320 = 10:00 PM

  // Suppress if OUTSIDE work hours
  const isWithinWorkHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
  return !isWithinWorkHours;
}

async function runWeatherCheck() {
  const startTime = Date.now();
  console.log(`\n[CRON] Weather check started at ${new Date().toISOString()}`);

  const sites = await db.getAllSites();
  if (sites.length === 0) {
    console.log('[CRON] No active job sites. Skipping.');
    return { sitesChecked: 0, alertsSent: 0 };
  }

  let totalAlerts = 0;
  let errors = 0;

  const results = await Promise.allSettled(
    sites.map(site => checkSite(site))
  );

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      totalAlerts += result.value;
    } else {
      errors++;
      console.error(`[CRON] Error checking ${sites[i].name}: ${result.reason?.message}`);
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[CRON] Check complete: ${sites.length} sites, ${totalAlerts} alerts sent, ${errors} errors (${elapsed}s)`);

  return {
    sitesChecked: sites.length,
    alertsSent: totalAlerts,
    errors,
    elapsedSeconds: parseFloat(elapsed)
  };
}

async function checkSite(site) {
  const conditions = await weather.fetchAllConditions(site.latitude, site.longitude);

  // Evaluate all three alert sources
  const currentAlerts = evaluateThresholds(conditions);      // watch/warning (orange/red)
  const forecastAlerts = evaluateForecast(conditions);        // advisory (yellow)
  const nwsAlerts = evaluateNwsAlerts(conditions.nwsAlerts);  // warning/watch (red/orange)

  const allAlerts = [...currentAlerts, ...forecastAlerts, ...nwsAlerts];

  if (allAlerts.length === 0) {
    console.log(`  [${site.name}] All clear — Temp: ${conditions.current.temperature}°F, Wind: ${conditions.current.wind_speed} mph, AQI: ${conditions.current.aqi ?? 'N/A'}`);
    return 0;
  }

  // ── PHASE 1: Filter alerts through work-hours gate, cooldown, and escalation ──
  const alertsToSend = [];

  for (const alert of allAlerts) {
    // Work-hours gating: suppress advisories overnight (no cooldown set, so they fire in the morning)
    if (isOvernightSuppressed(alert)) {
      console.log(`  [${site.name}] ${alert.label} — OVERNIGHT SUPPRESSED, skipping`);
      continue;
    }

    // Cooldown check with severity escalation override
    const cooldownActive = await db.isCooldownActive(site.id, alert.type);
    if (cooldownActive) {
      const escalate = await db.shouldEscalate(site.id, alert.type, alert.severity);
      if (!escalate) {
        console.log(`  [${site.name}] ${alert.label} — COOLDOWN ACTIVE, skipping`);
        continue;
      }
      console.log(`  [${site.name}] ${alert.label} — ESCALATION OVERRIDE (severity increased)`);
    }

    alertsToSend.push(alert);
  }

  if (alertsToSend.length === 0) return 0;

  // ── PHASE 2: Bundle all passing alerts into ONE email ──
  alertsToSend.sort((a, b) =>
    (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3)
  );

  const highestSeverity = alertsToSend[0].severity || 'watch';
  const severityPrefix = { warning: 'WARNING', watch: 'WATCH', advisory: 'ADVISORY' };
  const prefix = severityPrefix[highestSeverity] || 'ALERT';
  const subject = alertsToSend.length === 1
    ? `[${prefix}] ${alertsToSend[0].label} — ${site.name}`
    : `[${prefix}] ${alertsToSend.length} Weather Alerts — ${site.name}`;

  const html = renderBundledAlertEmail(alertsToSend, site, conditions, conditions.hourly);

  let emailSent = 0;
  let emailRecipient = site.manager_email || '';
  if (site.manager_email) {
    const result = await sendAlertEmail(site.manager_email, subject, html);
    emailSent = result.sent ? 1 : 0;
  } else {
    console.log(`  [${site.name}] No manager email set — alerts logged but no email sent`);
  }

  // ── PHASE 3: Record each alert individually (audit trail) + set cooldowns ──
  for (const alert of alertsToSend) {
    const severityTag = (alert.severity || 'watch').toUpperCase();
    console.log(`  [${site.name}] [${severityTag}] ${alert.label}${alert.description ? ' — ' + alert.description : ''}`);

    const forecastData = alert.nwsDetail ? alert.nwsDetail : conditions.hourly;

    await db.insertAlert({
      site_id: site.id,
      alert_type: alert.type,
      severity: alert.severity || 'watch',
      threshold_value: alert.threshold,
      actual_value: alert.actual,
      description: alert.description || null,
      conditions_json: JSON.stringify(conditions.current),
      forecast_json: JSON.stringify(forecastData),
      email_sent: emailSent,
      email_recipient: emailRecipient
    });

    // Set cooldown with severity (enables escalation override on next check)
    await db.setCooldown(site.id, alert.type, alert.severity);
  }

  return alertsToSend.length;
}

function startScheduler() {
  console.log(`[CRON] Scheduler started — checking every 30 minutes (${config.CRON_SCHEDULE})`);

  cron.schedule(config.CRON_SCHEDULE, () => {
    runWeatherCheck().catch(err => {
      console.error('[CRON] Unhandled error in weather check:', err);
    });
  });

  // Run initial check 5 seconds after startup
  setTimeout(() => {
    console.log('[CRON] Running initial weather check...');
    runWeatherCheck().catch(err => {
      console.error('[CRON] Initial check error:', err);
    });
  }, 5000);
}

module.exports = { startScheduler, runWeatherCheck };
