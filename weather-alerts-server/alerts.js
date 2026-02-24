const config = require('./config');

function evaluateThresholds(conditions) {
  const triggered = [];
  const c = conditions.current;

  if (c.apparent_temperature > config.THRESHOLDS.heat_index) {
    triggered.push({
      type: 'heat_index',
      label: 'Heat Index Warning',
      threshold: config.THRESHOLDS.heat_index,
      actual: c.apparent_temperature,
      unit: '°F'
    });
  }

  if (c.temperature < config.THRESHOLDS.cold_temp) {
    triggered.push({
      type: 'cold_temp',
      label: 'Cold Temperature Warning',
      threshold: config.THRESHOLDS.cold_temp,
      actual: c.temperature,
      unit: '°F'
    });
  }

  if (c.wind_speed > config.THRESHOLDS.wind_speed) {
    triggered.push({
      type: 'wind_speed',
      label: 'High Wind Warning',
      threshold: config.THRESHOLDS.wind_speed,
      actual: c.wind_speed,
      unit: 'mph'
    });
  }

  if (c.aqi != null && c.aqi > config.THRESHOLDS.aqi) {
    triggered.push({
      type: 'aqi',
      label: 'Air Quality Warning',
      threshold: config.THRESHOLDS.aqi,
      actual: c.aqi,
      unit: 'AQI'
    });
  }

  return triggered;
}

function getSafetyProtocol(alertType) {
  const protocols = {
    heat_index: [
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
    wind_speed: [
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
    ]
  };
  return protocols[alertType] || [];
}

function getPpeReminders(alertType) {
  const ppe = {
    heat_index: [
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
    wind_speed: [
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
    ]
  };
  return ppe[alertType] || [];
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

module.exports = {
  evaluateThresholds,
  getSafetyProtocol,
  getPpeReminders,
  getHydrationSchedule
};
