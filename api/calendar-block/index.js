import { kv } from "@vercel/kv";
import { buildIcs } from "../../utils/buildIcs.js";
import { DateTime } from "luxon";

// Timezone mapping: Convert Kit's timezone format to IANA timezone identifiers
function mapTimezoneToIANA(kitTimezone) {
  // If it's already in IANA format, return as-is
  if (kitTimezone && kitTimezone.includes('/')) {
    return kitTimezone;
  }
  
  // Map common Kit timezone formats to IANA identifiers
  const timezoneMap = {
    'Pacific Time (GMT-08:00)': 'America/Los_Angeles',
    'Mountain Time (GMT-07:00)': 'America/Denver',
    'Central Time (GMT-06:00)': 'America/Chicago',
    'Eastern Time (GMT-05:00)': 'America/New_York',
    'Alaska Time (GMT-09:00)': 'America/Anchorage',
    'Hawaii Time (GMT-10:00)': 'Pacific/Honolulu',
    'GMT': 'UTC',
    'UTC': 'UTC',
    'London (GMT+00:00)': 'Europe/London',
    'Paris (GMT+01:00)': 'Europe/Paris',
    'Berlin (GMT+01:00)': 'Europe/Berlin',
    'Tokyo (GMT+09:00)': 'Asia/Tokyo',
    'Sydney (GMT+10:00)': 'Australia/Sydney',
    'Auckland (GMT+12:00)': 'Pacific/Auckland',
  };
  
  // Try exact match first
  if (timezoneMap[kitTimezone]) {
    return timezoneMap[kitTimezone];
  }
  
  // Try to extract timezone from format like "Pacific Time (GMT-08:00)"
  // and match against partial strings
  for (const [key, value] of Object.entries(timezoneMap)) {
    if (kitTimezone.includes(key.split(' ')[0])) {
      return value;
    }
  }
  
  // Default to UTC if we can't map it
  console.warn(`Unknown timezone format: ${kitTimezone}, defaulting to UTC`);
  return 'UTC';
}

// Usage tracking functions
async function trackUsage(data) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `usage:${today}`;
    
    // Get existing data or initialize
    const existing = await kv.get(key) || { count: 0, timezones: {}, eventTypes: {}, withLocation: 0 };
    
    // Update daily metrics
    existing.count++;
    existing.timezones[data.timezone] = (existing.timezones[data.timezone] || 0) + 1;
    existing.eventTypes[data.eventType] = (existing.eventTypes[data.eventType] || 0) + 1;
    if (data.hasLocation) existing.withLocation++;
    
    // Store daily data with 30-day expiration
    await kv.set(key, existing, { ex: 2592000 });
    
    // Update total events counter (no expiration)
    const totalKey = 'usage:total';
    const totalData = await kv.get(totalKey) || { 
      totalEvents: 0, 
      firstEvent: today,
      allTimeTimezones: {},
      allTimeEventTypes: {},
      allTimeWithLocation: 0
    };
    
    totalData.totalEvents++;
    totalData.allTimeTimezones[data.timezone] = (totalData.allTimeTimezones[data.timezone] || 0) + 1;
    totalData.allTimeEventTypes[data.eventType] = (totalData.allTimeEventTypes[data.eventType] || 0) + 1;
    if (data.hasLocation) totalData.allTimeWithLocation++;
    
    await kv.set(totalKey, totalData);
    
  } catch (error) {
    console.error('Usage tracking error:', error);
  }
}

function inferEventType(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('meeting') || text.includes('call') || text.includes('zoom')) return 'meeting';
  if (text.includes('appointment') || text.includes('doctor') || text.includes('dentist')) return 'appointment';
  if (text.includes('birthday') || text.includes('anniversary')) return 'personal';
  if (text.includes('deadline') || text.includes('due') || text.includes('submit')) return 'deadline';
  if (text.includes('event') || text.includes('conference') || text.includes('workshop')) return 'event';
  return 'other';
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

    // The date picker returns a full ISO string. Parse it in the target timezone to get the correct date.
    // This handles cases where the user's system timezone differs from the event timezone.
    const datePart = DateTime.fromISO(dateISO, { zone: ianaTimezone }).toISODate();
    
    console.log('🔍 TIMEZONE DEBUG - Date parsing:');
    console.log('  datePart (parsed in target TZ):', datePart);
    console.log('  Original dateISO parsed as UTC:', DateTime.fromISO(dateISO, { zone: 'utc' }).toString());
    console.log('  Original dateISO parsed in target TZ:', DateTime.fromISO(dateISO, { zone: tz }).toString());
    console.log('  Comparison - UTC date:', DateTime.fromISO(dateISO, { zone: 'utc' }).toISODate(), 'vs Target TZ date:', datePart);

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
      throw new Error(`Invalid date/time. Received: date='${dateISO}', start='${start_time} ${start_ampm}', end='${end_time} ${end_ampm}', tz='${tz}' (mapped to '${ianaTimezone}')`);
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
      await trackUsage({
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
    
    console.log('🔍 TIMEZONE DEBUG - URL generation:');
    console.log('  Google start (UTC):', formatDateForGoogle(startDateTime));
    console.log('  Google end (UTC):', formatDateForGoogle(endDateTime));
    
    const googleUrl = new URL("https://calendar.google.com/calendar/render");
    googleUrl.searchParams.set("action", "TEMPLATE");
    googleUrl.searchParams.set("text", title);
    googleUrl.searchParams.set("details", description);
    googleUrl.searchParams.set("location", location);
    googleUrl.searchParams.set("dates", `${formatDateForGoogle(startDateTime)}/${formatDateForGoogle(endDateTime)}`);
    
    console.log('  Google Calendar URL:', googleUrl.toString());

    const outlookUrl = new URL("https://outlook.live.com/owa/");
    outlookUrl.searchParams.set("path", "/calendar/action/compose");
    outlookUrl.searchParams.set("rru", "addevent");
    outlookUrl.searchParams.set("subject", title);
    outlookUrl.searchParams.set("body", description);
    outlookUrl.searchParams.set("location", location || "");
    outlookUrl.searchParams.set("startdt", formatDateForGoogle(startDateTime));
    outlookUrl.searchParams.set("enddt", formatDateForGoogle(endDateTime));
    
    console.log('  Outlook URL:', outlookUrl.toString());
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
                  <a href="${icsUrl}" download="invite.ics" style="${buttonStyle}">Apple</a>
                </td>
                <td style="padding: 0 5px;">
                  <a href="${outlookUrl}" style="${buttonStyle}">Outlook</a>
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
