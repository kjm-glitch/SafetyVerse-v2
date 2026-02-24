const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';
const AQI_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const NWS_BASE = 'https://api.weather.gov';

// ── Open-Meteo: Weather ─────────────────────────────────

async function fetchWeather(lat, lng) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    current: 'temperature_2m,apparent_temperature,wind_speed_10m,weather_code',
    hourly: 'temperature_2m,apparent_temperature,wind_speed_10m,weather_code',
    forecast_days: '2',  // 2 days for 24hr lookahead from any time
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto'
  });

  const res = await fetch(`${WEATHER_BASE}?${params}`);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  return res.json();
}

// ── Open-Meteo: Air Quality ─────────────────────────────

async function fetchAqi(lat, lng) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    current: 'us_aqi',
    hourly: 'us_aqi',
    forecast_days: '2',
    timezone: 'auto'
  });

  const res = await fetch(`${AQI_BASE}?${params}`);
  if (!res.ok) throw new Error(`AQI API error: ${res.status}`);
  return res.json();
}

// ── National Weather Service alerts ─────────────────────

async function fetchNwsAlerts(lat, lng) {
  try {
    const url = `${NWS_BASE}/alerts/active?point=${lat},${lng}&status=actual&message_type=alert`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': '(TheSafetyVerse Weather Alerts, alerts@thesafetyverse.com)',
        'Accept': 'application/geo+json'
      }
    });
    if (!res.ok) {
      console.log(`[NWS] API returned ${res.status} for ${lat},${lng}`);
      return [];
    }
    const data = await res.json();
    const features = data.features || [];

    return features.map(f => {
      const p = f.properties;
      return {
        event: p.event,               // e.g. "Tornado Warning", "Winter Storm Warning"
        severity: p.severity,          // "Extreme", "Severe", "Moderate", "Minor"
        urgency: p.urgency,            // "Immediate", "Expected", "Future"
        certainty: p.certainty,        // "Observed", "Likely", "Possible"
        headline: p.headline,
        description: p.description,
        instruction: p.instruction,
        onset: p.onset,
        expires: p.expires,
        senderName: p.senderName
      };
    });
  } catch (err) {
    console.error(`[NWS] Error fetching alerts: ${err.message}`);
    return [];
  }
}

// ── Helpers ─────────────────────────────────────────────

function getAqiLabel(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function getWeatherDescription(code) {
  const descriptions = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    66: 'Light freezing rain', 67: 'Heavy freezing rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
    77: 'Snow grains', 80: 'Slight rain showers', 81: 'Moderate rain showers',
    82: 'Violent rain showers', 85: 'Slight snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
  };
  return descriptions[code] || 'Unknown';
}

function isWinterCode(code) {
  return [66, 67, 71, 73, 75, 77, 85, 86].includes(code);
}

function isSevereStormCode(code) {
  return [95, 96, 99].includes(code);
}

// ── Combined fetch ──────────────────────────────────────

async function fetchAllConditions(lat, lng) {
  const [weatherData, aqiData, nwsAlerts] = await Promise.all([
    fetchWeather(lat, lng),
    fetchAqi(lat, lng).catch(() => null),
    fetchNwsAlerts(lat, lng).catch(() => [])
  ]);

  const current = {
    temperature: weatherData.current.temperature_2m,
    apparent_temperature: weatherData.current.apparent_temperature,
    wind_speed: weatherData.current.wind_speed_10m,
    weather_code: weatherData.current.weather_code,
    weather_description: getWeatherDescription(weatherData.current.weather_code),
    is_winter_weather: isWinterCode(weatherData.current.weather_code),
    is_severe_storm: isSevereStormCode(weatherData.current.weather_code),
    aqi: aqiData?.current?.us_aqi ?? null,
    aqi_label: aqiData?.current?.us_aqi != null ? getAqiLabel(aqiData.current.us_aqi) : 'N/A',
    time: weatherData.current.time
  };

  // Build full hourly forecast (every hour for lookahead analysis)
  const hourlyFull = [];
  const times = weatherData.hourly.time || [];
  for (let i = 0; i < times.length; i++) {
    hourlyFull.push({
      time: times[i],
      temperature: weatherData.hourly.temperature_2m[i],
      apparent_temperature: weatherData.hourly.apparent_temperature[i],
      wind_speed: weatherData.hourly.wind_speed_10m[i],
      weather_code: weatherData.hourly.weather_code[i],
      weather_description: getWeatherDescription(weatherData.hourly.weather_code[i]),
      is_winter_weather: isWinterCode(weatherData.hourly.weather_code[i]),
      is_severe_storm: isSevereStormCode(weatherData.hourly.weather_code[i]),
      aqi: aqiData?.hourly?.us_aqi?.[i] ?? null,
      aqi_label: aqiData?.hourly?.us_aqi?.[i] != null ? getAqiLabel(aqiData.hourly.us_aqi[i]) : 'N/A'
    });
  }

  // Build summary hourly (every 3 hours for display)
  const hourly = hourlyFull.filter((_, i) => i % 3 === 0).slice(0, 8);

  return {
    current,
    hourly,           // every 3 hours (for display)
    hourlyFull,       // every hour (for forecast analysis)
    nwsAlerts,        // NWS active alerts
    timezone: weatherData.timezone
  };
}

module.exports = {
  fetchWeather, fetchAqi, fetchNwsAlerts,
  fetchAllConditions, getAqiLabel, getWeatherDescription,
  isWinterCode, isSevereStormCode
};
