const config = require('./config');

// ═══════════════════════════════════════════════════════════
// CURRENT CONDITIONS → WATCH (orange) or WARNING (red)
// ═══════════════════════════════════════════════════════════

function evaluateThresholds(conditions) {
  const triggered = [];
  const c = conditions.current;

  // Heat index
  if (c.apparent_temperature > config.THRESHOLDS.heat_index) {
    const isExtreme = c.apparent_temperature > 105;
    triggered.push({
      type: 'heat_index',
      label: isExtreme ? 'Extreme Heat Warning' : 'Heat Index Watch',
      severity: isExtreme ? 'warning' : 'watch',
      threshold: config.THRESHOLDS.heat_index,
      actual: c.apparent_temperature,
      unit: '°F'
    });
  }

  // Cold temp
  if (c.temperature < config.THRESHOLDS.cold_temp) {
    const isExtreme = c.temperature < 0;
    triggered.push({
      type: 'cold_temp',
      label: isExtreme ? 'Extreme Cold Warning' : 'Cold Temperature Watch',
      severity: isExtreme ? 'warning' : 'watch',
      threshold: config.THRESHOLDS.cold_temp,
      actual: c.temperature,
      unit: '°F'
    });
  }

  // Wind speed
  if (c.wind_speed > config.THRESHOLDS.wind_speed) {
    const isExtreme = c.wind_speed > 60;
    triggered.push({
      type: 'wind_speed',
      label: isExtreme ? 'Extreme Wind Warning' : 'High Wind Watch',
      severity: isExtreme ? 'warning' : 'watch',
      threshold: config.THRESHOLDS.wind_speed,
      actual: c.wind_speed,
      unit: 'mph'
    });
  }

  // AQI
  if (c.aqi != null && c.aqi > config.THRESHOLDS.aqi) {
    const isExtreme = c.aqi > 200;
    triggered.push({
      type: 'aqi',
      label: isExtreme ? 'Hazardous Air Quality Warning' : 'Air Quality Watch',
      severity: isExtreme ? 'warning' : 'watch',
      threshold: config.THRESHOLDS.aqi,
      actual: c.aqi,
      unit: 'AQI'
    });
  }

  // Active winter weather NOW
  if (c.is_winter_weather) {
    triggered.push({
      type: 'winter_weather',
      label: 'Winter Weather Watch',
      severity: 'watch',
      threshold: 0,
      actual: c.weather_code,
      unit: '',
      description: c.weather_description + ' occurring now'
    });
  }

  // Active severe storms NOW
  if (c.is_severe_storm) {
    triggered.push({
      type: 'severe_storm',
      label: 'Severe Thunderstorm Warning',
      severity: 'warning',
      threshold: 0,
      actual: c.weather_code,
      unit: '',
      description: c.weather_description + ' occurring now'
    });
  }

  return triggered;
}

// ═══════════════════════════════════════════════════════════
// FORECAST LOOKAHEAD → ADVISORY (yellow)
// Two windows: 48-hour early heads-up + 24-hour reminder
// ═══════════════════════════════════════════════════════════

function evaluateForecast(conditions) {
  const advisories = [];
  const hourlyFull = conditions.hourlyFull || [];
  const now = new Date();

  // Split into two forecast windows
  const next24 = hourlyFull.filter(h => {
    const hoursAhead = (new Date(h.time) - now) / (1000 * 60 * 60);
    return hoursAhead > 0 && hoursAhead <= 24;
  });

  const next24to48 = hourlyFull.filter(h => {
    const hoursAhead = (new Date(h.time) - now) / (1000 * 60 * 60);
    return hoursAhead > 24 && hoursAhead <= 48;
  });

  // Scan both windows — 48hr gets "48hr_" prefix types, 24hr keeps "forecast_" prefix
  if (next24to48.length > 0) {
    scanWindow(next24to48, '48hr_', '48-Hour', advisories);
  }
  if (next24.length > 0) {
    scanWindow(next24, 'forecast_', '24-Hour', advisories);
  }

  return advisories;
}

function scanWindow(hours, typePrefix, labelPrefix, advisories) {
  // Heat index
  const heatHours = hours.filter(h => h.apparent_temperature > config.FORECAST_THRESHOLDS.heat_index);
  if (heatHours.length > 0) {
    const worst = heatHours.reduce((a, b) => a.apparent_temperature > b.apparent_temperature ? a : b);
    advisories.push({
      type: typePrefix + 'heat',
      label: `${labelPrefix} Heat Index Advisory`,
      severity: 'advisory',
      threshold: config.FORECAST_THRESHOLDS.heat_index,
      actual: worst.apparent_temperature,
      unit: '°F',
      description: `Heat index projected to reach ${worst.apparent_temperature}°F at ${formatTime(worst.time)}`
    });
  }

  // Cold
  const coldHours = hours.filter(h => h.temperature < config.FORECAST_THRESHOLDS.cold_temp);
  if (coldHours.length > 0) {
    const worst = coldHours.reduce((a, b) => a.temperature < b.temperature ? a : b);
    advisories.push({
      type: typePrefix + 'cold',
      label: `${labelPrefix} Cold Temperature Advisory`,
      severity: 'advisory',
      threshold: config.FORECAST_THRESHOLDS.cold_temp,
      actual: worst.temperature,
      unit: '°F',
      description: `Temperature projected to drop to ${worst.temperature}°F at ${formatTime(worst.time)}`
    });
  }

  // Wind
  const windHours = hours.filter(h => h.wind_speed > config.FORECAST_THRESHOLDS.wind_speed);
  if (windHours.length > 0) {
    const worst = windHours.reduce((a, b) => a.wind_speed > b.wind_speed ? a : b);
    advisories.push({
      type: typePrefix + 'wind',
      label: `${labelPrefix} High Wind Advisory`,
      severity: 'advisory',
      threshold: config.FORECAST_THRESHOLDS.wind_speed,
      actual: worst.wind_speed,
      unit: 'mph',
      description: `Wind speed projected to reach ${worst.wind_speed} mph at ${formatTime(worst.time)}`
    });
  }

  // AQI
  const aqiHours = hours.filter(h => h.aqi != null && h.aqi > config.FORECAST_THRESHOLDS.aqi);
  if (aqiHours.length > 0) {
    const worst = aqiHours.reduce((a, b) => a.aqi > b.aqi ? a : b);
    advisories.push({
      type: typePrefix + 'aqi',
      label: `${labelPrefix} Air Quality Advisory`,
      severity: 'advisory',
      threshold: config.FORECAST_THRESHOLDS.aqi,
      actual: worst.aqi,
      unit: 'AQI',
      description: `AQI projected to reach ${worst.aqi} at ${formatTime(worst.time)}`
    });
  }

  // Winter weather
  const winterHours = hours.filter(h => h.is_winter_weather);
  if (winterHours.length > 0) {
    const first = winterHours[0];
    advisories.push({
      type: typePrefix + 'winter',
      label: `${labelPrefix} Winter Weather Advisory`,
      severity: 'advisory',
      threshold: 0,
      actual: 0,
      unit: '',
      description: `${first.weather_description} expected at ${formatTime(first.time)}`
    });
  }

  // Severe storms
  const stormHours = hours.filter(h => h.is_severe_storm);
  if (stormHours.length > 0) {
    const first = stormHours[0];
    advisories.push({
      type: typePrefix + 'storm',
      label: `${labelPrefix} Severe Storm Advisory`,
      severity: 'advisory',
      threshold: 0,
      actual: 0,
      unit: '',
      description: `${first.weather_description} expected at ${formatTime(first.time)}`
    });
  }
}

// ═══════════════════════════════════════════════════════════
// NWS ALERTS → WARNING (red)
// ═══════════════════════════════════════════════════════════

function evaluateNwsAlerts(nwsAlerts) {
  if (!nwsAlerts || nwsAlerts.length === 0) return [];

  return nwsAlerts.map(nws => {
    // NWS severity: Extreme/Severe → red warning, Moderate/Minor → orange watch
    const isHighSeverity = ['Extreme', 'Severe'].includes(nws.severity);
    return {
      type: 'nws_alert',
      label: nws.event,
      severity: isHighSeverity ? 'warning' : 'watch',
      threshold: 0,
      actual: 0,
      unit: '',
      description: nws.headline,
      nwsDetail: {
        instruction: nws.instruction,
        onset: nws.onset,
        expires: nws.expires,
        senderName: nws.senderName,
        fullDescription: nws.description
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════
// SAFETY PROTOCOLS, PPE, HYDRATION
// ═══════════════════════════════════════════════════════════

function getSafetyProtocol(alertType) {
  // Strip "forecast_" or "48hr_" prefix to reuse same protocols
  const baseType = alertType.replace('forecast_', '').replace('48hr_', '');
  const protocols = {
    heat_index: [
      'Implement work/rest cycles per OSHA heat illness prevention guidelines',
      'Ensure adequate shade structures and cooling areas are available on-site',
      'Station a trained observer to monitor workers for signs of heat illness',
      'Provide cool drinking water within easy access of all work areas',
      'Allow workers to acclimatize — new or returning workers need gradual exposure',
      'Schedule heavy labor during cooler hours (early morning or late afternoon)'
    ],
    heat: [
      'Implement work/rest cycles per OSHA heat illness prevention guidelines',
      'Ensure adequate shade structures and cooling areas are available on-site',
      'Station a trained observer to monitor workers for signs of heat illness',
      'Provide cool drinking water within easy access of all work areas',
      'Allow workers to acclimatize — new or returning workers need gradual exposure',
      'Schedule heavy labor during cooler hours (early morning or late afternoon)'
    ],
    cold_temp: [
      'Limit prolonged outdoor exposure — implement warm-up break rotation',
      'Ensure heated break areas are accessible and within close proximity',
      'Monitor all workers for early signs of hypothermia and frostbite',
      'Implement the buddy system for all cold weather outdoor work',
      'Ensure emergency warming supplies are stocked and accessible',
      'Delay non-critical outdoor work if wind chill makes conditions dangerous'
    ],
    cold: [
      'Limit prolonged outdoor exposure — implement warm-up break rotation',
      'Ensure heated break areas are accessible and within close proximity',
      'Monitor all workers for early signs of hypothermia and frostbite',
      'Implement the buddy system for all cold weather outdoor work',
      'Ensure emergency warming supplies are stocked and accessible',
      'Delay non-critical outdoor work if wind chill makes conditions dangerous'
    ],
    wind_speed: [
      'Secure all loose materials, tools, and equipment immediately',
      'Suspend crane operations, elevated work platforms, and scaffolding use',
      'Evaluate scaffolding stability and tie-off all unsecured structures',
      'Restrict work at heights — no ladder use in high wind conditions',
      'Keep workers away from unsecured structures, trees, and power lines',
      'Consider suspending all outdoor operations if gusts exceed 60 mph'
    ],
    wind: [
      'Secure all loose materials, tools, and equipment immediately',
      'Suspend crane operations, elevated work platforms, and scaffolding use',
      'Evaluate scaffolding stability and tie-off all unsecured structures',
      'Restrict work at heights — no ladder use in high wind conditions',
      'Keep workers away from unsecured structures, trees, and power lines',
      'Consider suspending all outdoor operations if gusts exceed 60 mph'
    ],
    aqi: [
      'Limit prolonged outdoor exertion for all workers',
      'Provide NIOSH-approved N95 respirators for outdoor workers',
      'Move work activities indoors where possible',
      'Monitor workers with asthma, COPD, or respiratory conditions closely',
      'Increase break frequency and reduce physical workload intensity',
      'If AQI exceeds 200, suspend non-essential outdoor operations'
    ],
    winter_weather: [
      'Pre-treat walkways and work surfaces with salt/sand before precipitation',
      'Ensure all vehicles have winter emergency kits (blankets, chains, flashlight)',
      'Clear snow and ice from all walking and working surfaces immediately',
      'Inspect scaffolding and elevated platforms for ice accumulation',
      'Delay non-essential outdoor work during active winter precipitation',
      'Establish a clear communication plan for weather-related schedule changes'
    ],
    winter: [
      'Pre-treat walkways and work surfaces with salt/sand before precipitation',
      'Ensure all vehicles have winter emergency kits (blankets, chains, flashlight)',
      'Clear snow and ice from all walking and working surfaces immediately',
      'Inspect scaffolding and elevated platforms for ice accumulation',
      'Delay non-essential outdoor work during active winter precipitation',
      'Establish a clear communication plan for weather-related schedule changes'
    ],
    severe_storm: [
      'Evacuate workers from elevated and exposed positions immediately',
      'Move all personnel to designated severe weather shelter areas',
      'Secure or lower crane booms and tall equipment',
      'Account for all workers — conduct headcount at shelter location',
      'Do not resume outdoor work until all-clear is given by site supervisor',
      'Inspect work areas for damage before resuming operations'
    ],
    storm: [
      'Evacuate workers from elevated and exposed positions immediately',
      'Move all personnel to designated severe weather shelter areas',
      'Secure or lower crane booms and tall equipment',
      'Account for all workers — conduct headcount at shelter location',
      'Do not resume outdoor work until all-clear is given by site supervisor',
      'Inspect work areas for damage before resuming operations'
    ],
    nws_alert: [
      'Follow all instructions from the National Weather Service alert',
      'Ensure all workers are aware of the active alert and its severity',
      'Activate your site-specific emergency action plan',
      'Monitor NWS updates for changes in alert status',
      'Do not resume normal operations until the alert has expired or been cancelled'
    ]
  };
  return protocols[baseType] || protocols[alertType] || protocols.nws_alert;
}

function getPpeReminders(alertType) {
  const baseType = alertType.replace('forecast_', '').replace('48hr_', '');
  const ppe = {
    heat_index: [
      'Lightweight, light-colored, loose-fitting clothing',
      'Wide-brimmed hard hat or hat with neck shade',
      'UV-protective sunglasses (ANSI Z87.1 rated)',
      'Sunscreen SPF 30+ (reapply every 2 hours)',
      'Cooling vests or towels for high-exertion tasks'
    ],
    heat: [
      'Lightweight, light-colored, loose-fitting clothing',
      'Wide-brimmed hard hat or hat with neck shade',
      'UV-protective sunglasses (ANSI Z87.1 rated)',
      'Sunscreen SPF 30+ (reapply every 2 hours)',
      'Cooling vests or towels for high-exertion tasks'
    ],
    cold_temp: [
      'Insulated, layered clothing (moisture-wicking base layer)',
      'Insulated, waterproof gloves with grip',
      'Insulated, waterproof boots with slip-resistant soles',
      'Balaclava or face covering to protect against wind chill',
      'Hand and toe warmers for extended outdoor exposure'
    ],
    cold: [
      'Insulated, layered clothing (moisture-wicking base layer)',
      'Insulated, waterproof gloves with grip',
      'Insulated, waterproof boots with slip-resistant soles',
      'Balaclava or face covering to protect against wind chill',
      'Hand and toe warmers for extended outdoor exposure'
    ],
    wind_speed: [
      'Snug-fitting hard hat with chin strap secured',
      'Safety glasses with side shields (secure fit)',
      'Windproof outer layer to maintain core temperature',
      'Full-body harness and tie-off for any elevated work',
      'Hearing protection if wind noise exceeds safe levels'
    ],
    wind: [
      'Snug-fitting hard hat with chin strap secured',
      'Safety glasses with side shields (secure fit)',
      'Windproof outer layer to maintain core temperature',
      'Full-body harness and tie-off for any elevated work',
      'Hearing protection if wind noise exceeds safe levels'
    ],
    aqi: [
      'NIOSH-approved N95 or P100 respirator (fit-tested)',
      'Safety goggles if particulate matter causes eye irritation',
      'Long sleeves to reduce skin exposure to airborne irritants',
      'Keep spare respirator filters accessible on-site',
      'Ensure all workers have been fit-tested for their respirator size'
    ],
    winter_weather: [
      'Insulated, waterproof boots with aggressive tread',
      'Insulated, waterproof gloves with grip for tool handling',
      'Layered clothing with waterproof outer shell',
      'High-visibility vest or jacket (visibility reduced in snow)',
      'Ice cleats/traction devices for boots'
    ],
    winter: [
      'Insulated, waterproof boots with aggressive tread',
      'Insulated, waterproof gloves with grip for tool handling',
      'Layered clothing with waterproof outer shell',
      'High-visibility vest or jacket (visibility reduced in snow)',
      'Ice cleats/traction devices for boots'
    ],
    severe_storm: [
      'Hard hat (required when moving to shelter)',
      'High-visibility vest for accountability',
      'Waterproof outer layer',
      'Sturdy, closed-toe footwear',
      'Personal flashlight in case of power loss'
    ],
    storm: [
      'Hard hat (required when moving to shelter)',
      'High-visibility vest for accountability',
      'Waterproof outer layer',
      'Sturdy, closed-toe footwear',
      'Personal flashlight in case of power loss'
    ],
    nws_alert: [
      'Follow PPE guidance specific to the alert type',
      'High-visibility vest for all outdoor workers',
      'Hard hat required in all work areas',
      'Ensure communication devices (radio/phone) are charged and accessible'
    ]
  };
  return ppe[baseType] || ppe[alertType] || ppe.nws_alert;
}

function getHydrationSchedule() {
  return [
    { range: 'Heat Index 80–90°F', instruction: 'Drink at least 1 cup (8 oz) of water every 20 minutes' },
    { range: 'Heat Index 91–95°F', instruction: 'Drink 1 cup every 15–20 minutes' },
    { range: 'Heat Index 96–100°F', instruction: 'Drink 1 cup every 15 minutes, mandatory shade breaks every hour' },
    { range: 'Heat Index 101–105°F', instruction: 'Drink 1 cup every 10–15 minutes, 15-min break per hour minimum' },
    { range: 'Heat Index > 105°F', instruction: 'Drink 1 cup every 10 minutes, reschedule non-essential outdoor work' }
  ];
}

// ── Helpers ──────────────────────────────────────────────

function formatTime(isoString) {
  try {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return isoString;
  }
}

module.exports = {
  evaluateThresholds,
  evaluateForecast,
  evaluateNwsAlerts,
  getSafetyProtocol,
  getPpeReminders,
  getHydrationSchedule
};
