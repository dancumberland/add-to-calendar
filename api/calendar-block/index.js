import { trackDailyUsage } from "../../utils/analytics.js";
import { DateTime } from "luxon";

// Corpus logger — POSTs to VPS receiver (unlimited retention, JSONL files).
// VPS_LOG_URL: http://159.203.139.119:9201/log
// Logs at: /home/claude/kit-calendar-log-receiver/logs/corpus-YYYY-MM-DD.jsonl
// Falls back to console.log if VPS_LOG_URL is not set.
function corpusLog(payload) {
  if (process.env.VPS_LOG_URL) {
    fetch(process.env.VPS_LOG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.VPS_LOG_SECRET
          ? { Authorization: `Bearer ${process.env.VPS_LOG_SECRET}` }
          : {}),
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } else {
    console.log(JSON.stringify(payload));
  }
}

// Complete timezone mapping based on Rails ActiveSupport::TimeZone
// Kit is a Rails app, so its timezone picker uses these exact names.
// Source: https://api.rubyonrails.org/classes/ActiveSupport/TimeZone.html
//
// Format: Kit may send just the name ("Abu Dhabi") or with offset ("Abu Dhabi (GMT+04:00)")
// The mapTimezoneToIANA function handles both via exact match + name extraction.
const TIMEZONE_MAP = {
  // ============ RAILS ActiveSupport::TimeZone (134 entries) ============
  // These are the EXACT names from Rails' timezone list.
  // Kit is a Rails app, so this is what its picker sends.

  // --- UTC-12 to UTC-8 ---
  'International Date Line West': 'Etc/GMT+12',
  'Midway Island': 'Pacific/Midway',
  'American Samoa': 'Pacific/Pago_Pago',
  'Hawaii': 'Pacific/Honolulu',
  'Alaska': 'America/Juneau',
  'Pacific Time (US & Canada)': 'America/Los_Angeles',
  'Tijuana': 'America/Tijuana',

  // --- UTC-7 ---
  'Mountain Time (US & Canada)': 'America/Denver',
  'Arizona': 'America/Phoenix',
  'Chihuahua': 'America/Chihuahua',
  'Mazatlan': 'America/Mazatlan',

  // --- UTC-6 ---
  'Central Time (US & Canada)': 'America/Chicago',
  'Saskatchewan': 'America/Regina',
  'Guadalajara': 'America/Mexico_City',
  'Mexico City': 'America/Mexico_City',
  'Monterrey': 'America/Monterrey',
  'Central America': 'America/Guatemala',

  // --- UTC-5 ---
  'Eastern Time (US & Canada)': 'America/New_York',
  'Indiana (East)': 'America/Indiana/Indianapolis',
  'Bogota': 'America/Bogota',
  'Lima': 'America/Lima',
  'Quito': 'America/Lima',

  // --- UTC-4 ---
  'Atlantic Time (Canada)': 'America/Halifax',
  'Caracas': 'America/Caracas',
  'La Paz': 'America/La_Paz',
  'Santiago': 'America/Santiago',

  // --- UTC-3:30 ---
  'Newfoundland': 'America/St_Johns',

  // --- UTC-3 ---
  'Brasilia': 'America/Sao_Paulo',
  'Buenos Aires': 'America/Argentina/Buenos_Aires',
  'Montevideo': 'America/Montevideo',
  'Georgetown': 'America/Guyana',
  'Puerto Rico': 'America/Puerto_Rico',
  'Greenland': 'America/Godthab',

  // --- UTC-2 ---
  'Mid-Atlantic': 'Atlantic/South_Georgia',

  // --- UTC-1 ---
  'Azores': 'Atlantic/Azores',
  'Cape Verde Is.': 'Atlantic/Cape_Verde',

  // --- UTC+0 ---
  'Dublin': 'Europe/Dublin',
  'Edinburgh': 'Europe/London',
  'Lisbon': 'Europe/Lisbon',
  'London': 'Europe/London',
  'Casablanca': 'Africa/Casablanca',
  'Monrovia': 'Africa/Monrovia',
  'UTC': 'Etc/UTC',

  // --- UTC+1 ---
  'Belgrade': 'Europe/Belgrade',
  'Bratislava': 'Europe/Bratislava',
  'Budapest': 'Europe/Budapest',
  'Ljubljana': 'Europe/Ljubljana',
  'Prague': 'Europe/Prague',
  'Sarajevo': 'Europe/Sarajevo',
  'Skopje': 'Europe/Skopje',
  'Warsaw': 'Europe/Warsaw',
  'Zagreb': 'Europe/Zagreb',
  'Brussels': 'Europe/Brussels',
  'Copenhagen': 'Europe/Copenhagen',
  'Madrid': 'Europe/Madrid',
  'Paris': 'Europe/Paris',
  'Amsterdam': 'Europe/Amsterdam',
  'Berlin': 'Europe/Berlin',
  'Bern': 'Europe/Zurich',
  'Zurich': 'Europe/Zurich',
  'Rome': 'Europe/Rome',
  'Stockholm': 'Europe/Stockholm',
  'Vienna': 'Europe/Vienna',
  'West Central Africa': 'Africa/Algiers',

  // --- UTC+2 ---
  'Bucharest': 'Europe/Bucharest',
  'Cairo': 'Africa/Cairo',
  'Helsinki': 'Europe/Helsinki',
  'Kyiv': 'Europe/Kiev',
  'Riga': 'Europe/Riga',
  'Sofia': 'Europe/Sofia',
  'Tallinn': 'Europe/Tallinn',
  'Vilnius': 'Europe/Vilnius',
  'Athens': 'Europe/Athens',
  'Istanbul': 'Europe/Istanbul',
  'Minsk': 'Europe/Minsk',
  'Jerusalem': 'Asia/Jerusalem',
  'Harare': 'Africa/Harare',
  'Pretoria': 'Africa/Johannesburg',

  // --- UTC+3 ---
  'Kaliningrad': 'Europe/Kaliningrad',
  'Moscow': 'Europe/Moscow',
  'St. Petersburg': 'Europe/Moscow',
  'Volgograd': 'Europe/Volgograd',
  'Samara': 'Europe/Samara',
  'Kuwait': 'Asia/Kuwait',
  'Riyadh': 'Asia/Riyadh',
  'Nairobi': 'Africa/Nairobi',
  'Baghdad': 'Asia/Baghdad',

  // --- UTC+3:30 ---
  'Tehran': 'Asia/Tehran',

  // --- UTC+4 (THE DUBAI/UAE FIX) ---
  'Abu Dhabi': 'Asia/Muscat',   // ← This is what Kit sends for UAE!
  'Muscat': 'Asia/Muscat',
  'Baku': 'Asia/Baku',
  'Tbilisi': 'Asia/Tbilisi',
  'Yerevan': 'Asia/Yerevan',

  // --- UTC+4:30 ---
  'Kabul': 'Asia/Kabul',

  // --- UTC+5 ---
  'Ekaterinburg': 'Asia/Yekaterinburg',
  'Islamabad': 'Asia/Karachi',
  'Karachi': 'Asia/Karachi',
  'Tashkent': 'Asia/Tashkent',

  // --- UTC+5:30 ---
  'Chennai': 'Asia/Kolkata',
  'Kolkata': 'Asia/Kolkata',
  'Mumbai': 'Asia/Kolkata',
  'New Delhi': 'Asia/Kolkata',
  'Sri Jayawardenepura': 'Asia/Colombo',

  // --- UTC+5:45 ---
  'Kathmandu': 'Asia/Kathmandu',

  // --- UTC+6 ---
  'Astana': 'Asia/Dhaka',
  'Dhaka': 'Asia/Dhaka',
  'Almaty': 'Asia/Almaty',

  // --- UTC+6:30 ---
  'Novosibirsk': 'Asia/Novosibirsk',
  'Rangoon': 'Asia/Rangoon',

  // --- UTC+7 ---
  'Bangkok': 'Asia/Bangkok',
  'Hanoi': 'Asia/Bangkok',
  'Jakarta': 'Asia/Jakarta',
  'Krasnoyarsk': 'Asia/Krasnoyarsk',

  // --- UTC+8 ---
  'Beijing': 'Asia/Shanghai',
  'Chongqing': 'Asia/Chongqing',
  'Hong Kong': 'Asia/Hong_Kong',
  'Urumqi': 'Asia/Urumqi',
  'Kuala Lumpur': 'Asia/Kuala_Lumpur',
  'Singapore': 'Asia/Singapore',
  'Taipei': 'Asia/Taipei',
  'Perth': 'Australia/Perth',
  'Irkutsk': 'Asia/Irkutsk',

  // --- UTC+9 ---
  'Ulaanbaatar': 'Asia/Ulaanbaatar',
  'Seoul': 'Asia/Seoul',
  'Osaka': 'Asia/Tokyo',
  'Sapporo': 'Asia/Tokyo',
  'Tokyo': 'Asia/Tokyo',
  'Yakutsk': 'Asia/Yakutsk',

  // --- UTC+9:30 ---
  'Darwin': 'Australia/Darwin',
  'Adelaide': 'Australia/Adelaide',

  // --- UTC+10 ---
  'Canberra': 'Australia/Melbourne',
  'Melbourne': 'Australia/Melbourne',
  'Sydney': 'Australia/Sydney',
  'Brisbane': 'Australia/Brisbane',
  'Hobart': 'Australia/Hobart',
  'Vladivostok': 'Asia/Vladivostok',
  'Guam': 'Pacific/Guam',
  'Port Moresby': 'Pacific/Port_Moresby',

  // --- UTC+11 ---
  'Magadan': 'Asia/Magadan',
  'Srednekolymsk': 'Asia/Srednekolymsk',
  'Solomon Is.': 'Pacific/Guadalcanal',
  'New Caledonia': 'Pacific/Noumea',

  // --- UTC+12 ---
  'Fiji': 'Pacific/Fiji',
  'Kamchatka': 'Asia/Kamchatka',
  'Marshall Is.': 'Pacific/Majuro',
  'Auckland': 'Pacific/Auckland',
  'Wellington': 'Pacific/Auckland',

  // --- UTC+13 ---
  "Nuku'alofa": 'Pacific/Tongatapu',
  'Tokelau Is.': 'Pacific/Fakaofo',
  'Chatham Is.': 'Pacific/Chatham',
  'Samoa': 'Pacific/Apia',

  // ============ LEGACY ALIASES ============
  // Additional formats we've seen Kit send historically (with GMT offset suffix)
  // and common alternate names. Kept for backwards compatibility.
  'Pacific Time (GMT-08:00)': 'America/Los_Angeles',
  'Mountain Time (GMT-07:00)': 'America/Denver',
  'Central Time (GMT-06:00)': 'America/Chicago',
  'Eastern Time (GMT-05:00)': 'America/New_York',
  'Dubai': 'Asia/Dubai',
  'Dubai (GMT+04:00)': 'Asia/Dubai',
  'Queensland': 'Australia/Brisbane',
  'GMT': 'UTC',
  'India': 'Asia/Kolkata',
  'Nepal': 'Asia/Kathmandu',
};

function mapTimezoneToIANA(kitTimezone) {
  if (!kitTimezone) {
    console.warn('⚠️ TIMEZONE MISSING: No timezone provided, defaulting to UTC');
    return 'UTC';
  }

  // Step 1: If it's already in IANA format (contains '/'), validate and return
  if (kitTimezone.includes('/')) {
    const testDt = DateTime.now().setZone(kitTimezone);
    if (testDt.isValid) {
      return kitTimezone;
    }
    console.warn(`Invalid IANA timezone: ${kitTimezone}, defaulting to UTC`);
    return 'UTC';
  }

  // Step 2: Try exact match (e.g., "Abu Dhabi", "Pacific Time (US & Canada)")
  if (TIMEZONE_MAP[kitTimezone]) {
    return TIMEZONE_MAP[kitTimezone];
  }

  // Step 3: Try case-insensitive exact match
  const lowerInput = kitTimezone.toLowerCase().trim();
  for (const [key, value] of Object.entries(TIMEZONE_MAP)) {
    if (key.toLowerCase() === lowerInput) {
      return value;
    }
  }

  // Step 4: Strip GMT offset suffix and try matching the name part
  // Handles: "Abu Dhabi (GMT+04:00)" → "Abu Dhabi"
  // Also:    "(GMT+04:00) Abu Dhabi" → "Abu Dhabi"
  const nameWithoutOffset = kitTimezone
    .replace(/\s*\(GMT[+-]?\d{2}:\d{2}\)\s*/g, '')  // Remove "(GMT+04:00)" anywhere
    .replace(/\s*GMT[+-]?\d{2}:\d{2}\s*/g, '')       // Remove bare "GMT+04:00"
    .trim();

  if (nameWithoutOffset && TIMEZONE_MAP[nameWithoutOffset]) {
    return TIMEZONE_MAP[nameWithoutOffset];
  }
  // Case-insensitive after stripping offset
  if (nameWithoutOffset) {
    const lowerName = nameWithoutOffset.toLowerCase();
    for (const [key, value] of Object.entries(TIMEZONE_MAP)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }
  }

  // Step 5: LAST RESORT — extract GMT offset and use fixed-offset timezone
  // This is better than falling back to UTC because it preserves the correct offset.
  // Works perfectly for non-DST zones (Dubai, India, etc.) and is close enough
  // for DST zones (off by 1 hour during DST transition, vs potentially 12 hours with UTC).
  const offsetMatch = kitTimezone.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (offsetMatch) {
    const sign = offsetMatch[1];
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = parseInt(offsetMatch[3], 10);
    const fixedOffset = `UTC${sign}${hours}${minutes > 0 ? ':' + String(minutes).padStart(2, '0') : ''}`;
    const testDt = DateTime.now().setZone(fixedOffset);
    if (testDt.isValid) {
      console.warn(`⚠️ TIMEZONE NAME NOT FOUND: "${kitTimezone}" - using extracted offset ${fixedOffset}. Add this timezone name to TIMEZONE_MAP!`);
      return fixedOffset;
    }
  }

  // Step 6: True fallback — log loudly so we can fix the map
  console.error(`🚨 TIMEZONE NOT FOUND: "${kitTimezone}" - defaulting to UTC. THIS WILL CAUSE DATE ERRORS FOR USERS AHEAD OF UTC. Add this timezone to TIMEZONE_MAP immediately!`);
  return 'UTC';
}

// Infer event type from title/description for analytics
function inferEventType(title, description = '') {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('meeting') || text.includes('call') || text.includes('zoom')) return 'meeting';
  if (text.includes('appointment') || text.includes('doctor') || text.includes('dentist')) return 'appointment';
  if (text.includes('birthday') || text.includes('anniversary')) return 'personal';
  if (text.includes('deadline') || text.includes('due') || text.includes('submit')) return 'deadline';
  if (text.includes('event') || text.includes('conference') || text.includes('workshop')) return 'event';
  return 'other';
}

// Check for DST edge cases (ambiguous or invalid times)
// Returns: { valid: true } or { valid: false, reason: string, suggestion: DateTime }
function checkDSTEdgeCases(dt, timezone) {
  if (!dt.isValid) {
    return { valid: false, reason: 'invalid_datetime', message: dt.invalidExplanation };
  }

  // Check for ambiguous times (fall-back DST - time occurs twice)
  // Luxon's getPossibleOffsets() returns multiple offsets if time is ambiguous
  try {
    const possibleOffsets = dt.getPossibleOffsets?.();
    if (possibleOffsets && possibleOffsets.length > 1) {
      console.warn(`⚠️ DST AMBIGUOUS TIME: ${dt.toString()} in ${timezone} has ${possibleOffsets.length} possible interpretations`);
      // We'll use the first (earlier) occurrence by default
      return {
        valid: true,
        warning: 'ambiguous_time',
        message: `Time ${dt.toFormat('h:mm a')} occurs twice due to DST fall-back. Using earlier occurrence.`
      };
    }
  } catch (e) {
    // getPossibleOffsets may not be available in all Luxon versions
  }

  // Check if the time was adjusted due to DST gap (spring-forward - time doesn't exist)
  // We can detect this by recreating the datetime and comparing
  const recreated = DateTime.fromObject({
    year: dt.year,
    month: dt.month,
    day: dt.day,
    hour: dt.hour,
    minute: dt.minute
  }, { zone: timezone });

  if (recreated.hour !== dt.hour || recreated.minute !== dt.minute) {
    console.warn(`⚠️ DST GAP TIME: Requested time was adjusted from ${dt.hour}:${dt.minute} to ${recreated.hour}:${recreated.minute} due to DST spring-forward`);
    return {
      valid: true,
      warning: 'time_adjusted',
      message: `Requested time doesn't exist due to DST spring-forward. Adjusted to ${recreated.toFormat('h:mm a')}.`
    };
  }

  return { valid: true };
}

// Validate time format (HH:MM)
function validateTimeFormat(timeStr) {
  const match = timeStr?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59;
}

// Validate AM/PM
function validateAmPm(ampm) {
  return ampm && ['AM', 'PM', 'am', 'pm'].includes(ampm);
}

// Kit payload keys. Schema monitor alerts when Kit sends keys outside this set.
// Update this list (and docs/KIT-DATE-SPEC.md) when Kit adds new fields.
//
// SCOPE: Detects key *additions* only. It does NOT detect:
//   - Key removal (missing required keys fail at parse time, not schema monitor)
//   - Semantic changes (same key, different value encoding — only corpus analysis catches these)
//   - Encoding drift (e.g. date format change within the existing 'date' field)
// For those failure modes, the corpus log + VPS health check are the detection layer.
const KNOWN_SETTINGS_KEYS = [
  'title', 'date', 'start_time', 'start_ampm', 'end_time', 'end_ampm',
  'tz', 'location', 'description', 'background_color', 'text_color',
  'size', 'rounded_corners', 'alignment',
  // New format (Kit v2, detected April 2026)
  'start', 'duration', 'timezone',
];

// Debug logging — only emits when DEBUG=true in environment.
// Never touches the structured corpus log entries.
const debug = (...a) => process.env.DEBUG && console.log(...a);

export default async function handler(req, res) {
  // ---- CORS ----
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Capture raw settings outside try block for error-path corpus logging.
  const rawSettings = req.method === "POST" ? req.body?.settings || {} : req.query;
  debug('REQUEST:', { method: req.method, origin: req.headers['origin'], ts: new Date().toISOString() });

  try {
    const settings = rawSettings;
    const {
      title,
      // Legacy format (Kit v1)
      date: dateISO,
      start_time,
      start_ampm,
      end_time,
      end_ampm,
      tz,
      // New format (Kit v2, April 2026) — clean ISO start, duration in minutes, IANA timezone
      start: startISO,
      duration: durationMinutes,
      timezone: timezoneIANA,
      // Common fields
      location,
      description = "See you there!",
      // Styling settings with defaults
      background_color = "#4285F4",
      text_color = "#FFFFFF",
      size = "medium",
      rounded_corners = "4px",
      alignment = "center"
    } = settings;

    // ===== KIT BOUNDARY SCHEMA MONITOR =====
    // Detects when Kit sends payload keys we've never seen — earliest possible catch point
    // for a "Mode D" scenario where Kit changes their format before downstream logic fails.
    const unknownKeys = Object.keys(settings).filter(k => !KNOWN_SETTINGS_KEYS.includes(k));
    if (unknownKeys.length > 0) {
      corpusLog({
        event: 'kit_schema_change',
        timestamp: new Date().toISOString(),
        unknown_keys: unknownKeys,
        settings_snapshot: settings,
      });
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blocks: [{
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `⚠️ *Kit Calendar — Unknown payload keys detected*\nNew fields: \`${unknownKeys.join(', ')}\`\nKit may have changed their calendar block format. Check Vercel logs.`,
              },
            }],
          }),
        }).catch(e => console.error('Schema monitor alert failed:', e.message));
      }
    }

    // Detect which format Kit sent — v2 (start/duration/timezone) vs v1 (date/start_time/etc.)
    const isV2Format = !!(startISO && durationMinutes && timezoneIANA);
    const isV1Format = !!(dateISO && start_time && start_ampm && end_time && end_ampm && tz);

    // If settings are incomplete for BOTH formats, return the placeholder
    if (!title || (!isV2Format && !isV1Format)) {
      const placeholderHtml = `
        <div style="border: 1px dashed #ccc; padding: 40px; text-align: center; font-family: Helvetica, Arial, sans-serif; color: #555;">
          Add your event details in the sidebar -->
        </div>
      `;
      return res.status(200).json({ code: 200, html: placeholderHtml });
    }

    let startDateTime, endDateTime, ianaTimezone, isDateOnly, isMidnightUTC;

    if (isV2Format) {
      // ===== V2 FORMAT (Kit April 2026+) =====
      // start: ISO local datetime "2026-04-10T10:00:00"
      // duration: minutes as string "60"
      // timezone: IANA name "America/Chicago"
      ianaTimezone = timezoneIANA;
      debug('V2 INPUT:', { startISO, durationMinutes, timezoneIANA });

      startDateTime = DateTime.fromISO(startISO, { zone: ianaTimezone });
      if (!startDateTime.isValid) {
        throw new Error(`Invalid v2 start datetime: '${startISO}'. Reason: ${startDateTime.invalidReason}`);
      }

      const duration = parseInt(durationMinutes, 10);
      if (isNaN(duration) || duration <= 0) {
        throw new Error(`Invalid v2 duration: '${durationMinutes}'. Expected positive integer (minutes).`);
      }
      endDateTime = startDateTime.plus({ minutes: duration });

      debug('V2 PARSED:', { startISO: startDateTime.toISO(), endISO: endDateTime.toISO() });
    } else {
      // ===== V1 FORMAT (Legacy) =====
      // Validate time formats early to catch bad data
      if (!validateTimeFormat(start_time)) {
        throw new Error(`Invalid start time format: '${start_time}'. Expected HH:MM (e.g., '09:30' or '2:00')`);
      }
      if (!validateTimeFormat(end_time)) {
        throw new Error(`Invalid end time format: '${end_time}'. Expected HH:MM (e.g., '09:30' or '2:00')`);
      }
      if (!validateAmPm(start_ampm)) {
        throw new Error(`Invalid start AM/PM: '${start_ampm}'. Expected 'AM' or 'PM'`);
      }
      if (!validateAmPm(end_ampm)) {
        throw new Error(`Invalid end AM/PM: '${end_ampm}'. Expected 'AM' or 'PM'`);
      }

      // Map Kit's timezone format to IANA format that Luxon understands
      ianaTimezone = mapTimezoneToIANA(tz);
      debug('V1 INPUT:', { dateISO, start_time, start_ampm, end_time, end_ampm, tz, ianaTimezone, alignment });

      // Kit's date picker behavior varies:
      //
      // Mode A — "Midnight-local-as-UTC": The picker sends midnight in the user's BROWSER
      //   timezone encoded as UTC. A Brisbane (UTC+10) user selecting Feb 5 sends
      //   "2026-02-04T14:00:00.000Z" (Feb 5 00:00 AEST = Feb 4 14:00 UTC).
      //   → Non-midnight UTC time → convert UTC→target TZ to recover the intended date.
      //
      // Mode B — "Date-only or midnight-UTC": The picker sends a plain date ("2026-03-18")
      //   or midnight UTC ("2026-03-18T00:00:00.000Z"). The UTC date IS the intended date.
      //   → Midnight UTC or no time component → use the UTC date directly.
      //
      // Without Mode B handling, US/western users get dates shifted back one day:
      //   "2026-03-18T00:00:00Z" → Eastern (UTC-4) → March 17 20:00 → wrong date.
      const utcMoment = DateTime.fromISO(dateISO, { zone: 'utc' });
      isDateOnly = !dateISO.includes('T');
      // Mode B detection: UTC time is exactly midnight (00:00:00.000).
      // Tolerance: sub-second jitter is safe (second === 0 passes even with ms offset).
      // Not safe: if Kit ever sends 00:00:01Z or later, this routes to Mode A (date-off-by-one
      // for UTC+ users). In practice Kit constructs dates from date values, not timestamps,
      // so non-zero seconds are not expected. Validated: Kit sends .000Z exactly.
      isMidnightUTC = utcMoment.hour === 0 && utcMoment.minute === 0 && utcMoment.second === 0;

      let datePart;
      if (isDateOnly || isMidnightUTC) {
        // Plain date or midnight UTC — the UTC date IS the intended date
        datePart = utcMoment.toISODate();
      } else {
        // Non-midnight UTC — date picker sent midnight-in-local-time as UTC
        // Take the later of UTC date and target-TZ date to handle browser TZ ≠ account TZ
        const dateInTargetTz = utcMoment.setZone(ianaTimezone);
        const utcDate = utcMoment.toISODate();
        const tzDate = dateInTargetTz.toISODate();
        datePart = utcDate > tzDate ? utcDate : tzDate;
      }

      debug('V1 DATE PARSE:', { isDateOnly, isMidnightUTC, datePart, utc: utcMoment.toISODate() });

      // Construct a parseable 12-hour format string
      const fullStartString = `${datePart} ${start_time} ${start_ampm}`;
      const fullEndString = `${datePart} ${end_time} ${end_ampm}`;

      debug('V1 STRINGS:', { fullStartString, fullEndString });

      // Parse the strings into Luxon DateTime objects using the specified timezone
      startDateTime = DateTime.fromFormat(fullStartString, 'yyyy-MM-dd h:mm a', { zone: ianaTimezone });
      endDateTime = DateTime.fromFormat(fullEndString, 'yyyy-MM-dd h:mm a', { zone: ianaTimezone });

      debug('V1 DATETIME:', { startISO: startDateTime.toISO(), endISO: endDateTime.toISO(), startValid: startDateTime.isValid, endValid: endDateTime.isValid });

      if (!startDateTime.isValid || !endDateTime.isValid) {
        const startReason = startDateTime.invalidReason || 'unknown';
        const endReason = endDateTime.invalidReason || 'unknown';
        throw new Error(`Invalid date/time. Start: ${startReason}, End: ${endReason}. Received: date='${dateISO}', start='${start_time} ${start_ampm}', end='${end_time} ${end_ampm}', tz='${tz}' (mapped to '${ianaTimezone}')`);
      }
    }

    // Check for DST edge cases
    const startDSTCheck = checkDSTEdgeCases(startDateTime, ianaTimezone);
    const endDSTCheck = checkDSTEdgeCases(endDateTime, ianaTimezone);

    if (startDSTCheck.warning) debug('DST WARNING (start):', startDSTCheck.message);
    if (endDSTCheck.warning) debug('DST WARNING (end):', endDSTCheck.message);

    // Validate end time is after start time
    if (endDateTime <= startDateTime) {
      console.warn(`⚠️ END TIME WARNING: End time (${endDateTime.toFormat('h:mm a')}) is not after start time (${startDateTime.toFormat('h:mm a')}). Event may span midnight.`);
    }

    // Build stateless ICS URL — all event data encoded in query params.
    // This means Apple calendar links never expire (unlike the old KV-based approach).
    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const icsParams = new URLSearchParams({
      title,
      start: startDateTime.toUTC().toISO(),
      end: endDateTime.toUTC().toISO(),
      ...(location && { location }),
      ...(description && { description }),
    });
    const icsUrl = `${baseUrl}/api/ics?${icsParams.toString()}`;

    // Track usage metrics
    try {
      await trackDailyUsage({
        timestamp: new Date().toISOString(),
        timezone: ianaTimezone,
        hasLocation: !!location,
        eventType: inferEventType(title, description)
      });
    } catch (analyticsError) {
      console.error("Analytics tracking error:", analyticsError.message);
    }

    const formatDateForGoogle = (dt) => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
    // Outlook requires proper ISO 8601 with separators: 2025-01-28T18:00:00Z
    const formatDateForOutlook = (dt) => dt.toUTC().toISO({ suppressMilliseconds: true });

    const googleUrl = new URL("https://calendar.google.com/calendar/render");
    googleUrl.searchParams.set("action", "TEMPLATE");
    googleUrl.searchParams.set("text", title);
    googleUrl.searchParams.set("details", description);
    googleUrl.searchParams.set("location", location || "");
    googleUrl.searchParams.set("dates", `${formatDateForGoogle(startDateTime)}/${formatDateForGoogle(endDateTime)}`);

    // Modern Outlook URL format (deeplink, not the old /owa/ endpoint)
    // Using proper ISO 8601 format for dates (YYYY-MM-DDTHH:mm:ssZ)
    const outlookUrl = new URL("https://outlook.live.com/calendar/deeplink/compose");
    outlookUrl.searchParams.set("path", "/calendar/action/compose");
    outlookUrl.searchParams.set("rru", "addevent");
    outlookUrl.searchParams.set("subject", title);
    outlookUrl.searchParams.set("body", description);
    outlookUrl.searchParams.set("location", location || "");
    outlookUrl.searchParams.set("startdt", formatDateForOutlook(startDateTime));
    outlookUrl.searchParams.set("enddt", formatDateForOutlook(endDateTime));

    // Office 365 URL for enterprise/work accounts (same format, different domain)
    const office365Url = new URL("https://outlook.office.com/calendar/deeplink/compose");
    office365Url.searchParams.set("path", "/calendar/action/compose");
    office365Url.searchParams.set("rru", "addevent");
    office365Url.searchParams.set("subject", title);
    office365Url.searchParams.set("body", description);
    office365Url.searchParams.set("location", location || "");
    office365Url.searchParams.set("startdt", formatDateForOutlook(startDateTime));
    office365Url.searchParams.set("enddt", formatDateForOutlook(endDateTime));

    debug('URLS:', { google: googleUrl.toString(), outlook: outlookUrl.toString(), ics: icsUrl });

    // --- Button Styling ---
    const sizeMap = {
      small: { padding: "4px 8px", fontSize: "12px" },
      medium: { padding: "8px 12px", fontSize: "14px" },
      large: { padding: "12px 16px", fontSize: "16px" },
    };

    // Use email-compatible alignment methods instead of flexbox
    // Kit sends flex values (flex-start, center, flex-end) so we need to map them
    const getAlignmentStyles = (align) => {
      switch (align) {
        case 'left':
        case 'flex-start':
          return `text-align: left; display: block;`;
        case 'right':
        case 'flex-end':
          return `text-align: right; display: block;`;
        case 'center':
        default:
          return `text-align: center; display: block;`;
      }
    };

    debug('ALIGNMENT:', { alignment, output: getAlignmentStyles(alignment) });

    const containerStyle = `
      ${getAlignmentStyles(alignment)}
      font-family: Helvetica, Arial, sans-serif;
    `;

    const buttonStyle = `
      display: inline-block;
      padding: ${sizeMap[size]?.padding || sizeMap.medium.padding};
      background-color: ${background_color};
      background: ${background_color};
      color: ${text_color} !important;
      border-radius: ${rounded_corners};
      text-decoration: none;
      font-size: ${sizeMap[size]?.fontSize || sizeMap.medium.fontSize};
      text-align: center;
      margin: 0 5px;
      vertical-align: top;
      font-weight: normal;
      line-height: 1.2;
      border: none;
      -webkit-text-fill-color: ${text_color};
    `;

    // Use table-based layout for better email client compatibility
    // Tables are the most reliable way to control alignment in emails
    // Kit sends flex values (flex-start, center, flex-end) so we need to map them
    const getTableAlign = (align) => {
      switch (align) {
        case 'left':
        case 'flex-start':
          return 'left';
        case 'right':
        case 'flex-end':
          return 'right';
        case 'center':
        default:
          return 'center';
      }
    };

    // Mobile: stack buttons vertically below 480px. Cap the button width so
    // rounded_corners: 50% doesn't stretch the buttons into long ellipses.
    // Falls back to today's horizontal layout in clients that strip <style> blocks.
    const responsiveStyle = `
      <style>
        @media only screen and (max-width: 480px) {
          .kc-btn-table { width: 100% !important; }
          .kc-btn-cell {
            display: block !important;
            width: 100% !important;
            padding: 4px 0 !important;
            text-align: center !important;
          }
          .kc-btn-cell a {
            display: inline-block !important;
            min-width: 140px !important;
            margin: 0 !important;
          }
        }
      </style>
    `;

    const html = `
      ${responsiveStyle}
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="font-family: Helvetica, Arial, sans-serif;">
        <tr>
          <td align="${getTableAlign(alignment)}" style="padding: 0;">
            <table class="kc-btn-table" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td class="kc-btn-cell" style="padding: 0 5px;">
                  <a href="${googleUrl}" style="${buttonStyle}">Google</a>
                </td>
                <td class="kc-btn-cell" style="padding: 0 5px;">
                  <a href="${icsUrl}" style="${buttonStyle}">Apple</a>
                </td>
                <td class="kc-btn-cell" style="padding: 0 5px;">
                  <a href="${outlookUrl}" style="${buttonStyle}">Outlook</a>
                </td>
                <td class="kc-btn-cell" style="padding: 0 5px;">
                  <a href="${office365Url}" style="${buttonStyle}">Office 365</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;

    // ===== CORPUS LOG =====
    // Structured log of every production request — builds the observability corpus
    // for Kit's undocumented input space. 30-day retention via Vercel log drain.
    // Use this to audit for silent failures: periodically check that resolved dates
    // look sane relative to the raw input.
    const corpusEntry = {
      event: 'calendar_block_request',
      timestamp: new Date().toISOString(),
      format: isV2Format ? 'v2' : 'v1',
      timezone_iana: ianaTimezone,
      start_utc: startDateTime.toUTC().toISO(),
      end_utc: endDateTime.toUTC().toISO(),
    };
    if (isV2Format) {
      corpusEntry.raw_start = startISO;
      corpusEntry.duration_minutes = durationMinutes;
    } else {
      corpusEntry.raw_date_iso = dateISO;
      corpusEntry.detected_mode = isDateOnly ? 'date-only' : isMidnightUTC ? 'midnight-utc' : 'midnight-local-as-utc';
      corpusEntry.timezone_raw = tz;
      corpusEntry.start_time = `${start_time} ${start_ampm}`;
      corpusEntry.end_time = `${end_time} ${end_ampm}`;
    }
    corpusLog(corpusEntry);

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ code: 200, html: html });

  } catch (err) {
    console.error(err);
    // Error-path corpus log — captures raw inputs even when processing fails.
    // Without this, failed requests are invisible in the corpus (silent failure blind spot).
    corpusLog({
      event: 'calendar_block_error',
      timestamp: new Date().toISOString(),
      error: err.message,
      format: rawSettings.start ? 'v2' : 'v1',
      // V2 fields
      raw_start: rawSettings.start,
      duration: rawSettings.duration,
      timezone: rawSettings.timezone,
      // V1 fields
      raw_date_iso: rawSettings.date,
      timezone_raw: rawSettings.tz,
      start_time: rawSettings.start_time,
      start_ampm: rawSettings.start_ampm,
    });
    res.setHeader("Content-Type", "application/json");
    // Return a 200 OK status with a JSON body that indicates the error, as per Kit docs.
    return res.status(200).json({ code: 500, errors: [err.message] });
  }
}
