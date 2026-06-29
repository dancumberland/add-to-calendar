import { trackDailyUsage } from "../../utils/analytics.js";
import { DateTime } from "luxon";
import { resolveTimezone, recoverClickedDate } from "../../utils/kitDate.js";

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

// Timezone resolution (TIMEZONE_MAP + resolveTimezone) and the Kit date-recovery logic
// now live in utils/kitDate.js — the single source of truth shared with the test suite.
// See docs/KIT-DATE-SPEC.md and memory/learnings.md for the bug history.

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

    let startDateTime, endDateTime, ianaTimezone, detectedMode, tzMethod;

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

      // Map Kit's timezone format to IANA, and surface unmapped names to the watchdog.
      const tzResolution = resolveTimezone(tz);
      ianaTimezone = tzResolution.iana;
      tzMethod = tzResolution.method;
      if (!tzResolution.matched) {
        // Unmapped timezone NAME → fixed-offset/UTC fallback. The date is still recovered
        // correctly, but the event TIME may be 1h off in summer (fixed offset = no DST).
        // Track it so we can add the name to utils/kitDate.js before more creators hit it.
        corpusLog({
          event: 'kit_timezone_unmapped',
          timestamp: new Date().toISOString(),
          raw_tz: tz,
          resolved_iana: tzResolution.iana,
          method: tzResolution.method,
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
                  text: `⚠️ *Kit Calendar — Unmapped timezone*\nKit sent \`${tz}\`, which isn't in TIMEZONE_MAP; fell back to \`${tzResolution.iana}\` (${tzResolution.method}). Event times may be 1h off in summer. Add it to utils/kitDate.js.`,
                },
              }],
            }),
          }).catch(e => console.error('Unmapped-tz alert failed:', e.message));
        }
      }
      debug('V1 INPUT:', { dateISO, start_time, start_ampm, end_time, end_ampm, tz, ianaTimezone, tzMethod, alignment });

      // Recover the wall-clock date the creator clicked. The Mode A/B/C handling and the
      // "browser east of event tz" fix live in utils/kitDate.js (single source of truth).
      const { date: datePart, mode: dateMode } = recoverClickedDate(dateISO, ianaTimezone);
      detectedMode = dateMode;

      debug('V1 DATE PARSE:', { dateMode, datePart });

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
      corpusEntry.detected_mode = detectedMode;
      corpusEntry.timezone_raw = tz;
      corpusEntry.timezone_method = tzMethod;
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
