const cron = require('node-cron');
const config = require('./config');
const db = require('./db');
const weather = require('./weather');
const { evaluateThresholds, evaluateForecast, evaluateNwsAlerts } = require('./alerts');
const { renderAlertEmail, sendAlertEmail } = require('./emailer');

async function runWeatherCheck() {
  const startTime = Date.now();
  console.log(`\n[CRON] Weather check started at ${new Date().toISOString()}`);

  const sites = db.getAllSites();
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
  let alertCount = 0;

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

  for (const alert of allAlerts) {
    // Check cooldown
    if (db.isCooldownActive(site.id, alert.type)) {
      console.log(`  [${site.name}] ${alert.label} — COOLDOWN ACTIVE, skipping`);
      continue;
    }

    const severityTag = (alert.severity || 'watch').toUpperCase();
    console.log(`  [${site.name}] [${severityTag}] ${alert.label}${alert.description ? ' — ' + alert.description : ''}`);

    // Generate email
    const severityPrefix = { warning: 'WARNING', watch: 'WATCH', advisory: 'ADVISORY' };
    const prefix = severityPrefix[alert.severity] || 'ALERT';
    const subject = `[${prefix}] ${alert.label} — ${site.name}`;
    const html = renderAlertEmail(alert, site, conditions, conditions.hourly);

    // Send email if manager email is set
    let emailSent = 0;
    let emailRecipient = site.manager_email || '';
    if (site.manager_email) {
      const result = await sendAlertEmail(site.manager_email, subject, html);
      emailSent = result.sent ? 1 : 0;
    } else {
      console.log(`  [${site.name}] No manager email set — alert logged but no email sent`);
    }

    // Record alert
    db.insertAlert({
      site_id: site.id,
      alert_type: alert.type,
      severity: alert.severity || 'watch',
      threshold_value: alert.threshold,
      actual_value: alert.actual,
      description: alert.description || null,
      conditions_json: JSON.stringify(conditions.current),
      forecast_json: JSON.stringify(conditions.hourly),
      email_sent: emailSent,
      email_recipient: emailRecipient
    });

    // Set cooldown
    db.setCooldown(site.id, alert.type);
    alertCount++;
  }

  return alertCount;
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
