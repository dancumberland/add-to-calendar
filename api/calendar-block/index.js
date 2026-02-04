import { kv } from "@vercel/kv";
import { buildIcs } from "../../utils/buildIcs.js";
import { trackDailyUsage } from "../../utils/analytics.js";
import { DateTime } from "luxon";

// Comprehensive timezone mapping covering 99%+ of global users
// Based on population data and common "gotcha" zones that cause support tickets
// See: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
const TIMEZONE_MAP = {
  // ============ AMERICAS (14 zones) ============
  'Pacific Time (GMT-08:00)': 'America/Los_Angeles',
  'Los Angeles (GMT-08:00)': 'America/Los_Angeles',
  'Mountain Time (GMT-07:00)': 'America/Denver',
  'Denver (GMT-07:00)': 'America/Denver',
  'Phoenix (GMT-07:00)': 'America/Phoenix',  // Arizona - NO DST!
  'Central Time (GMT-06:00)': 'America/Chicago',
  'Chicago (GMT-06:00)': 'America/Chicago',
  'Mexico City (GMT-06:00)': 'America/Mexico_City',
  'Eastern Time (GMT-05:00)': 'America/New_York',
  'New York (GMT-05:00)': 'America/New_York',
  'Toronto (GMT-05:00)': 'America/Toronto',
  'Lima (GMT-05:00)': 'America/Lima',
  'Bogota (GMT-05:00)': 'America/Bogota',
  'Alaska Time (GMT-09:00)': 'America/Anchorage',
  'Anchorage (GMT-09:00)': 'America/Anchorage',
  'Hawaii Time (GMT-10:00)': 'Pacific/Honolulu',
  'Honolulu (GMT-10:00)': 'Pacific/Honolulu',
  'Sao Paulo (GMT-03:00)': 'America/Sao_Paulo',
  'Buenos Aires (GMT-03:00)': 'America/Argentina/Buenos_Aires',
  'Santiago (GMT-04:00)': 'America/Santiago',
  'Caracas (GMT-04:00)': 'America/Caracas',
  // Half-hour offset - Newfoundland
  'St Johns (GMT-03:30)': 'America/St_Johns',
  'Newfoundland (GMT-03:30)': 'America/St_Johns',

  // ============ EUROPE (12 zones) ============
  'GMT': 'UTC',
  'UTC': 'UTC',
  'London (GMT+00:00)': 'Europe/London',
  'Dublin (GMT+00:00)': 'Europe/Dublin',
  'Lisbon (GMT+00:00)': 'Europe/Lisbon',
  'Paris (GMT+01:00)': 'Europe/Paris',
  'Berlin (GMT+01:00)': 'Europe/Berlin',
  'Amsterdam (GMT+01:00)': 'Europe/Amsterdam',
  'Rome (GMT+01:00)': 'Europe/Rome',
  'Madrid (GMT+01:00)': 'Europe/Madrid',
  'Stockholm (GMT+01:00)': 'Europe/Stockholm',
  'Warsaw (GMT+01:00)': 'Europe/Warsaw',
  'Athens (GMT+02:00)': 'Europe/Athens',
  'Helsinki (GMT+02:00)': 'Europe/Helsinki',
  'Istanbul (GMT+03:00)': 'Europe/Istanbul',  // Turkey - no DST since 2016
  'Moscow (GMT+03:00)': 'Europe/Moscow',

  // ============ AFRICA (5 zones) ============
  'Cairo (GMT+02:00)': 'Africa/Cairo',
  'Johannesburg (GMT+02:00)': 'Africa/Johannesburg',
  'Lagos (GMT+01:00)': 'Africa/Lagos',
  'Nairobi (GMT+03:00)': 'Africa/Nairobi',
  'Casablanca (GMT+01:00)': 'Africa/Casablanca',

  // ============ MIDDLE EAST (5 zones) ============
  'Dubai (GMT+04:00)': 'Asia/Dubai',
  'Riyadh (GMT+03:00)': 'Asia/Riyadh',
  'Tel Aviv (GMT+02:00)': 'Asia/Tel_Aviv',
  'Jerusalem (GMT+02:00)': 'Asia/Jerusalem',
  // Half-hour offset - Iran
  'Tehran (GMT+03:30)': 'Asia/Tehran',

  // ============ ASIA (14 zones) ============
  // Half-hour offset - Afghanistan
  'Kabul (GMT+04:30)': 'Asia/Kabul',
  'Karachi (GMT+05:00)': 'Asia/Karachi',
  // Half-hour offset - India (1.47 BILLION people!)
  'Mumbai (GMT+05:30)': 'Asia/Kolkata',
  'Delhi (GMT+05:30)': 'Asia/Kolkata',
  'Kolkata (GMT+05:30)': 'Asia/Kolkata',
  'India (GMT+05:30)': 'Asia/Kolkata',
  'Colombo (GMT+05:30)': 'Asia/Colombo',
  // 45-minute offset - Nepal
  'Kathmandu (GMT+05:45)': 'Asia/Kathmandu',
  'Nepal (GMT+05:45)': 'Asia/Kathmandu',
  'Dhaka (GMT+06:00)': 'Asia/Dhaka',
  // Half-hour offset - Myanmar
  'Yangon (GMT+06:30)': 'Asia/Yangon',
  'Bangkok (GMT+07:00)': 'Asia/Bangkok',
  'Ho Chi Minh (GMT+07:00)': 'Asia/Ho_Chi_Minh',
  'Jakarta (GMT+07:00)': 'Asia/Jakarta',
  'Singapore (GMT+08:00)': 'Asia/Singapore',
  'Hong Kong (GMT+08:00)': 'Asia/Hong_Kong',
  'Shanghai (GMT+08:00)': 'Asia/Shanghai',
  'Beijing (GMT+08:00)': 'Asia/Shanghai',
  'Taipei (GMT+08:00)': 'Asia/Taipei',
  'Manila (GMT+08:00)': 'Asia/Manila',
  'Perth (GMT+08:00)': 'Australia/Perth',
  'Seoul (GMT+09:00)': 'Asia/Seoul',
  'Tokyo (GMT+09:00)': 'Asia/Tokyo',

  // ============ AUSTRALIA & OCEANIA (8 zones) ============
  // Half-hour offset - Northern Territory (NO DST)
  'Darwin (GMT+09:30)': 'Australia/Darwin',
  // Half-hour offset - South Australia (HAS DST)
  'Adelaide (GMT+09:30)': 'Australia/Adelaide',
  // Queensland - NO DST! (Common complaint: users pick Sydney but are in Brisbane)
  'Brisbane (GMT+10:00)': 'Australia/Brisbane',
  'Queensland (GMT+10:00)': 'Australia/Brisbane',
  // New South Wales, Victoria, Tasmania - HAS DST
  'Sydney (GMT+10:00)': 'Australia/Sydney',
  'Melbourne (GMT+10:00)': 'Australia/Melbourne',
  'Hobart (GMT+10:00)': 'Australia/Hobart',
  // New Zealand
  'Auckland (GMT+12:00)': 'Pacific/Auckland',
  'Wellington (GMT+12:00)': 'Pacific/Auckland',
  'Fiji (GMT+12:00)': 'Pacific/Fiji',
  // 45-minute offset - Chatham Islands (rare but exists)
  'Chatham (GMT+12:45)': 'Pacific/Chatham',
};

function mapTimezoneToIANA(kitTimezone) {
  // If it's already in IANA format (contains '/'), validate and return
  if (kitTimezone && kitTimezone.includes('/')) {
    // Validate it's a real IANA timezone by attempting to use it
    const testDt = DateTime.now().setZone(kitTimezone);
    if (testDt.isValid) {
      return kitTimezone;
    }
    console.warn(`Invalid IANA timezone: ${kitTimezone}, defaulting to UTC`);
    return 'UTC';
  }

  // Try exact match first
  if (TIMEZONE_MAP[kitTimezone]) {
    return TIMEZONE_MAP[kitTimezone];
  }

  // Try case-insensitive match
  const lowerInput = kitTimezone?.toLowerCase() || '';
  for (const [key, value] of Object.entries(TIMEZONE_MAP)) {
    if (key.toLowerCase() === lowerInput) {
      return value;
    }
  }

  // Try partial match (e.g., "Pacific" matches "Pacific Time (GMT-08:00)")
  for (const [key, value] of Object.entries(TIMEZONE_MAP)) {
    const keyStart = key.split(' ')[0].toLowerCase();
    if (lowerInput.includes(keyStart) || keyStart.includes(lowerInput)) {
      return value;
    }
  }

  // Default to UTC with clear warning
  console.warn(`⚠️ TIMEZONE NOT FOUND: "${kitTimezone}" - defaulting to UTC. Consider adding this timezone to TIMEZONE_MAP.`);
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

    // The date picker returns a full ISO string representing midnight in the USER'S BROWSER timezone.
    // For example, a Brisbane user (GMT+10) selecting Feb 5 gets: "2026-02-04T14:00:00.000Z"
    // (Feb 5 00:00 Brisbane = Feb 4 14:00 UTC)
    //
    // To get the correct date, we parse the ISO as UTC, convert to the TARGET timezone,
    // and extract the date from that. This works for both eastern (ahead of UTC) and
    // western (behind UTC) timezones because we're interpreting the moment in context.
    const utcMoment = DateTime.fromISO(dateISO, { zone: 'utc' });
    const dateInTargetTz = utcMoment.setZone(ianaTimezone);
    const datePart = dateInTargetTz.toISODate();
    
    console.log('🔍 TIMEZONE DEBUG - Date parsing:');
    console.log('  utcMoment:', utcMoment.toString());
    console.log('  dateInTargetTz:', dateInTargetTz.toString());
    console.log('  datePart (extracted from target TZ):', datePart);
    console.log('  Comparison - UTC date:', utcMoment.toISODate(), 'vs Target TZ date:', datePart);

    // Construct a parseable 12-hour format string
    const fullStartString = `${datePart} ${start_time} ${start_ampm}`;
    const fullEndString = `${datePart} ${end_time} ${end_ampm}`;
    
    console.log('🔍 TIMEZONE DEBUG - String construction:');
    console.log('  fullStartString:', fullStartString);
    console.log('  fullEndString:', fullEndString);

    // Parse the strings into Luxon DateTime objects using the specified timezone
    const startDateTime = DateTime.fromFormat(fullStartString, 'yyyy-MM-dd hh:mm a', { zone: ianaTimezone });
    const endDateTime = DateTime.fromFormat(fullEndString, 'yyyy-MM-dd hh:mm a', { zone: ianaTimezone });
    
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

    const icsText = buildIcs({
      title,
      description,
      location,
      start: startDateTime.toJSDate(),
      end: endDateTime.toJSDate(),
    });

    let icsUrl = "#"; // Default to a safe link
    try {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      // Store in Vercel KV with a 24-hour expiration (86400 seconds)
      await kv.set(id, icsText, { ex: 86400 });
      const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
      icsUrl = `${baseUrl}/api/ics/${id}`;
      
      // Track usage metrics
      await trackDailyUsage({
        timestamp: new Date().toISOString(),
        timezone: tz,
        hasLocation: !!location,
        eventType: inferEventType(title, description)
      });
      
    } catch (kvError) {
      console.error("Vercel KV Error:", kvError.message);
      // If KV fails, the Apple link will be a dead link, but the block won't crash.
      // This is better than the whole plugin failing.
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
