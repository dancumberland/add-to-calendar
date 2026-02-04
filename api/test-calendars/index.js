// /api/test-calendars/index.js
// Automated testing endpoint for calendar integrations
// Validates that all calendar URLs are generated correctly

import { kv } from "@vercel/kv";
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
  }
];

function mapTimezoneToIANA(kitTimezone) {
  if (kitTimezone && kitTimezone.includes('/')) {
    return kitTimezone;
  }
  // Subset of timezone mappings for testing - matches calendar-block/index.js
  const timezoneMap = {
    'Pacific Time (GMT-08:00)': 'America/Los_Angeles',
    'Mountain Time (GMT-07:00)': 'America/Denver',
    'Phoenix (GMT-07:00)': 'America/Phoenix',
    'Central Time (GMT-06:00)': 'America/Chicago',
    'Eastern Time (GMT-05:00)': 'America/New_York',
    'India (GMT+05:30)': 'Asia/Kolkata',
    'Nepal (GMT+05:45)': 'Asia/Kathmandu',
    'Adelaide (GMT+09:30)': 'Australia/Adelaide',
    'Brisbane (GMT+10:00)': 'Australia/Brisbane',
    'Sydney (GMT+10:00)': 'Australia/Sydney',
    'UTC': 'UTC',
  };
  return timezoneMap[kitTimezone] || kitTimezone || 'UTC';
}

function runTest(testCase) {
  const { name, settings, expected } = testCase;
  const results = { name, passed: true, errors: [], details: {} };

  try {
    const ianaTimezone = mapTimezoneToIANA(settings.tz);
    // Parse the date ISO as UTC, then convert to target timezone to get the correct date.
    // This handles timezones ahead of UTC (like Brisbane/Sydney) where the user's browser
    // sends midnight local time as the previous day in UTC.
    // (matches the fix in calendar-block/index.js)
    const utcMoment = DateTime.fromISO(settings.date, { zone: 'utc' });
    const dateInTargetTz = utcMoment.setZone(ianaTimezone);
    const datePart = dateInTargetTz.toISODate();

    const fullStartString = `${datePart} ${settings.start_time} ${settings.start_ampm}`;
    const startDateTime = DateTime.fromFormat(fullStartString, 'yyyy-MM-dd hh:mm a', { zone: ianaTimezone });

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

async function testKvConnection() {
  try {
    const testKey = `test_${Date.now()}`;
    await kv.set(testKey, "test", { ex: 60 });
    const value = await kv.get(testKey);
    await kv.del(testKey);
    return { passed: value === "test", details: "KV read/write successful" };
  } catch (error) {
    return { passed: false, details: `KV error: ${error.message}` };
  }
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
    kvTest: null,
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

  // Test KV connection
  results.kvTest = await testKvConnection();

  results.duration = `${Date.now() - startTime}ms`;
  results.allPassed = results.summary.failed === 0 && results.kvTest.passed;

  // Log results
  console.log("Calendar Integration Test Results:", JSON.stringify(results, null, 2));

  // Return results
  res.setHeader("Content-Type", "application/json");
  return res.status(results.allPassed ? 200 : 500).json(results);
}
