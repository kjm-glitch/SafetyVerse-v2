const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';
const AQI_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

async function fetchWeather(lat, lng) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    current: 'temperature_2m,apparent_temperature,wind_speed_10m,weather_code',
    hourly: 'temperature_2m,apparent_temperature,wind_speed_10m,weather_code',
    forecast_days: '1',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto'
  });

  const res = await fetch(`${WEATHER_BASE}?${params}`);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  return res.json();
}

async function fetchAqi(lat, lng) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    current: 'us_aqi',
    hourly: 'us_aqi',
    forecast_days: '1',
    timezone: 'auto'
  });

  const res = await fetch(`${AQI_BASE}?${params}`);
  if (!res.ok) throw new Error(`AQI API error: ${res.status}`);
  return res.json();
}

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

async function fetchAllConditions(lat, lng) {
  const [weatherData, aqiData] = await Promise.all([
    fetchWeather(lat, lng),
    fetchAqi(lat, lng).catch(() => null) // AQI may not be available for all locations
  ]);

  const current = {
    temperature: weatherData.current.temperature_2m,
    apparent_temperature: weatherData.current.apparent_temperature,
    wind_speed: weatherData.current.wind_speed_10m,
    weather_code: weatherData.current.weather_code,
    weather_description: getWeatherDescription(weatherData.current.weather_code),
    aqi: aqiData?.current?.us_aqi ?? null,
    aqi_label: aqiData?.current?.us_aqi != null ? getAqiLabel(aqiData.current.us_aqi) : 'N/A',
    time: weatherData.current.time
  };

  // Build hourly forecast (every 3 hours for readability)
  const hourly = [];
  const times = weatherData.hourly.time || [];
  for (let i = 0; i < times.length; i += 3) {
    hourly.push({
      time: times[i],
      temperature: weatherData.hourly.temperature_2m[i],
      apparent_temperature: weatherData.hourly.apparent_temperature[i],
      wind_speed: weatherData.hourly.wind_speed_10m[i],
      weather_code: weatherData.hourly.weather_code[i],
      weather_description: getWeatherDescription(weatherData.hourly.weather_code[i]),
      aqi: aqiData?.hourly?.us_aqi?.[i] ?? null,
      aqi_label: aqiData?.hourly?.us_aqi?.[i] != null ? getAqiLabel(aqiData.hourly.us_aqi[i]) : 'N/A'
    });
  }

  return { current, hourly, timezone: weatherData.timezone };
}

module.exports = { fetchWeather, fetchAqi, fetchAllConditions, getAqiLabel, getWeatherDescription };
