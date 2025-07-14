// utils/buildIcs.js
// Very small helper to create an .ics calendar file string (RFC 5545).
// Only supports a basic single-event use-case which is enough for our Add-to-Calendar buttons.

import { v4 as uuidv4 } from 'uuid';
import { DateTime } from 'luxon';

/**
 * Build a UTC timestamp (YYYYMMDDTHHmmssZ) from a Luxon DateTime.
 */
function formatUtc(dt) {
  return dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

/**
 * Returns raw .ics text.
 * @param {Object} params
 * @param {string} params.title
 * @param {string} params.description
 * @param {string} params.location
 * @param {Date} params.start
 * @param {Date} params.end
 */
export function buildIcs({ title, description = '', location = '', start, end }) {
  const uid = uuidv4();
  const dtstamp = formatUtc(DateTime.utc());
  const dtStart = formatUtc(DateTime.fromJSDate(start));
  const dtEnd = formatUtc(DateTime.fromJSDate(end));

  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Kit AddToCalendar//EN\nBEGIN:VEVENT\nUID:${uid}\nDTSTAMP:${dtstamp}\nDTSTART:${dtStart}\nDTEND:${dtEnd}\nSUMMARY:${title}\nDESCRIPTION:${description}\nLOCATION:${location}\nEND:VEVENT\nEND:VCALENDAR`;
}
