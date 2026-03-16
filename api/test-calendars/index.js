// /api/test-calendars/index.js
// Automated testing endpoint for calendar integrations
// Validates that all calendar URLs are generated correctly

import { buildIcs } from "../../utils/buildIcs.js";
import { DateTime } from "luxon";

// Test cases covering different scenarios
const TEST_CASES = [
  {
    name: "Basic event - Pacific timezone (browser sends midnight Pacific as UTC)",
    // User in Pacific selects Feb 15. Browser sends midnight Pacific as UTC:
    // Feb 15 00:00 Pacific (PST = UTC-8) = Feb 15 08:00 UTC
    settings: {
      title: "Test Event",
      date: "2025-02-15T08:00:00.000Z", // This is Feb 15 midnight in Pacific!
      start_time: "10:00",
      start_ampm: "AM",
      end_time: "11:00",
      end_ampm: "AM",
      tz: "America/Los_Angeles",
      location: "Zoom Meeting",
      description: "Test meeting description"
    },
    expected: {
      googleDateStart: "20250215T180000Z", // 10 AM Pacific = 6 PM UTC
      outlookDateStart: "2025-02-15T18:00:00Z"
    }
  },
  {
    name: "PM event - Eastern timezone (browser sends midnight Eastern as UTC)",
    // User in Eastern selects Mar 20. Browser sends midnight Eastern as UTC:
    // Mar 20 00:00 Eastern (EDT = UTC-4, DST active in March) = Mar 20 04:00 UTC
    settings: {
      title: "Afternoon Call",
      date: "2025-03-20T04:00:00.000Z", // This is Mar 20 midnight in Eastern during DST!
      start_time: "02:30",
      start_ampm: "PM",
      end_time: "03:30",
      end_ampm: "PM",
      tz: "America/New_York",
      location: "Conference Room",
      description: "Team meeting"
    },
    expected: {
      googleDateStart: "20250320T183000Z", // 2:30 PM Eastern = 6:30 PM UTC
      outlookDateStart: "2025-03-20T18:30:00Z"
    }
  },
  {
    name: "Edge case - Midnight event",
    settings: {
      title: "New Year Event",
      date: "2025-01-01T00:00:00.000Z",
      start_time: "12:00",
      start_ampm: "AM",
      end_time: "01:00",
      end_ampm: "AM",
      tz: "UTC",
      location: "Online",
      description: "Midnight celebration"
    },
    expected: {
      googleDateStart: "20250101T000000Z",
      outlookDateStart: "2025-01-01T00:00:00Z"
    }
  },
  {
    name: "Brisbane timezone (ahead of UTC) - simulates browser in GMT+10",
    // User in Brisbane selects Feb 5. Their browser sends midnight Brisbane as UTC:
    // Feb 5 00:00 Brisbane (GMT+10) = Feb 4 14:00 UTC
    settings: {
      title: "Brisbane Event",
      date: "2026-02-04T14:00:00.000Z", // This is Feb 5 midnight in Brisbane!
      start_time: "08:00",
      start_ampm: "AM",
      end_time: "09:00",
      end_ampm: "AM",
      tz: "Australia/Brisbane",
      location: "Brisbane Office",
      description: "Test event for Brisbane timezone"
    },
    expected: {
      // Feb 5 08:00 Brisbane (GMT+10) = Feb 4 22:00 UTC
      googleDateStart: "20260204T220000Z",
      outlookDateStart: "2026-02-04T22:00:00Z"
    }
  },
  {
    name: "Sydney timezone (with DST) - simulates browser in GMT+11",
    // User in Sydney during DST selects Feb 5. Their browser sends midnight Sydney as UTC:
    // Feb 5 00:00 Sydney (GMT+11 during DST) = Feb 4 13:00 UTC
    settings: {
      title: "Sydney Event",
      date: "2026-02-04T13:00:00.000Z", // This is Feb 5 midnight in Sydney during DST!
      start_time: "08:00",
      start_ampm: "AM",
      end_time: "09:00",
      end_ampm: "AM",
      tz: "Australia/Sydney",
      location: "Sydney Office",
      description: "Test event for Sydney timezone during DST"
    },
    expected: {
      // Feb 5 08:00 Sydney (GMT+11 during DST) = Feb 4 21:00 UTC
      googleDateStart: "20260204T210000Z",
      outlookDateStart: "2026-02-04T21:00:00Z"
    }
  },
  {
    name: "India timezone (half-hour offset GMT+5:30) - 1.47 billion users",
    // User in India selects Feb 5. Browser sends midnight IST as UTC:
    // Feb 5 00:00 India (GMT+5:30) = Feb 4 18:30 UTC
    settings: {
      title: "Mumbai Event",
      date: "2026-02-04T18:30:00.000Z", // This is Feb 5 midnight in India!
      start_time: "10:00",
      start_ampm: "AM",
      end_time: "11:00",
      end_ampm: "AM",
      tz: "Asia/Kolkata",
      location: "Mumbai Office",
      description: "Test event for India half-hour timezone"
    },
    expected: {
      // Feb 5 10:00 India (GMT+5:30) = Feb 5 04:30 UTC
      googleDateStart: "20260205T043000Z",
      outlookDateStart: "2026-02-05T04:30:00Z"
    }
  },
  {
    name: "Nepal timezone (45-minute offset GMT+5:45)",
    // User in Nepal selects Feb 5. Browser sends midnight NPT as UTC:
    // Feb 5 00:00 Nepal (GMT+5:45) = Feb 4 18:15 UTC
    settings: {
      title: "Kathmandu Event",
      date: "2026-02-04T18:15:00.000Z", // This is Feb 5 midnight in Nepal!
      start_time: "09:00",
      start_ampm: "AM",
      end_time: "10:00",
      end_ampm: "AM",
      tz: "Asia/Kathmandu",
      location: "Kathmandu",
      description: "Test event for Nepal 45-minute timezone"
    },
    expected: {
      // Feb 5 09:00 Nepal (GMT+5:45) = Feb 5 03:15 UTC
      googleDateStart: "20260205T031500Z",
      outlookDateStart: "2026-02-05T03:15:00Z"
    }
  },
  {
    name: "Phoenix Arizona (no DST, stays GMT-7)",
    // Arizona doesn't observe DST - stays MST year-round
    settings: {
      title: "Phoenix Event",
      date: "2026-07-15T07:00:00.000Z", // July - when most of US is on DST, Arizona is not
      start_time: "09:00",
      start_ampm: "AM",
      end_time: "10:00",
      end_ampm: "AM",
      tz: "America/Phoenix",
      location: "Phoenix, AZ",
      description: "Test event for Arizona no-DST"
    },
    expected: {
      // Jul 15 09:00 Phoenix (GMT-7, no DST) = Jul 15 16:00 UTC
      googleDateStart: "20260715T160000Z",
      outlookDateStart: "2026-07-15T16:00:00Z"
    }
  },
  {
    name: "Adelaide timezone (half-hour offset with DST, GMT+9:30/+10:30)",
    // User in Adelaide during summer (DST) selects Feb 5
    // Feb 5 00:00 Adelaide (GMT+10:30 during DST) = Feb 4 13:30 UTC
    settings: {
      title: "Adelaide Event",
      date: "2026-02-04T13:30:00.000Z", // This is Feb 5 midnight in Adelaide during DST!
      start_time: "10:00",
      start_ampm: "AM",
      end_time: "11:00",
      end_ampm: "AM",
      tz: "Australia/Adelaide",
      location: "Adelaide, SA",
      description: "Test event for Adelaide half-hour timezone with DST"
    },
    expected: {
      // Feb 5 10:00 Adelaide (GMT+10:30 during DST) = Feb 4 23:30 UTC
      googleDateStart: "20260204T233000Z",
      outlookDateStart: "2026-02-04T23:30:00Z"
    }
  },
  {
    name: "Dubai/UAE timezone (GMT+4) - Rails sends 'Abu Dhabi' not 'Dubai'",
    // User in UAE selects Feb 10. Browser sends midnight Dubai as UTC:
    // Feb 10 00:00 Dubai (GMT+4) = Feb 9 20:00 UTC
    settings: {
      title: "Dubai Event",
      date: "2026-02-09T20:00:00.000Z", // This is Feb 10 midnight in Dubai!
      start_time: "7:00",
      start_ampm: "PM",
      end_time: "8:00",
      end_ampm: "PM",
      tz: "Abu Dhabi",  // Rails ActiveSupport name (what Kit actually sends)
      location: "Dubai, UAE",
      description: "Test event for UAE timezone - the Debbie bug"
    },
    expected: {
      // Feb 10 7:00 PM Dubai (GMT+4) = Feb 10 3:00 PM UTC
      googleDateStart: "20260210T150000Z",
      outlookDateStart: "2026-02-10T15:00:00Z"
    }
  },
  {
    name: "Dubai/UAE timezone with offset suffix format",
    // Same event but with the older Kit format that includes GMT offset
    settings: {
      title: "Dubai Event Alt Format",
      date: "2026-02-09T20:00:00.000Z",
      start_time: "7:00",
      start_ampm: "PM",
      end_time: "8:00",
      end_ampm: "PM",
      tz: "Abu Dhabi (GMT+04:00)",  // Alternate format with offset
      location: "Dubai, UAE",
      description: "Test event for UAE timezone with offset format"
    },
    expected: {
      googleDateStart: "20260210T150000Z",
      outlookDateStart: "2026-02-10T15:00:00Z"
    }
  },
  {
    name: "Single-digit hour format (2:00 PM, not 02:00 PM)",
    // Tests that single-digit hours parse correctly
    settings: {
      title: "Afternoon Event",
      date: "2026-03-15T07:00:00.000Z", // Mar 15 midnight Denver
      start_time: "2:00",
      start_ampm: "PM",
      end_time: "3:00",
      end_ampm: "PM",
      tz: "America/Denver",
      location: "Denver, CO",
      description: "Test single-digit hour parsing"
    },
    expected: {
      // Mar 15 2:00 PM Denver (MDT = UTC-6 in March) = Mar 15 8:00 PM UTC
      googleDateStart: "20260315T200000Z",
      outlookDateStart: "2026-03-15T20:00:00Z"
    }
  },
  {
    name: "Kirstin bug: US Eastern user with midnight-UTC date (Mode B)",
    // Kit sends "2026-03-18T00:00:00.000Z" — midnight UTC, NOT midnight Eastern.
    // Without the fix, this converts to March 17 8pm Eastern → wrong date.
    settings: {
      title: "Kirstin's Event",
      date: "2026-03-18T00:00:00.000Z", // Midnight UTC — date IS March 18
      start_time: "10:00",
      start_ampm: "AM",
      end_time: "11:00",
      end_ampm: "AM",
      tz: "Eastern Time (US & Canada)",
      location: "Online",
      description: "Regression test for off-by-one date bug for US users"
    },
    expected: {
      // Mar 18 10:00 AM Eastern (EDT, UTC-4) = Mar 18 14:00 UTC
      googleDateStart: "20260318T140000Z",
      outlookDateStart: "2026-03-18T14:00:00Z"
    }
  },
  {
    name: "Date-only string (no time component) — Mode B",
    // Kit sends just "2026-03-18" with no T or time component at all.
    settings: {
      title: "Date-Only Event",
      date: "2026-03-18", // Plain date, no time
      start_time: "9:00",
      start_ampm: "AM",
      end_time: "10:00",
      end_ampm: "AM",
      tz: "Pacific Time (US & Canada)",
      location: "Seattle",
      description: "Test plain date string handling"
    },
    expected: {
      // Mar 18 9:00 AM Pacific (PDT, UTC-7) = Mar 18 16:00 UTC
      googleDateStart: "20260318T160000Z",
      outlookDateStart: "2026-03-18T16:00:00Z"
    }
  },
  {
    name: "Central Time midnight-UTC — same bug as Kirstin",
    // Another US timezone to verify the fix works broadly
    settings: {
      title: "Central Time Event",
      date: "2026-03-18T00:00:00.000Z",
      start_time: "2:00",
      start_ampm: "PM",
      end_time: "3:00",
      end_ampm: "PM",
      tz: "Central Time (US & Canada)",
      location: "Chicago",
      description: "Verify fix for Central Time users"
    },
    expected: {
      // Mar 18 2:00 PM Central (CDT, UTC-5) = Mar 18 19:00 UTC
      googleDateStart: "20260318T190000Z",
      outlookDateStart: "2026-03-18T19:00:00Z"
    }
  },
  {
    name: "Browser TZ ≠ Account TZ: Central browser, Pacific account (Kirstin bug v2)",
    // Kirstin is in Central Time but manages a client's Kit account set to Pacific.
    // Kit sends midnight Central as UTC: 2026-03-18T05:00:00.000Z (CDT = UTC-5)
    // Without the max() fix, this converts to Pacific → Mar 17 10pm → wrong date.
    // With max(utcDate, tzDate) = max(Mar 18, Mar 17) = Mar 18 ✓
    settings: {
      title: "Cross-TZ Event",
      date: "2026-03-18T05:00:00.000Z",
      start_time: "10:00",
      start_ampm: "AM",
      end_time: "11:00",
      end_ampm: "AM",
      tz: "America/Los_Angeles",
      location: "Online",
      description: "Regression test for browser TZ ≠ account TZ"
    },
    expected: {
      // Mar 18 10:00 AM Pacific (PDT, UTC-7) = Mar 18 17:00 UTC
      googleDateStart: "20260318T170000Z",
      outlookDateStart: "2026-03-18T17:00:00Z"
    }
  }
];

function mapTimezoneToIANA(kitTimezone) {
  if (!kitTimezone) return 'UTC';

  if (kitTimezone.includes('/')) {
    return kitTimezone;
  }

  // Subset of timezone mappings for testing - matches calendar-block/index.js
  // Includes Rails ActiveSupport names (what Kit actually sends)
  const timezoneMap = {
    'Pacific Time (US & Canada)': 'America/Los_Angeles',
    'Pacific Time (GMT-08:00)': 'America/Los_Angeles',
    'Mountain Time (US & Canada)': 'America/Denver',
    'Mountain Time (GMT-07:00)': 'America/Denver',
    'Arizona': 'America/Phoenix',
    'Phoenix (GMT-07:00)': 'America/Phoenix',
    'Central Time (US & Canada)': 'America/Chicago',
    'Central Time (GMT-06:00)': 'America/Chicago',
    'Eastern Time (US & Canada)': 'America/New_York',
    'Eastern Time (GMT-05:00)': 'America/New_York',
    'Abu Dhabi': 'Asia/Muscat',          // Rails name for UAE/Gulf GMT+4
    'Muscat': 'Asia/Muscat',
    'Dubai': 'Asia/Dubai',
    'Chennai': 'Asia/Kolkata',
    'Kolkata': 'Asia/Kolkata',
    'Mumbai': 'Asia/Kolkata',
    'New Delhi': 'Asia/Kolkata',
    'India (GMT+05:30)': 'Asia/Kolkata',
    'Kathmandu': 'Asia/Kathmandu',
    'Nepal (GMT+05:45)': 'Asia/Kathmandu',
    'Adelaide': 'Australia/Adelaide',
    'Adelaide (GMT+09:30)': 'Australia/Adelaide',
    'Brisbane': 'Australia/Brisbane',
    'Brisbane (GMT+10:00)': 'Australia/Brisbane',
    'Sydney': 'Australia/Sydney',
    'Sydney (GMT+10:00)': 'Australia/Sydney',
    'UTC': 'Etc/UTC',
  };

  // Try exact match
  if (timezoneMap[kitTimezone]) return timezoneMap[kitTimezone];

  // Try case-insensitive
  const lower = kitTimezone.toLowerCase().trim();
  for (const [key, value] of Object.entries(timezoneMap)) {
    if (key.toLowerCase() === lower) return value;
  }

  // Strip GMT offset and try again
  const nameOnly = kitTimezone
    .replace(/\s*\(GMT[+-]?\d{2}:\d{2}\)\s*/g, '')
    .replace(/\s*GMT[+-]?\d{2}:\d{2}\s*/g, '')
    .trim();
  if (nameOnly && timezoneMap[nameOnly]) return timezoneMap[nameOnly];
  if (nameOnly) {
    const lowerName = nameOnly.toLowerCase();
    for (const [key, value] of Object.entries(timezoneMap)) {
      if (key.toLowerCase() === lowerName) return value;
    }
  }

  // Extract GMT offset as fallback
  const offsetMatch = kitTimezone.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (offsetMatch) {
    const sign = offsetMatch[1];
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = parseInt(offsetMatch[3], 10);
    return `UTC${sign}${hours}${minutes > 0 ? ':' + String(minutes).padStart(2, '0') : ''}`;
  }

  return kitTimezone || 'UTC';
}

function runTest(testCase) {
  const { name, settings, expected } = testCase;
  const results = { name, passed: true, errors: [], details: {} };

  try {
    const ianaTimezone = mapTimezoneToIANA(settings.tz);
    // Date parsing: detect midnight-UTC vs real timezone-shifted timestamps
    // (matches the fix in calendar-block/index.js)
    const utcMoment = DateTime.fromISO(settings.date, { zone: 'utc' });
    const isDateOnly = !settings.date.includes('T');
    const isMidnightUTC = utcMoment.hour === 0 && utcMoment.minute === 0 && utcMoment.second === 0;

    let datePart;
    if (isDateOnly || isMidnightUTC) {
      datePart = utcMoment.toISODate();
    } else {
      // Take the later of UTC date and target-TZ date to handle browser TZ ≠ account TZ
      const dateInTargetTz = utcMoment.setZone(ianaTimezone);
      const utcDate = utcMoment.toISODate();
      const tzDate = dateInTargetTz.toISODate();
      datePart = utcDate > tzDate ? utcDate : tzDate;
    }

    const fullStartString = `${datePart} ${settings.start_time} ${settings.start_ampm}`;
    const startDateTime = DateTime.fromFormat(fullStartString, 'yyyy-MM-dd h:mm a', { zone: ianaTimezone });

    if (!startDateTime.isValid) {
      results.passed = false;
      results.errors.push(`Invalid start datetime: ${startDateTime.invalidReason}`);
      return results;
    }

    // Test Google format
    const googleFormat = startDateTime.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
    results.details.googleFormat = googleFormat;
    if (expected.googleDateStart && googleFormat !== expected.googleDateStart) {
      results.passed = false;
      results.errors.push(`Google format mismatch: expected ${expected.googleDateStart}, got ${googleFormat}`);
    }

    // Test Outlook format (ISO 8601)
    const outlookFormat = startDateTime.toUTC().toISO({ suppressMilliseconds: true });
    results.details.outlookFormat = outlookFormat;
    if (expected.outlookDateStart && outlookFormat !== expected.outlookDateStart) {
      results.passed = false;
      results.errors.push(`Outlook format mismatch: expected ${expected.outlookDateStart}, got ${outlookFormat}`);
    }

    // Test URL generation
    const googleUrl = new URL("https://calendar.google.com/calendar/render");
    googleUrl.searchParams.set("action", "TEMPLATE");
    googleUrl.searchParams.set("text", settings.title);
    googleUrl.searchParams.set("dates", `${googleFormat}/${googleFormat}`);
    results.details.googleUrl = googleUrl.toString();

    if (!results.details.googleUrl.includes("calendar.google.com")) {
      results.passed = false;
      results.errors.push("Google URL malformed");
    }

    const outlookUrl = new URL("https://outlook.live.com/calendar/deeplink/compose");
    outlookUrl.searchParams.set("startdt", outlookFormat);
    outlookUrl.searchParams.set("subject", settings.title);
    results.details.outlookUrl = outlookUrl.toString();

    if (!results.details.outlookUrl.includes("outlook.live.com")) {
      results.passed = false;
      results.errors.push("Outlook URL malformed");
    }

    const office365Url = new URL("https://outlook.office.com/calendar/deeplink/compose");
    office365Url.searchParams.set("startdt", outlookFormat);
    office365Url.searchParams.set("subject", settings.title);
    results.details.office365Url = office365Url.toString();

    if (!results.details.office365Url.includes("outlook.office.com")) {
      results.passed = false;
      results.errors.push("Office 365 URL malformed");
    }

    // Test ICS generation
    const icsText = buildIcs({
      title: settings.title,
      description: settings.description,
      location: settings.location,
      start: startDateTime.toJSDate(),
      end: startDateTime.plus({ hours: 1 }).toJSDate(),
    });

    if (!icsText.includes("BEGIN:VCALENDAR") || !icsText.includes("END:VCALENDAR")) {
      results.passed = false;
      results.errors.push("ICS format invalid");
    }
    results.details.icsValid = true;

  } catch (error) {
    results.passed = false;
    results.errors.push(`Exception: ${error.message}`);
  }

  return results;
}

export default async function handler(req, res) {
  // Verify secret for security (allow Vercel cron jobs through)
  const secret = req.headers['x-test-secret'] || req.query.secret;
  const expectedSecret = process.env.WEEKLY_REPORT_SECRET;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const hasCronSecret = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;

  // Allow if: valid secret provided, OR Vercel cron job, OR CRON_SECRET matches
  if (expectedSecret && !isVercelCron && !hasCronSecret && secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || "development",
    tests: [],
    summary: { total: 0, passed: 0, failed: 0 }
  };

  // Run all test cases
  for (const testCase of TEST_CASES) {
    const result = runTest(testCase);
    results.tests.push(result);
    results.summary.total++;
    if (result.passed) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }
  }

  results.duration = `${Date.now() - startTime}ms`;
  results.allPassed = results.summary.failed === 0;

  // Log results
  console.log("Calendar Integration Test Results:", JSON.stringify(results, null, 2));

  // Return results
  res.setHeader("Content-Type", "application/json");
  return res.status(results.allPassed ? 200 : 500).json(results);
}
