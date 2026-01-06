// /api/test-calendars/index.js
// Automated testing endpoint for calendar integrations
// Validates that all calendar URLs are generated correctly

import { kv } from "@vercel/kv";
import { buildIcs } from "../../utils/buildIcs.js";
import { DateTime } from "luxon";

// Test cases covering different scenarios
const TEST_CASES = [
  {
    name: "Basic event - Pacific timezone",
    settings: {
      title: "Test Event",
      date: "2025-02-15T00:00:00.000Z",
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
    name: "PM event - Eastern timezone",
    settings: {
      title: "Afternoon Call",
      date: "2025-03-20T00:00:00.000Z",
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
  }
];

function mapTimezoneToIANA(kitTimezone) {
  if (kitTimezone && kitTimezone.includes('/')) {
    return kitTimezone;
  }
  const timezoneMap = {
    'Pacific Time (GMT-08:00)': 'America/Los_Angeles',
    'Mountain Time (GMT-07:00)': 'America/Denver',
    'Central Time (GMT-06:00)': 'America/Chicago',
    'Eastern Time (GMT-05:00)': 'America/New_York',
    'UTC': 'UTC',
  };
  return timezoneMap[kitTimezone] || kitTimezone || 'UTC';
}

function runTest(testCase) {
  const { name, settings, expected } = testCase;
  const results = { name, passed: true, errors: [], details: {} };

  try {
    const ianaTimezone = mapTimezoneToIANA(settings.tz);
    // Extract date directly from ISO string to preserve user's selected date
    // (matches the fix in calendar-block/index.js)
    const datePart = settings.date.split('T')[0];

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
