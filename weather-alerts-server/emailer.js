const config = require('./config');
const { getSafetyProtocol, getPpeReminders, getHydrationSchedule } = require('./alerts');

// ═══════════════════════════════════════════════════════════
// EMAIL DELIVERY via Resend HTTP API
// Railway blocks outbound SMTP (ports 465/587), so we use
// Resend's REST API directly instead of Nodemailer.
// ═══════════════════════════════════════════════════════════

const RESEND_API_URL = 'https://api.resend.com/emails';

function isEmailConfigured() {
  // SMTP_PASS holds the Resend API key (re_...)
  const apiKey = config.EMAIL.auth.pass;
  return apiKey && apiKey !== 'your-app-password' && apiKey.startsWith('re_');
}

function getResendApiKey() {
  return config.EMAIL.auth.pass; // Resend API key stored in SMTP_PASS env var
}

function getFromAddress() {
  return config.EMAIL.from || '"SafetyVerse Weather Alerts" <alerts@thesafetyverse.com>';
}

function renderAlertEmail(alert, site, conditions, forecast) {
  const protocol = getSafetyProtocol(alert.type);
  const ppe = getPpeReminders(alert.type);
  const isHeat = alert.type === 'heat_index' || alert.type === 'forecast_heat';
  const hydration = isHeat ? getHydrationSchedule() : [];

  // Severity-based colors for email
  const severityColors = {
    warning:  { bg: '#fef2f2', border: '#dc2626', banner: '#dc2626' },  // red
    watch:    { bg: '#fff7ed', border: '#ea580c', banner: '#ea580c' },  // orange
    advisory: { bg: '#fefce8', border: '#ca8a04', banner: '#ca8a04' }   // yellow
  };
  const colors = severityColors[alert.severity] || severityColors.watch;
  const severityLabel = (alert.severity || 'watch').toUpperCase();

  const now = new Date();
  const timestamp = now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Denver' }) + ' MST';

  // Forecast rows (every 3 hours)
  const forecastRows = (forecast || []).map(h => {
    const time = new Date(h.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const aqiCell = h.aqi != null ? `${h.aqi} (${h.aqi_label})` : 'N/A';
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${time}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${h.temperature}°F</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${h.apparent_temperature}°F</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${h.wind_speed} mph</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${aqiCell}</td>
    </tr>`;
  }).join('');

  const c = conditions.current;
  const aqiDisplay = c.aqi != null ? `${c.aqi} (${c.aqi_label})` : 'N/A';

  // Build description line for forecast/NWS alerts
  const descriptionBlock = alert.description ? `
    <p style="margin:8px 0 0;font-size:14px;color:#334155;font-style:italic;">${alert.description}</p>
  ` : '';

  // NWS instruction block
  const nwsBlock = alert.nwsDetail?.instruction ? `
  <div style="padding:18px;margin:16px 20px 0;background:#fef2f2;border-left:5px solid #dc2626;border-radius:0 8px 8px 0;">
    <h3 style="margin:0 0 10px;font-size:16px;color:#dc2626;">NWS Instructions</h3>
    <p style="font-size:14px;color:#334155;line-height:1.6;margin:0;">${alert.nwsDetail.instruction}</p>
    ${alert.nwsDetail.senderName ? `<p style="font-size:12px;color:#94a3b8;margin:8px 0 0;">Source: ${alert.nwsDetail.senderName}</p>` : ''}
    ${alert.nwsDetail.expires ? `<p style="font-size:12px;color:#94a3b8;margin:4px 0 0;">Expires: ${new Date(alert.nwsDetail.expires).toLocaleString('en-US')}</p>` : ''}
  </div>
  ` : '';

  // Threshold line — skip for weather-code-based alerts
  const thresholdLine = alert.threshold && alert.unit ? `
    <p style="margin:0;font-size:14px;color:#475569;">
      Threshold: ${alert.threshold}${alert.unit} &nbsp;|&nbsp; Actual: <strong>${alert.actual}${alert.unit}</strong>
    </p>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:640px;margin:0 auto;background:#ffffff;">

  <!-- Header -->
  <div style="background:${colors.banner};color:#ffffff;padding:24px;text-align:center;">
    <h1 style="margin:0;font-size:22px;">Weather Safety ${severityLabel}</h1>
    <p style="margin:6px 0 0;font-size:13px;opacity:0.9;">TheSafetyVerse Automated Weather Monitoring</p>
  </div>

  <!-- Alert Banner -->
  <div style="background:${colors.bg};border-left:5px solid ${colors.border};padding:18px;margin:20px;">
    <h2 style="margin:0 0 8px;font-size:18px;color:${colors.border};">${alert.label}</h2>
    <p style="margin:0 0 4px;font-size:15px;"><strong>${site.name}</strong> — ${site.city || ''}${site.state ? ', ' + site.state : ''}</p>
    ${thresholdLine}
    ${descriptionBlock}
  </div>

  ${nwsBlock}

  <!-- Current Conditions -->
  <div style="padding:18px;margin:0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
    <h3 style="margin:0 0 12px;font-size:16px;color:#1e293b;">Current Conditions</h3>
    <table style="width:100%;font-size:14px;color:#334155;">
      <tr><td style="padding:4px 0;width:45%;">Temperature:</td><td><strong>${c.temperature}°F</strong></td></tr>
      <tr><td style="padding:4px 0;">Feels Like (Heat Index):</td><td><strong>${c.apparent_temperature}°F</strong></td></tr>
      <tr><td style="padding:4px 0;">Wind Speed:</td><td><strong>${c.wind_speed} mph</strong></td></tr>
      <tr><td style="padding:4px 0;">Air Quality (AQI):</td><td><strong>${aqiDisplay}</strong></td></tr>
      <tr><td style="padding:4px 0;">Conditions:</td><td>${c.weather_description}</td></tr>
    </table>
  </div>

  <!-- 24-Hour Forecast -->
  <div style="padding:18px;margin:16px 20px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
    <h3 style="margin:0 0 12px;font-size:16px;color:#1e293b;">24-Hour Forecast</h3>
    <table style="width:100%;font-size:12px;color:#334155;border-collapse:collapse;">
      <thead>
        <tr style="background:#e2e8f0;">
          <th style="padding:6px 10px;text-align:left;">Time</th>
          <th style="padding:6px 10px;text-align:left;">Temp</th>
          <th style="padding:6px 10px;text-align:left;">Feels Like</th>
          <th style="padding:6px 10px;text-align:left;">Wind</th>
          <th style="padding:6px 10px;text-align:left;">AQI</th>
        </tr>
      </thead>
      <tbody>${forecastRows}</tbody>
    </table>
  </div>

  <!-- Safety Protocol -->
  <div style="padding:18px;margin:16px 20px 0;background:#fefce8;border-left:5px solid #f59e0b;border-radius:0 8px 8px 0;">
    <h3 style="margin:0 0 10px;font-size:16px;color:#92400e;">Safety Protocol to Activate</h3>
    <ul style="margin:0;padding-left:20px;font-size:14px;color:#334155;line-height:1.7;">
      ${protocol.map(p => `<li>${p}</li>`).join('')}
    </ul>
  </div>

  <!-- PPE Reminders -->
  <div style="padding:18px;margin:16px 20px 0;background:#eff6ff;border-left:5px solid #3b82f6;border-radius:0 8px 8px 0;">
    <h3 style="margin:0 0 10px;font-size:16px;color:#1e40af;">PPE Reminders</h3>
    <ul style="margin:0;padding-left:20px;font-size:14px;color:#334155;line-height:1.7;">
      ${ppe.map(p => `<li>${p}</li>`).join('')}
    </ul>
  </div>

  ${isHeat ? `
  <!-- Hydration Schedule -->
  <div style="padding:18px;margin:16px 20px 0;background:#ecfdf5;border-left:5px solid #22c55e;border-radius:0 8px 8px 0;">
    <h3 style="margin:0 0 10px;font-size:16px;color:#166534;">Hydration Schedule</h3>
    <table style="width:100%;font-size:13px;color:#334155;border-collapse:collapse;">
      ${hydration.map(h => `<tr>
        <td style="padding:5px 0;width:40%;font-weight:600;">${h.range}</td>
        <td style="padding:5px 0;">${h.instruction}</td>
      </tr>`).join('')}
    </table>
  </div>
  ` : ''}

  <!-- Incident Reporting -->
  <div style="padding:18px;margin:16px 20px 0;background:#faf5ff;border-left:5px solid #8b5cf6;border-radius:0 8px 8px 0;">
    <h3 style="margin:0 0 10px;font-size:16px;color:#6b21a8;">Incident Reporting Reminder</h3>
    <p style="font-size:14px;color:#334155;margin:0 0 8px;line-height:1.6;">
      If any worker experiences symptoms related to weather conditions, report immediately using the SafetyVerse tools:
    </p>
    <p style="font-size:14px;margin:4px 0;"><strong>Incident Protocol:</strong> ${config.SITE_BASE_URL}/../incident-protocol/</p>
    <p style="font-size:14px;margin:4px 0;"><strong>Incident Report:</strong> ${config.SITE_BASE_URL}/../incident-report/</p>
  </div>

  <!-- Footer -->
  <div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;border-top:1px solid #e2e8f0;">
    <p style="margin:0 0 4px;">Automated alert from TheSafetyVerse Weather Monitoring System</p>
    <p style="margin:0;">Generated: ${timestamp} &nbsp;|&nbsp; Next check in 30 minutes</p>
  </div>

</div>
</body>
</html>`;
}

async function sendAlertEmail(to, subject, html) {
  if (!isEmailConfigured()) {
    console.log(`[EMAIL SKIPPED] Not configured. Would send to: ${to}`);
    console.log(`  Subject: ${subject}`);
    return { sent: false, reason: 'Email not configured (missing Resend API key)' };
  }

  try {
    const apiKey = getResendApiKey();
    const from = getFromAddress();

    // Resend accepts comma-separated recipients — split into array
    const toArray = to.split(',').map(e => e.trim()).filter(Boolean);

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: toArray,
        subject,
        html
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`[EMAIL SENT] To: ${to} | Resend ID: ${data.id}`);
      return { sent: true, messageId: data.id };
    } else {
      const errMsg = data.message || data.error || JSON.stringify(data);
      console.error(`[EMAIL ERROR] To: ${to} | Resend ${response.status}: ${errMsg}`);
      return { sent: false, reason: `Resend API ${response.status}: ${errMsg}` };
    }
  } catch (err) {
    console.error(`[EMAIL ERROR] To: ${to} | Error: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

module.exports = { renderAlertEmail, sendAlertEmail, isEmailConfigured };
