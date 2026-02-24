const path = require('path');

module.exports = {
  // Railway sets PORT automatically; falls back to 3456 for local dev
  PORT: process.env.PORT || 3456,

  DB_PATH: path.join(__dirname, 'data', 'weather-alerts.db'),

  STATIC_DIR: path.join(__dirname, '..', 'weather-alerts'),

  CRON_SCHEDULE: '*/30 * * * *', // every 30 minutes

  COOLDOWN_HOURS: 4,

  THRESHOLDS: {
    heat_index: 95,    // °F apparent temperature
    cold_temp: 20,     // °F temperature
    wind_speed: 45,    // mph
    aqi: 150           // US AQI
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
