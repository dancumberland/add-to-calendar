import { kv } from "@vercel/kv";
import { buildIcs } from "../../utils/buildIcs.js";
import { DateTime } from "luxon";

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

    // The date picker returns a full ISO string in UTC. We just need the date part.
    const datePart = DateTime.fromISO(dateISO, { zone: 'utc' }).toISODate();

    // Construct a parseable 12-hour format string
    const fullStartString = `${datePart} ${start_time} ${start_ampm}`;
    const fullEndString = `${datePart} ${end_time} ${end_ampm}`;

    // Parse the strings into Luxon DateTime objects using the specified timezone
    const startDateTime = DateTime.fromFormat(fullStartString, 'yyyy-MM-dd hh:mm a', { zone: tz });
    const endDateTime = DateTime.fromFormat(fullEndString, 'yyyy-MM-dd hh:mm a', { zone: tz });

    if (!startDateTime.isValid || !endDateTime.isValid) {
      throw new Error(`Invalid date/time. Received: date='${dateISO}', start='${start_time} ${start_ampm}', end='${end_time} ${end_ampm}', tz='${tz}'`);
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
    const googleUrl = new URL("https://calendar.google.com/calendar/render");
    googleUrl.searchParams.set("action", "TEMPLATE");
    googleUrl.searchParams.set("text", title);
    googleUrl.searchParams.set("details", description);
    googleUrl.searchParams.set("location", location);
    googleUrl.searchParams.set("dates", `${formatDateForGoogle(startDateTime)}/${formatDateForGoogle(endDateTime)}`);

    const outlookUrl = new URL("https://outlook.live.com/owa/");
    outlookUrl.searchParams.set("path", "/calendar/action/compose");
    outlookUrl.searchParams.set("rru", "addevent");
    outlookUrl.searchParams.set("subject", title);
    outlookUrl.searchParams.set("body", description);
    outlookUrl.searchParams.set("location", location || "");
    outlookUrl.searchParams.set("startdt", formatDateForGoogle(startDateTime));
    outlookUrl.searchParams.set("enddt", formatDateForGoogle(endDateTime));

    // --- Button Styling ---
    const sizeMap = {
      small: { padding: "4px 8px", fontSize: "12px" },
      medium: { padding: "8px 12px", fontSize: "14px" },
      large: { padding: "12px 16px", fontSize: "16px" },
    };

    // Use email-compatible alignment methods instead of flexbox
    const getAlignmentStyles = (align) => {
      switch (align) {
        case 'left':
          return `text-align: left; display: block;`;
        case 'right':
          return `text-align: right; display: block;`;
        case 'center':
        default:
          return `text-align: center; display: block;`;
      }
    };

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

    const html = `
      <div style="${containerStyle}">
        <a href="${googleUrl}" style="${buttonStyle}">Google</a>
        <a href="${icsUrl}" download="invite.ics" style="${buttonStyle}">Apple</a>
        <a href="${outlookUrl}" style="${buttonStyle}">Outlook</a>
      </div>
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
