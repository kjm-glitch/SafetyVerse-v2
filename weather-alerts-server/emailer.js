const config = require('./config');
const { getPpeReminders, getHydrationSchedule } = require('./alerts');

// ═══════════════════════════════════════════════════════════
// EMAIL DELIVERY via Resend HTTP API
// Railway blocks outbound SMTP (ports 465/587), so we use
// Resend's REST API directly instead of Nodemailer.
// ═══════════════════════════════════════════════════════════

const RESEND_API_URL = 'https://api.resend.com/emails';

function isEmailConfigured() {
  const apiKey = config.EMAIL.auth.pass;
  return apiKey && apiKey !== 'your-app-password' && apiKey.startsWith('re_');
}

function getResendApiKey() {
  return config.EMAIL.auth.pass;
}

function getFromAddress() {
  return config.EMAIL.from || '"SafetyVerse Weather Alerts" <alerts@thesafetyverse.com>';
}

// ═══════════════════════════════════════════════════════════
// WEATHER OPERATIONAL RESPONSE PROTOCOLS
// Content sourced from SafetyVerse training modules:
//   heat-stress, cold-stress, walking-working-surfaces,
//   emergency-action-plans, ppe, hazcom, first-aid
// Structured to match the Incident Protocol triage outcomes.
// ═══════════════════════════════════════════════════════════

function getWeatherResponseProtocol(alertType, severity) {
  const baseType = alertType.replace('forecast_', '').replace('48hr_', '');
  const isAdvisory = severity === 'advisory';
  const isWarning = severity === 'warning';

  const protocols = {

    // ── HEAT ────────────────────────────────────────────
    heat_index: isWarning ? {
      title: 'Emergency Response — Heat Stroke Risk',
      description: 'Extreme heat is a life-threatening emergency. Heat stroke can be fatal in minutes without immediate intervention.',
      cardColor: 'red',
      actions: [
        'Call 911 immediately if any worker shows confusion, hot dry skin, or loss of consciousness',
        'Begin active cooling NOW — ice packs on neck, armpits, and groin; cold water immersion if available',
        'Do NOT give fluids if the person is confused or unconscious',
        'Move all workers to cool, shaded area or air-conditioned space',
        'Do not leave affected person unattended — continuously monitor until EMS arrives'
      ],
      watchFor: 'Body temp 104°F+, hot DRY skin (no sweating), confusion or altered mental state, slurred speech, loss of consciousness, seizures, rapid strong pulse. If no improvement in 30 min or symptoms worsen → call 911.',
      workMod: 'Suspend heavy outdoor work immediately. If work must continue, enforce 30–45 min work/rest cycles. Ensure 1 cup (8 oz) water every 15–20 min per OSHA/NIOSH. New/returning workers: apply 20% acclimatization rule.',
      gear: 'Cooling vests or towels, light-colored loose clothing, wide-brimmed hard hat with neck shade, sunscreen SPF 30+ (reapply every 2 hours)'
    } : {
      title: 'Occupational Response — Heat Exhaustion Risk',
      description: 'Heat exhaustion can progress to heat stroke quickly. Implement work/rest cycles and mandatory hydration immediately.',
      cardColor: 'amber',
      actions: [
        'Implement work/rest cycles — breaks every 30–45 minutes in shaded or air-conditioned areas',
        'Ensure cool drinking water is within easy access — 1 cup (8 oz) every 15–20 minutes per OSHA',
        'Station a trained observer to monitor all workers for heat illness symptoms',
        'New or returning workers: apply 20% acclimatization rule (20% workload Day 1, increase 20% daily)',
        'Schedule heavy labor during cooler hours (early morning or late afternoon)'
      ],
      watchFor: 'Heavy sweating, weakness, dizziness, headache, nausea/vomiting, cool pale clammy skin, fast weak pulse, fainting. If no improvement in 30 min or symptoms worsen → call 911.',
      workMod: 'Breaks every 30–45 min when heat index exceeds 103°F. Adjust schedules to cooler hours. Reduce physical demands. Provide additional staff to rotate workload.',
      gear: 'Cooling vests, light-colored loose-fitting clothing, wide-brimmed hard hat, UV-protective sunglasses (ANSI Z87.1), sunscreen SPF 30+ (reapply every 2 hours)'
    },

    heat: isWarning ? {
      title: 'Emergency Response — Heat Stroke Risk',
      description: 'Extreme heat is a life-threatening emergency. Heat stroke can be fatal in minutes without immediate intervention.',
      cardColor: 'red',
      actions: [
        'Call 911 immediately if any worker shows confusion, hot dry skin, or loss of consciousness',
        'Begin active cooling NOW — ice packs on neck, armpits, and groin; cold water immersion if available',
        'Do NOT give fluids if the person is confused or unconscious',
        'Move all workers to cool, shaded area or air-conditioned space',
        'Do not leave affected person unattended — continuously monitor until EMS arrives'
      ],
      watchFor: 'Body temp 104°F+, hot DRY skin (no sweating), confusion or altered mental state, slurred speech, loss of consciousness, seizures.',
      workMod: 'Suspend heavy outdoor work immediately. Enforce 30–45 min work/rest cycles. Ensure 1 cup (8 oz) water every 15–20 min per OSHA/NIOSH.',
      gear: 'Cooling vests or towels, light-colored loose clothing, wide-brimmed hard hat with neck shade, sunscreen SPF 30+'
    } : {
      title: 'Advance Preparation — Heat Conditions Forecasted',
      description: 'High heat index is expected. Prepare work/rest cycles, hydration stations, and cooling equipment before conditions arrive.',
      cardColor: 'green',
      actions: [
        'Brief crew during toolbox talk on forecasted heat conditions and expected timing',
        'Pre-stage hydration stations with cool water — plan for 1 cup (8 oz) per worker every 15–20 min',
        'Set up shade structures and cooling areas at all active work zones',
        'Review acclimatization schedule for new or returning workers (20% rule)',
        'Confirm emergency contacts are current and heat illness response plan is reviewed'
      ],
      watchFor: 'Heavy sweating, weakness, dizziness, headache, nausea, cool pale clammy skin. Personal warning: if you feel confused, can\'t think clearly, or stop sweating — stop work immediately.',
      workMod: 'Plan ahead — schedule heavy outdoor work before peak heat arrives. Pre-position supplies. Prepare alternate indoor tasks.',
      gear: 'Ensure cooling vests, sunscreen, and wide-brimmed hard hats will be available when conditions arrive'
    },

    // ── COLD ────────────────────────────────────────────
    cold_temp: isWarning ? {
      title: 'Emergency Response — Severe Hypothermia/Frostbite Risk',
      description: 'Extreme cold is life-threatening. Hypothermia can cause cardiac arrest. Handle all affected workers gently.',
      cardColor: 'red',
      actions: [
        'Call 911 immediately if any worker shows confusion, slurred speech, loss of consciousness, or has stopped shivering',
        'Move person to warm area — handle VERY gently (rough movement can cause cardiac arrest in hypothermia)',
        'Remove wet clothing, replace with dry layers and blankets — cover head (significant heat loss through head)',
        'Warm gradually with blankets and body heat — do NOT use direct heat (heating pads, fire)',
        'If conscious, give warm sweet drinks — do NOT give alcohol or caffeine'
      ],
      watchFor: 'Severe Hypothermia: NO shivering (danger sign — means body has stopped trying to warm itself), unconscious, weak/no pulse, rigid muscles. "They\'re not dead until they\'re warm and dead" — continue CPR. Frostbite: Numbness, white/gray waxy skin, skin feels hard or frozen. Do NOT rub. Warm gently in 98–105°F water.',
      workMod: 'Suspend outdoor work if wind chill is –40°F or lower (frostbite in 10 min). At –60°F wind chill, outdoor work MUST stop. Cover ALL exposed skin when wind chill is below 0°F.',
      gear: 'Three-layer system (synthetic base — NEVER cotton, "cotton kills" in cold), insulated waterproof gloves/mittens, insulated waterproof boots with thick wool socks, balaclava or face mask, ice cleats for icy surfaces'
    } : {
      title: 'Occupational Response — Frostbite/Hypothermia Risk',
      description: 'Cold conditions require mandatory warm-up breaks and buddy system monitoring. Wet skin loses heat 25x faster than dry skin.',
      cardColor: 'amber',
      actions: [
        'Implement warm-up break rotation — minimum 10–15 min warm break every 1–2 hours',
        'Ensure heated break areas, warming huts, or heated vehicles are accessible nearby',
        'Implement buddy system — monitor coworkers for white/gray skin patches, stumbling, slurred speech, confusion',
        'Remove wet clothing immediately — wet skin loses heat 25x faster than dry skin',
        'Ensure emergency warming supplies are stocked and accessible on-site'
      ],
      watchFor: 'Hypothermia (Mild): Shivering (body\'s first defense — warm up immediately), confusion, fatigue, slurred speech, loss of coordination. Frostbite: Numbness or tingling in fingers, toes, ears, nose, face; skin color changes to white/gray.',
      workMod: 'Increase warm-up breaks in extreme cold. At wind chill –18°F: frostbite possible in 30 min on exposed skin — limit outdoor work. Rotate workers more frequently.',
      gear: 'Three-layer system (synthetic or wool base — NEVER cotton), insulated waterproof boots, insulated waterproof gloves (carry extras), insulated hat covering ears, ice cleats required for icy surfaces (remove before entering buildings)'
    },

    cold: isWarning ? {
      title: 'Emergency Response — Severe Hypothermia/Frostbite Risk',
      description: 'Extreme cold is life-threatening. Hypothermia can cause cardiac arrest.',
      cardColor: 'red',
      actions: [
        'Call 911 immediately if any worker shows confusion, slurred speech, loss of consciousness, or has stopped shivering',
        'Move person to warm area — handle VERY gently (rough movement can cause cardiac arrest)',
        'Remove wet clothing, replace with dry layers and blankets — cover head',
        'Warm gradually with blankets and body heat — do NOT use direct heat',
        'If conscious, give warm sweet drinks — do NOT give alcohol or caffeine'
      ],
      watchFor: 'NO shivering (danger sign), unconscious, weak/no pulse, rigid muscles. Frostbite: numbness, white/gray waxy skin, hard/frozen skin.',
      workMod: 'Suspend outdoor work if wind chill –40°F or lower. Cover ALL exposed skin below 0°F wind chill.',
      gear: 'Three-layer system (no cotton), insulated waterproof gloves/mittens, insulated waterproof boots, balaclava, ice cleats'
    } : {
      title: 'Advance Preparation — Cold Conditions Forecasted',
      description: 'Cold temperatures are expected. Prepare warm break areas, PPE, and buddy system before conditions arrive.',
      cardColor: 'green',
      actions: [
        'Brief crew during toolbox talk on forecasted cold conditions and expected timing',
        'Pre-stage warming supplies — ensure heated break areas, warm beverages, and extra dry clothing are available',
        'Verify all workers have proper cold weather PPE (three-layer system, insulated boots, gloves, hat)',
        'Distribute ice cleats if icy conditions are expected — brief on proper use and removal before entering buildings',
        'Review buddy system protocol and hypothermia/frostbite recognition signs'
      ],
      watchFor: 'Shivering, numbness in extremities, white/gray skin patches, confusion, slurred speech.',
      workMod: 'Plan ahead — schedule outdoor work during warmest part of day. Pre-position warming supplies. Prepare indoor alternate tasks.',
      gear: 'Ensure three-layer clothing system, insulated boots, gloves, hat, and ice cleats are available before conditions arrive'
    },

    // ── WIND ────────────────────────────────────────────
    wind_speed: isWarning ? {
      title: 'Emergency Response — Extreme Wind Hazard',
      description: 'Extreme winds create struck-by and structural collapse hazards. All outdoor operations must stop immediately.',
      cardColor: 'red',
      actions: [
        'Suspend ALL outdoor operations immediately',
        'Evacuate workers from elevated and exposed positions — all personnel to designated shelter areas',
        'Secure or lower crane booms and tall equipment',
        'Conduct full headcount at shelter location — account for all workers',
        'Do not resume outdoor work until all-clear given and winds confirmed below threshold'
      ],
      watchFor: 'Struck-by hazards from airborne debris, structural collapse of unsecured structures, downed power lines, falling trees/branches.',
      workMod: 'All outdoor work suspended. No crane operations, scaffolding, or elevated work. Workers must stay away from unsecured structures, trees, and power lines.',
      gear: 'Snug-fitting hard hat with chin strap secured, full-body harness if any elevated transit required, windproof outer layer'
    } : {
      title: 'Operational Restriction — High Wind Hazard',
      description: 'High winds require immediate cessation of all elevated work and securing of loose materials.',
      cardColor: 'amber',
      actions: [
        'Cease all elevated work — no crane operations, scaffolding use, or ladder work',
        'Secure all loose materials, tools, and equipment immediately',
        'Evaluate scaffolding stability and tie-off all unsecured structures',
        'Keep workers away from unsecured structures, trees, and power lines',
        'Monitor conditions — if gusts exceed 60 mph, suspend all outdoor operations'
      ],
      watchFor: 'Airborne debris, unsecured materials becoming projectiles, scaffolding instability, ladder tip-over.',
      workMod: 'No work at heights. Ground-level operations may continue with caution. Review what can be moved indoors.',
      gear: 'Hard hat with chin strap, safety glasses with side shields, windproof outer layer, hearing protection if wind noise exceeds safe levels'
    },

    wind: isWarning ? {
      title: 'Emergency Response — Extreme Wind Hazard',
      description: 'Extreme winds expected. Prepare to suspend all outdoor operations.',
      cardColor: 'red',
      actions: [
        'Suspend ALL outdoor operations immediately when conditions arrive',
        'Evacuate workers from elevated and exposed positions',
        'Secure or lower crane booms and tall equipment',
        'Conduct full headcount at shelter location',
        'Do not resume until all-clear given and winds confirmed below threshold'
      ],
      watchFor: 'Airborne debris, structural collapse, downed power lines, falling trees.',
      workMod: 'All outdoor work suspended. No crane operations, scaffolding, or elevated work.',
      gear: 'Hard hat with chin strap, full-body harness if elevated transit required, windproof outer layer'
    } : {
      title: 'Advance Preparation — High Wind Forecasted',
      description: 'High winds are expected. Secure materials and prepare for potential work restrictions.',
      cardColor: 'green',
      actions: [
        'Brief crew on forecasted wind conditions and expected timing',
        'Pre-secure all loose materials, tools, and equipment on-site',
        'Review elevated work plans — prepare to cease crane/scaffolding operations',
        'Verify all scaffolding is properly braced and anchored',
        'Confirm shelter locations and emergency communication plan'
      ],
      watchFor: 'Sudden gusts exceeding forecast, unsecured materials, scaffolding movement.',
      workMod: 'Plan to move work indoors or to ground level when conditions arrive. Pre-position materials.',
      gear: 'Ensure hard hats with chin straps and safety glasses are available for all outdoor workers'
    },

    // ── AIR QUALITY ─────────────────────────────────────
    aqi: isWarning ? {
      title: 'Emergency Response — Hazardous Air Quality',
      description: 'AQI exceeds 200 (Hazardous). All outdoor operations must be suspended and workers moved indoors.',
      cardColor: 'red',
      actions: [
        'Suspend all non-essential outdoor operations immediately',
        'Move all workers indoors',
        'P100 respirators required if any outdoor transit is necessary',
        'Monitor all workers for respiratory distress — call 911 if breathing difficulty, chest pain, or persistent coughing',
        'Workers with asthma, COPD, or respiratory conditions must NOT work outdoors under any circumstances'
      ],
      watchFor: 'Persistent coughing, shortness of breath, chest tightness, throat irritation, eye burning, dizziness.',
      workMod: 'All outdoor work suspended. Indoor operations only. Ensure building HVAC is filtering outdoor air.',
      gear: 'NIOSH-approved P100 respirator (fit-tested) for any outdoor transit, safety goggles if particulate irritation'
    } : {
      title: 'Operational Restriction — Unhealthy Air Quality',
      description: 'AQI exceeds 150 (Unhealthy). N95 respirators are mandatory for all outdoor work.',
      cardColor: 'amber',
      actions: [
        'N95 respirators mandatory for all outdoor workers (must be fit-tested)',
        'Reduce outdoor physical workload intensity — assign lighter duties',
        'Increase break frequency and duration — more indoor time',
        'Move work activities indoors where possible',
        'Monitor workers with respiratory conditions closely — reassign indoors if needed'
      ],
      watchFor: 'Coughing, throat irritation, eye burning, shortness of breath on exertion.',
      workMod: 'Limit prolonged outdoor exertion. Increase breaks. If AQI continues rising toward 200, prepare to suspend all outdoor operations.',
      gear: 'NIOSH-approved N95 respirator (fit-tested), safety goggles if eye irritation, long sleeves, spare respirator filters accessible'
    },

    // ── WINTER WEATHER ──────────────────────────────────
    winter_weather: {
      title: 'Operational Response — Winter Weather Active',
      description: 'Active winter precipitation creates slip/fall and cold injury hazards. Ice cleats are required for all outdoor movement.',
      cardColor: 'amber',
      actions: [
        'Pre-treat walkways and work surfaces with salt/sand before precipitation',
        'Clear snow and ice from all walking and working surfaces immediately',
        'Ice cleats REQUIRED for all workers walking outdoors — remove before entering buildings (damages floors, creates indoor slip hazard)',
        'Inspect scaffolding and elevated platforms for ice accumulation before any use',
        'Delay non-essential outdoor work during active winter precipitation'
      ],
      watchFor: 'Slip/Fall: Black ice (transparent — looks like wet pavement; assume all wet-looking surfaces are ice in winter), snow hiding underlying hazards, freeze/thaw cycles. High-risk areas: building entrances, parking lots, loading docks, ramps, shaded areas. Cold Injury: Numbness/tingling in extremities, white/gray skin patches, shivering, confusion.',
      workMod: 'Delay non-essential outdoor work. Use designated clear walkways only. No elevated work on icy surfaces. Ensure all vehicles have winter emergency kits (blankets, chains, flashlight).',
      gear: 'Ice cleats required outdoors (remove before entering buildings), insulated waterproof boots with aggressive tread, insulated waterproof gloves, high-visibility vest (reduced visibility in snow), three-layer clothing (no cotton)'
    },

    winter: {
      title: 'Advance Preparation — Winter Weather Forecasted',
      description: 'Winter precipitation is expected. Pre-treat surfaces, distribute ice cleats, and prepare for cold conditions.',
      cardColor: 'green',
      actions: [
        'Brief crew on forecasted winter conditions and expected timing',
        'Pre-treat all walkways, parking lots, and work surfaces with salt/sand',
        'Distribute ice cleats to all workers — brief on proper use and that they must be removed before entering buildings',
        'Stage snow/ice removal equipment and verify winter emergency kits in all vehicles',
        'Review cold injury recognition signs and buddy system protocol'
      ],
      watchFor: 'Black ice formation, accumulating snow on elevated surfaces, ice on scaffolding.',
      workMod: 'Plan ahead — schedule outdoor work before conditions arrive if possible. Pre-position salt/sand and removal equipment.',
      gear: 'Ensure ice cleats, insulated waterproof boots, gloves, and high-visibility vests are available for all outdoor workers'
    },

    // ── SEVERE STORM ────────────────────────────────────
    severe_storm: {
      title: 'Emergency Response — Severe Storm Active',
      description: 'Severe thunderstorm with potential lightning, flash flooding, and high winds. Evacuate all outdoor positions immediately.',
      cardColor: 'red',
      actions: [
        'Evacuate workers from elevated and exposed positions immediately',
        'All personnel to designated severe weather shelter — interior room, no windows, away from exterior walls',
        'Secure or lower crane booms and tall equipment if time permits and safe to do so',
        'Conduct full headcount at shelter — account for ALL workers, report missing persons immediately',
        'Do not resume outdoor work until all-clear — inspect all work areas for damage before resuming operations'
      ],
      watchFor: 'Lightning (cease outdoor work at first sign), flash flooding, downed power lines, structural damage, flying debris.',
      workMod: 'All outdoor operations suspended. Shelter-in-place until all-clear. Never use elevators during evacuation. Do not go back for belongings.',
      gear: 'Hard hat required when moving to shelter, high-visibility vest for accountability, waterproof outer layer, personal flashlight in case of power loss'
    },

    storm: {
      title: 'Advance Preparation — Severe Storm Forecasted',
      description: 'Severe storm is expected. Review emergency action plan and prepare for potential shelter-in-place.',
      cardColor: 'green',
      actions: [
        'Brief crew on forecasted storm conditions, expected timing, and shelter locations',
        'Review emergency action plan — confirm all workers know evacuation routes and shelter areas',
        'Pre-secure all loose materials, tools, and equipment on-site',
        'Verify all communication devices are charged and emergency contacts are current',
        'Identify work that can be moved indoors and prepare contingency schedule'
      ],
      watchFor: 'Darkening skies, increasing wind, thunder/lightning in the distance, sudden temperature drop.',
      workMod: 'Plan to suspend all outdoor operations when conditions arrive. Pre-position emergency supplies.',
      gear: 'Ensure hard hats, high-visibility vests, waterproof layers, and flashlights are accessible for all workers'
    },

    // ── NWS ALERT ───────────────────────────────────────
    nws_alert: isWarning ? {
      title: 'Emergency Response — National Weather Service Alert',
      description: 'The National Weather Service has issued a severe alert for this area. Follow all NWS instructions immediately.',
      cardColor: 'red',
      actions: [
        'Follow ALL instructions from the National Weather Service alert (see NWS details above)',
        'Ensure all workers are immediately aware of the active alert and its severity',
        'Activate your site-specific emergency action plan — designate evacuation coordinator',
        'Monitor NWS updates continuously for changes in alert status',
        'Do not resume normal operations until the NWS alert has expired or been cancelled'
      ],
      watchFor: 'Conditions specific to the NWS alert type. Monitor for rapid deterioration. Watch for lightning, flooding, wind damage, or other hazards described in the NWS alert.',
      workMod: 'Activate emergency action plan. Assign floor wardens and accountability coordinator. Prepare for potential evacuation or shelter-in-place per NWS guidance.',
      gear: 'As appropriate for the specific NWS event. Hard hat, high-visibility vest, communication devices charged and accessible.'
    } : {
      title: 'Operational Awareness — NWS Weather Advisory',
      description: 'The National Weather Service has issued an advisory for this area. Heightened awareness and preparation required.',
      cardColor: 'amber',
      actions: [
        'Brief all workers on the NWS advisory and what it means for site operations',
        'Review site emergency action plan — confirm all workers know evacuation routes and shelter locations',
        'Pre-stage emergency supplies and verify emergency contacts are current',
        'Monitor NWS updates for escalation from watch to warning',
        'Prepare for potential operations change — identify what work can move indoors if needed'
      ],
      watchFor: 'Conditions described in the NWS advisory. Watch for escalation from advisory to warning. Monitor for sudden changes.',
      workMod: 'Continue operations with heightened awareness. Prepare contingency plan for suspension if conditions escalate. Ensure all communication devices are charged.',
      gear: 'Per the specific NWS event type. Ensure communication devices (radio/phone) are charged and accessible.'
    }
  };

  return protocols[baseType] || protocols[alertType] || protocols.nws_alert;
}

// ═══════════════════════════════════════════════════════════
// EMAIL HTML TEMPLATE
// ═══════════════════════════════════════════════════════════

function renderAlertEmail(alert, site, conditions, forecast) {
  const ppe = getPpeReminders(alert.type);
  const isHeat = alert.type === 'heat_index' || alert.type === 'forecast_heat';
  const hydration = isHeat ? getHydrationSchedule() : [];
  const protocol = getWeatherResponseProtocol(alert.type, alert.severity);

  // Severity-based colors for email header
  const severityColors = {
    warning:  { bg: '#fef2f2', border: '#dc2626', banner: '#dc2626' },
    watch:    { bg: '#fff7ed', border: '#ea580c', banner: '#ea580c' },
    advisory: { bg: '#fefce8', border: '#ca8a04', banner: '#ca8a04' }
  };
  const colors = severityColors[alert.severity] || severityColors.watch;
  const severityLabel = (alert.severity || 'watch').toUpperCase();

  // Protocol card colors (matching incident protocol)
  const cardColors = {
    red:   { bg: '#fef2f2', border: '#ef4444', title: '#dc2626' },
    amber: { bg: '#fffbeb', border: '#f59e0b', title: '#d97706' },
    green: { bg: '#f0fdf4', border: '#22c55e', title: '#16a34a' }
  };
  const pc = cardColors[protocol.cardColor] || cardColors.amber;

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

  // Threshold line
  const thresholdLine = alert.threshold && alert.unit ? `
    <p style="margin:0;font-size:14px;color:#475569;">
      Threshold: ${alert.threshold}${alert.unit} &nbsp;|&nbsp; Actual: <strong>${alert.actual}${alert.unit}</strong>
    </p>
  ` : '';

  // Workers' Comp block — only for warning and watch, not advisory
  const showWorkersComp = alert.severity === 'warning' || alert.severity === 'watch';
  const workersCompBlock = showWorkersComp ? `
  <div style="padding:16px;margin:16px 20px 0;background:rgba(37,99,235,0.05);border:1px solid rgba(37,99,235,0.2);border-radius:8px;">
    <h4 style="margin:0 0 8px;font-size:13px;color:#2563eb;text-transform:uppercase;letter-spacing:0.05em;">Workers' Comp Reminder</h4>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.7;">
      <li>Notify HR immediately for workers' comp processing</li>
      <li>Provide employee with claim forms before leaving site</li>
      <li>Route to approved Occupational Clinic</li>
      <li>Submit all workers' comp paperwork within 24 hours</li>
    </ul>
  </div>
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

  <!-- ═══ OPERATIONAL RESPONSE PROTOCOL ═══ -->
  <div style="margin:20px;border:2px solid ${pc.border};border-radius:12px;overflow:hidden;">

    <!-- Protocol Header -->
    <div style="background:${pc.bg};padding:18px;border-bottom:1px solid ${pc.border};">
      <h2 style="margin:0 0 6px;font-size:18px;color:${pc.title};">${protocol.title}</h2>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">${protocol.description}</p>
    </div>

    <!-- Immediate Actions -->
    <div style="padding:18px;border-bottom:1px solid #e2e8f0;">
      <h3 style="margin:0 0 10px;font-size:15px;color:#1e293b;">&#9889; Immediate Actions</h3>
      <ol style="margin:0;padding-left:20px;font-size:14px;color:#334155;line-height:1.8;">
        ${protocol.actions.map(a => `<li style="margin-bottom:4px;">${a}</li>`).join('')}
      </ol>
    </div>

    <!-- Watch For -->
    <div style="padding:18px;border-bottom:1px solid #e2e8f0;">
      <h3 style="margin:0 0 10px;font-size:15px;color:#1e293b;">&#128064; Watch For These Symptoms</h3>
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">${protocol.watchFor}</p>
    </div>

    <!-- Work Modification -->
    <div style="padding:18px;border-bottom:1px solid #e2e8f0;">
      <h3 style="margin:0 0 10px;font-size:15px;color:#1e293b;">&#128736; Work Modification</h3>
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">${protocol.workMod}</p>
    </div>

    <!-- Gear Reminders -->
    <div style="padding:18px;">
      <h3 style="margin:0 0 10px;font-size:15px;color:#1e293b;">&#129520; Gear Reminders</h3>
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">${protocol.gear}</p>
    </div>

  </div>

  <!-- PPE Reminders -->
  <div style="padding:18px;margin:16px 20px 0;background:#eff6ff;border-left:5px solid #3b82f6;border-radius:0 8px 8px 0;">
    <h3 style="margin:0 0 10px;font-size:16px;color:#1e40af;">PPE Requirements</h3>
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

  <!-- Escalation Protocol -->
  <div style="padding:16px;margin:16px 20px 0;background:rgba(37,99,235,0.05);border:1px solid rgba(37,99,235,0.2);border-radius:8px;">
    <h4 style="margin:0 0 8px;font-size:13px;color:#2563eb;text-transform:uppercase;letter-spacing:0.05em;">Escalation (Within 10 Min)</h4>
    <ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.7;">
      <li>Notify your Site Supervisor or on-duty Security</li>
      <li>Supervisor &rarr; Safety Manager &rarr; Site Leadership (phone)</li>
      <li>Safety Manager &rarr; EHS, HR, and relevant management</li>
      <li>Share: <strong>WHO, WHAT, WHEN, WHERE, WHY</strong></li>
      <li>Begin documentation within 1 hour</li>
    </ul>
  </div>

  ${workersCompBlock}

  <!-- Footer -->
  <div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;border-top:1px solid #e2e8f0;">
    <p style="margin:0 0 4px;">Automated alert from TheSafetyVerse Weather Monitoring System</p>
    <p style="margin:0;">Generated: ${timestamp} &nbsp;|&nbsp; Next check in 30 minutes</p>
  </div>

</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// SEND EMAIL via Resend HTTP API
// ═══════════════════════════════════════════════════════════

async function sendAlertEmail(to, subject, html) {
  if (!isEmailConfigured()) {
    console.log(`[EMAIL SKIPPED] Not configured. Would send to: ${to}`);
    console.log(`  Subject: ${subject}`);
    return { sent: false, reason: 'Email not configured (missing Resend API key)' };
  }

  try {
    const apiKey = getResendApiKey();
    const from = getFromAddress();
    const toArray = to.split(',').map(e => e.trim()).filter(Boolean);

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: toArray, subject, html })
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
