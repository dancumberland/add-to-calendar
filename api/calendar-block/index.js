import { trackDailyUsage } from "../../utils/analytics.js";
import { DateTime } from "luxon";

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

export default async function handler(req, res) {
  // ---- CORS ----
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  // ===== DIAGNOSTIC LOGGING: REQUEST METADATA =====
  console.log('🔍 TIMEZONE DEBUG - Request metadata:');
  console.log('  Method:', req.method);
  console.log('  User-Agent:', req.headers['user-agent']);
  console.log('  Origin:', req.headers['origin']);
  console.log('  Referer:', req.headers['referer']);
  console.log('  Request timestamp:', new Date().toISOString());

  try {
    const settings = req.method === "POST" ? req.body?.settings || {} : req.query;
    const { 
      title, 
      date: dateISO, 
      start_time, 
      start_ampm, 
      end_time, 
      end_ampm, 
      tz, 
      location, 
      description = "See you there!",
      // Styling settings with defaults
      background_color = "#4285F4",
      text_color = "#FFFFFF",
      size = "medium",
      rounded_corners = "4px",
      alignment = "center"
    } = settings;

    // If settings are incomplete, return the placeholder HTML block
    if (!title || !dateISO || !start_time || !start_ampm || !end_time || !end_ampm || !tz) {
      const placeholderHtml = `
        <div style="border: 1px dashed #ccc; padding: 40px; text-align: center; font-family: Helvetica, Arial, sans-serif; color: #555;">
          Add your event details in the sidebar -->
        </div>
      `;
      return res.status(200).json({ code: 200, html: placeholderHtml });
    }

    // ===== INPUT VALIDATION =====
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

    // ===== DIAGNOSTIC LOGGING: TIMEZONE ISSUE INVESTIGATION =====
    console.log('🔍 TIMEZONE DEBUG - Input from Kit:');
    console.log('  dateISO:', dateISO);
    console.log('  dateISO type:', typeof dateISO);
    console.log('  dateISO raw value:', JSON.stringify(dateISO));
    console.log('  start_time:', start_time, start_ampm);
    console.log('  end_time:', end_time, end_ampm);
    console.log('  timezone (raw):', tz);
    console.log('  title:', title);
    console.log('  alignment:', alignment);
    console.log('  Full settings object:', JSON.stringify(settings, null, 2));

    // Map Kit's timezone format to IANA format that Luxon understands
    const ianaTimezone = mapTimezoneToIANA(tz);
    console.log('  timezone (mapped to IANA):', ianaTimezone);

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
    const isDateOnly = !dateISO.includes('T');
    const isMidnightUTC = utcMoment.hour === 0 && utcMoment.minute === 0 && utcMoment.second === 0;

    let datePart;
    if (isDateOnly || isMidnightUTC) {
      // Plain date or midnight UTC — the UTC date IS the intended date
      datePart = utcMoment.toISODate();
    } else {
      // Non-midnight UTC — date picker sent midnight-in-local-time as UTC
      // Convert to target timezone to recover the intended date
      const dateInTargetTz = utcMoment.setZone(ianaTimezone);
      datePart = dateInTargetTz.toISODate();
    }

    console.log('🔍 TIMEZONE DEBUG - Date parsing:');
    console.log('  dateISO raw:', dateISO);
    console.log('  isDateOnly:', isDateOnly, '| isMidnightUTC:', isMidnightUTC);
    console.log('  utcMoment:', utcMoment.toString());
    console.log('  datePart (final):', datePart);
    console.log('  UTC date:', utcMoment.toISODate(), '| mode:', isDateOnly || isMidnightUTC ? 'direct' : 'tz-convert');

    // Construct a parseable 12-hour format string
    const fullStartString = `${datePart} ${start_time} ${start_ampm}`;
    const fullEndString = `${datePart} ${end_time} ${end_ampm}`;
    
    console.log('🔍 TIMEZONE DEBUG - String construction:');
    console.log('  fullStartString:', fullStartString);
    console.log('  fullEndString:', fullEndString);

    // Parse the strings into Luxon DateTime objects using the specified timezone
    const startDateTime = DateTime.fromFormat(fullStartString, 'yyyy-MM-dd h:mm a', { zone: ianaTimezone });
    const endDateTime = DateTime.fromFormat(fullEndString, 'yyyy-MM-dd h:mm a', { zone: ianaTimezone });
    
    console.log('🔍 TIMEZONE DEBUG - Luxon DateTime objects:');
    console.log('  startDateTime:', startDateTime.toString());
    console.log('  startDateTime (ISO):', startDateTime.toISO());
    console.log('  startDateTime (UTC):', startDateTime.toUTC().toString());
    console.log('  startDateTime.isValid:', startDateTime.isValid);
    console.log('  endDateTime:', endDateTime.toString());
    console.log('  endDateTime (ISO):', endDateTime.toISO());
    console.log('  endDateTime (UTC):', endDateTime.toUTC().toString());
    console.log('  endDateTime.isValid:', endDateTime.isValid);

    if (!startDateTime.isValid || !endDateTime.isValid) {
      const startReason = startDateTime.invalidReason || 'unknown';
      const endReason = endDateTime.invalidReason || 'unknown';
      throw new Error(`Invalid date/time. Start: ${startReason}, End: ${endReason}. Received: date='${dateISO}', start='${start_time} ${start_ampm}', end='${end_time} ${end_ampm}', tz='${tz}' (mapped to '${ianaTimezone}')`);
    }

    // Check for DST edge cases
    const startDSTCheck = checkDSTEdgeCases(startDateTime, ianaTimezone);
    const endDSTCheck = checkDSTEdgeCases(endDateTime, ianaTimezone);

    if (startDSTCheck.warning) {
      console.log(`🕐 DST WARNING (start): ${startDSTCheck.message}`);
    }
    if (endDSTCheck.warning) {
      console.log(`🕐 DST WARNING (end): ${endDSTCheck.message}`);
    }

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
        timezone: tz,
        hasLocation: !!location,
        eventType: inferEventType(title, description)
      });
    } catch (analyticsError) {
      console.error("Analytics tracking error:", analyticsError.message);
    }

    const formatDateForGoogle = (dt) => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
    // Outlook requires proper ISO 8601 with separators: 2025-01-28T18:00:00Z
    const formatDateForOutlook = (dt) => dt.toUTC().toISO({ suppressMilliseconds: true });

    console.log('🔍 TIMEZONE DEBUG - URL generation:');
    console.log('  Google start (UTC):', formatDateForGoogle(startDateTime));
    console.log('  Google end (UTC):', formatDateForGoogle(endDateTime));
    console.log('  Outlook start (ISO 8601):', formatDateForOutlook(startDateTime));
    console.log('  Outlook end (ISO 8601):', formatDateForOutlook(endDateTime));
    
    const googleUrl = new URL("https://calendar.google.com/calendar/render");
    googleUrl.searchParams.set("action", "TEMPLATE");
    googleUrl.searchParams.set("text", title);
    googleUrl.searchParams.set("details", description);
    googleUrl.searchParams.set("location", location);
    googleUrl.searchParams.set("dates", `${formatDateForGoogle(startDateTime)}/${formatDateForGoogle(endDateTime)}`);
    
    console.log('  Google Calendar URL:', googleUrl.toString());

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

    console.log('  Outlook URL:', outlookUrl.toString());
    console.log('  Office 365 URL:', office365Url.toString());
    console.log('  ICS URL:', icsUrl);
    console.log('🔍 TIMEZONE DEBUG - End of diagnostic logging');
    console.log('==========================================');

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

    console.log('🔍 ALIGNMENT DEBUG:');
    console.log('  alignment value:', alignment);
    console.log('  alignment type:', typeof alignment);
    console.log('  alignment is undefined?:', alignment === undefined);
    console.log('  alignment is empty string?:', alignment === '');
    console.log('  Raw alignment from settings:', settings.alignment);
    console.log('  getAlignmentStyles output:', getAlignmentStyles(alignment));

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

    const html = `
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="font-family: Helvetica, Arial, sans-serif;">
        <tr>
          <td align="${getTableAlign(alignment)}" style="padding: 0;">
            <table border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding: 0 5px;">
                  <a href="${googleUrl}" style="${buttonStyle}">Google</a>
                </td>
                <td style="padding: 0 5px;">
                  <a href="${icsUrl}" style="${buttonStyle}">Apple</a>
                </td>
                <td style="padding: 0 5px;">
                  <a href="${outlookUrl}" style="${buttonStyle}">Outlook</a>
                </td>
                <td style="padding: 0 5px;">
                  <a href="${office365Url}" style="${buttonStyle}">Office 365</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ code: 200, html: html });

  } catch (err) {
    console.error(err);
    res.setHeader("Content-Type", "application/json");
    // Return a 200 OK status with a JSON body that indicates the error, as per Kit docs.
    return res.status(200).json({ code: 500, errors: [err.message] });
  }
}
