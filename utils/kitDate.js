// utils/kitDate.js
// Shared Kit→IANA timezone resolution + Kit date-recovery logic.
//
// This is the SINGLE SOURCE OF TRUTH for parsing Kit's calendar-block date/timezone
// input. Both the production endpoint (api/calendar-block/index.js) and the regression
// suite (api/test-calendars/index.js) import from here, so the test always exercises
// the real code. (Before this module existed, the test kept a hand-copied SUBSET of the
// map that omitted all of Europe — which is why the Helsinki→London bug had zero
// coverage. Never reintroduce a copy; change the logic here.)
//
// See docs/KIT-DATE-SPEC.md and memory/learnings.md for the full bug history.

import { DateTime } from "luxon";

// Complete timezone mapping based on Rails ActiveSupport::TimeZone.
// Kit is a Rails app, so its timezone picker uses these exact names.
// Source: https://api.rubyonrails.org/classes/ActiveSupport/TimeZone.html
//
// Format: Kit may send just the name ("Abu Dhabi"), with an offset suffix
// ("Abu Dhabi (GMT+04:00)"), or a combined Windows-style label
// ("London, Dublin (GMT+00:00)"). resolveTimezone() handles all three.
export const TIMEZONE_MAP = {
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

/**
 * Resolve a Kit/Rails timezone string to an IANA zone, with metadata describing HOW
 * it resolved.
 *
 * `matched: false` means we could not resolve the NAME and fell back to a fixed GMT
 * offset (no DST) or UTC — those are the cases that need a new TIMEZONE_MAP entry, and
 * the caller should surface them to the unmapped-tz watchdog.
 *
 * @param {string} kitTimezone
 * @returns {{ iana: string, matched: boolean, method: string }}
 */
export function resolveTimezone(kitTimezone) {
  if (!kitTimezone) {
    console.warn('⚠️ TIMEZONE MISSING: No timezone provided, defaulting to UTC');
    return { iana: 'UTC', matched: false, method: 'missing' };
  }

  // Step 1: already in IANA format (contains '/') — validate and return.
  if (kitTimezone.includes('/')) {
    const testDt = DateTime.now().setZone(kitTimezone);
    if (testDt.isValid) return { iana: kitTimezone, matched: true, method: 'iana' };
    console.warn(`Invalid IANA timezone: ${kitTimezone}, defaulting to UTC`);
    return { iana: 'UTC', matched: false, method: 'invalid-iana' };
  }

  // Step 2: exact match (e.g. "Abu Dhabi", "Pacific Time (US & Canada)").
  if (TIMEZONE_MAP[kitTimezone]) {
    return { iana: TIMEZONE_MAP[kitTimezone], matched: true, method: 'exact' };
  }

  // Step 3: case-insensitive exact match.
  const lowerInput = kitTimezone.toLowerCase().trim();
  for (const [key, value] of Object.entries(TIMEZONE_MAP)) {
    if (key.toLowerCase() === lowerInput) return { iana: value, matched: true, method: 'case-insensitive' };
  }

  // Step 4: strip a GMT offset suffix/prefix and try the name part.
  // Handles "Abu Dhabi (GMT+04:00)" and "(GMT+04:00) Abu Dhabi".
  const nameWithoutOffset = kitTimezone
    .replace(/\s*\(GMT[+-]?\d{2}:\d{2}\)\s*/g, '')
    .replace(/\s*GMT[+-]?\d{2}:\d{2}\s*/g, '')
    .trim();
  if (nameWithoutOffset && nameWithoutOffset !== kitTimezone) {
    if (TIMEZONE_MAP[nameWithoutOffset]) return { iana: TIMEZONE_MAP[nameWithoutOffset], matched: true, method: 'offset-strip' };
    const lowerName = nameWithoutOffset.toLowerCase();
    for (const [key, value] of Object.entries(TIMEZONE_MAP)) {
      if (key.toLowerCase() === lowerName) return { iana: value, matched: true, method: 'offset-strip' };
    }
  }

  // Step 5: combined / Windows-style label, e.g. "London, Dublin (GMT+00:00)" or
  // "(GMT+00:00) Dublin, Edinburgh, Lisbon, London". These group SAME-offset cities,
  // so the first city we recognize is a correct, DST-aware match. No bare Rails name
  // contains a comma, so splitting here can't shadow a legitimate single key.
  const candidate = nameWithoutOffset || kitTimezone;
  if (candidate.includes(',')) {
    for (const part of candidate.split(',')) {
      const city = part.trim();
      if (!city) continue;
      if (TIMEZONE_MAP[city]) return { iana: TIMEZONE_MAP[city], matched: true, method: 'combined-label' };
      const lc = city.toLowerCase();
      for (const [key, value] of Object.entries(TIMEZONE_MAP)) {
        if (key.toLowerCase() === lc) return { iana: value, matched: true, method: 'combined-label' };
      }
    }
  }

  // Step 6: LAST RESORT — extract a GMT offset and use a fixed-offset zone.
  // Better than UTC because it preserves the offset, but it has NO DST, so event
  // TIMES are 1 hour off during summer for DST zones. matched:false → watchdog.
  const offsetMatch = kitTimezone.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (offsetMatch) {
    const sign = offsetMatch[1];
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = parseInt(offsetMatch[3], 10);
    const fixedOffset = `UTC${sign}${hours}${minutes > 0 ? ':' + String(minutes).padStart(2, '0') : ''}`;
    const testDt = DateTime.now().setZone(fixedOffset);
    if (testDt.isValid) {
      console.warn(`⚠️ TIMEZONE NAME NOT FOUND: "${kitTimezone}" - using extracted offset ${fixedOffset}. Add this timezone name to TIMEZONE_MAP!`);
      return { iana: fixedOffset, matched: false, method: 'fixed-offset' };
    }
  }

  // Step 7: true fallback — log loudly so we can fix the map.
  console.error(`🚨 TIMEZONE NOT FOUND: "${kitTimezone}" - defaulting to UTC. THIS WILL CAUSE DATE ERRORS FOR USERS AHEAD OF UTC. Add this timezone to TIMEZONE_MAP immediately!`);
  return { iana: 'UTC', matched: false, method: 'utc-fallback' };
}

/**
 * Convenience wrapper — returns just the IANA string.
 * @param {string} kitTimezone
 * @returns {string}
 */
export function mapTimezoneToIANA(kitTimezone) {
  return resolveTimezone(kitTimezone).iana;
}

/**
 * Recover the wall-clock date the creator CLICKED from Kit's encoded `date` value.
 *
 * Kit encodes the picked date as midnight in the creator's BROWSER timezone, expressed
 * as UTC. Three observed modes:
 *   - Mode B  — plain date ("2026-03-18") or exact midnight UTC ("...T00:00:00.000Z").
 *               The UTC date IS the intended date.
 *   - Mode A/C — non-midnight UTC (midnight-in-browser-tz encoded as UTC). We recover
 *               the clicked date by rounding the UTC instant to the NEAREST midnight:
 *               UTC hour >= 12 ⇒ browser is east of UTC ⇒ clicked date is the next UTC
 *               day; hour < 12 ⇒ same UTC day. This infers the browser offset from the
 *               time-of-day and is INDEPENDENT of the event timezone — which fixes the
 *               whole "browser east of event tz" class (Helsinki browser + London event:
 *               2026-07-13T21:00Z → July 14, not July 13).
 *
 * Guard: when the browser tz EQUALS the event tz at an extreme east offset (> +12, e.g.
 * New Zealand in summer) the event-tz date is the reliable one, so we take the LATER of
 * the nearest-midnight estimate and the event-tz date. (Known limitation: a browser at
 * offset > +12 scheduling an event in a zone WEST of the browser is unrecoverable from
 * (UTC timestamp, event tz) alone — see memory/learnings.md.)
 *
 * @param {string} dateISO       Kit's raw `date` value.
 * @param {string} ianaTimezone  The event's IANA timezone.
 * @returns {{ date: string, mode: string }} ISO date (yyyy-MM-dd) + detected mode.
 */
export function recoverClickedDate(dateISO, ianaTimezone) {
  const utcMoment = DateTime.fromISO(dateISO, { zone: 'utc' });
  const isDateOnly = !dateISO.includes('T');
  // Mode B detection: UTC time is exactly midnight (00:00:00). Kit sends .000Z exactly,
  // so sub-second jitter is not a concern in practice.
  const isMidnightUTC = utcMoment.hour === 0 && utcMoment.minute === 0 && utcMoment.second === 0;

  if (isDateOnly || isMidnightUTC) {
    return { date: utcMoment.toISODate(), mode: isDateOnly ? 'date-only' : 'midnight-utc' };
  }

  const nearestMidnight = (utcMoment.hour >= 12 ? utcMoment.plus({ days: 1 }) : utcMoment).toISODate();
  const tzDate = utcMoment.setZone(ianaTimezone).toISODate();
  return {
    date: tzDate > nearestMidnight ? tzDate : nearestMidnight,
    mode: 'midnight-local-as-utc',
  };
}
