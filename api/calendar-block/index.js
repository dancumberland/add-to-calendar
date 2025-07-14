// Temporary in-memory cache for generated ICS text
const ICS_STORE = globalThis.ICS_STORE || (globalThis.ICS_STORE = new Map());

import { buildIcs } from "../../utils/buildIcs.js";
import { DateTime } from "luxon";

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

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    ICS_STORE.set(id, icsText);

    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const icsUrl = `${baseUrl}/api/ics/${id}`;

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
    outlookUrl.searchParams.set("location", location);
    outlookUrl.searchParams.set("startdt", startDateTime.toISO());
    outlookUrl.searchParams.set("enddt", endDateTime.toISO());

    // --- Button Styling ---
    const sizeMap = {
      small: { padding: "4px 8px", fontSize: "12px" },
      medium: { padding: "8px 12px", fontSize: "14px" },
      large: { padding: "12px 16px", fontSize: "16px" },
    };

    const containerStyle = `
      display: flex;
      justify-content: ${alignment};
      font-family: Helvetica, Arial, sans-serif;
    `;

    const buttonStyle = `
      padding: ${sizeMap[size]?.padding || sizeMap.medium.padding};
      background: ${background_color};
      color: ${text_color};
      border-radius: ${rounded_corners};
      text-decoration: none;
      font-size: ${sizeMap[size]?.fontSize || sizeMap.medium.fontSize};
      text-align: center;
      margin: 0 10px; /* Creates 20px space between buttons */
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
