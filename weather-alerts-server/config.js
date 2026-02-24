const path = require('path');

module.exports = {
  // Railway sets PORT automatically; falls back to 3456 for local dev
  PORT: process.env.PORT || 3456,

  // Railway injects DATABASE_URL when Postgres plugin is attached
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/weather_alerts',

  // Serve from local public/ folder (works on Railway and locally)
  STATIC_DIR: path.join(__dirname, 'public'),

  CRON_SCHEDULE: '*/30 * * * *', // every 30 minutes

  COOLDOWN_HOURS: 4,

  // ── Current condition thresholds (trigger ORANGE watch) ──
  THRESHOLDS: {
    heat_index: 95,    // °F apparent temperature
    cold_temp: 20,     // °F temperature
    wind_speed: 45,    // mph
    aqi: 150           // US AQI
  },

  // ── Forecast thresholds (trigger YELLOW advisory, 24hr lookahead) ──
  FORECAST_THRESHOLDS: {
    heat_index: 95,    // °F projected apparent temperature
    cold_temp: 20,     // °F projected temperature
    wind_speed: 45,    // mph projected wind
    aqi: 150           // projected AQI
  },

  // ── Severe weather codes from Open-Meteo ──
  // Winter: freezing rain, snow, heavy snow, snow showers
  WINTER_WEATHER_CODES: [66, 67, 71, 73, 75, 77, 85, 86],
  // Storms: thunderstorm, thunderstorm with hail
  SEVERE_STORM_CODES: [95, 96, 99],

  // ── Severity tiers ──
  //   advisory (yellow)  = forecast shows threshold will be crossed in next 24h
  //   watch    (orange)   = threshold crossed NOW or severe weather forecasted
  //   warning  (red)      = dangerous conditions active NOW or NWS severe alert
  SEVERITY: {
    advisory: { label: 'ADVISORY', color: '#eab308' },    // yellow
    watch:    { label: 'WATCH',    color: '#f97316' },     // orange
    warning:  { label: 'WARNING',  color: '#ef4444' }      // red
  },

  // Email config — set via environment variables on Railway, or edit here for local dev
  EMAIL: {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || 'your-email@example.com',
      pass: process.env.SMTP_PASS || 'your-app-password'
    },
    from: process.env.SMTP_FROM || '"SafetyVerse Weather Alerts" <alerts@example.com>'
  },

  // Base URL for links in alert emails — set to your Railway URL once deployed
  SITE_BASE_URL: process.env.SITE_BASE_URL || 'http://localhost:3456'
};
