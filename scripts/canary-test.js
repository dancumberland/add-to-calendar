#!/usr/bin/env node
/**
 * Kit Calendar — Canary Test
 *
 * More thorough than the VPS health check: validates ICS date accuracy
 * (not just structure), tests all three Kit date modes explicitly,
 * and provides the scaffolding for a full Kit API canary integration.
 *
 * Run standalone:
 *   node scripts/canary-test.js
 *   SLACK_WEBHOOK_URL=https://... node scripts/canary-test.js
 *
 * --------------------------------------------------------------------
 * TODO — Full Kit API Canary (4-6 hours to implement):
 *
 * The tests below validate the HTTP API layer. The missing layer is
 * exercising Kit's full integration path:
 *   1. POST to Kit API to create a broadcast with a calendar block
 *   2. Send the broadcast to a test subscriber (canary email address)
 *   3. Receive the email and extract the calendar block HTML
 *   4. Click the Apple Calendar link from the actual email HTML
 *   5. Validate the ICS response
 *
 * This is the only test that would have caught all four past bugs,
 * because it exercises the Kit rendering layer that sits between
 * your API and the user's email client.
 *
 * Required credentials (store in .env.local):
 *   KIT_API_KEY=your-kit-api-key
 *   CANARY_EMAIL=your-test-subscriber@example.com
 *
 * The Kit API docs: https://developers.kit.com/v4
 * --------------------------------------------------------------------
 */

import { URL, URLSearchParams } from "url";
import https from "https";

const BASE_URL = process.env.CANARY_BASE_URL || "https://kit-app-build.vercel.app";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const REQUEST_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Test cases — one per Kit date mode, with expected date outcomes.
// These go deeper than the VPS check: we validate the resolved DTSTART date
// in the ICS file, not just that the file parses.
// ---------------------------------------------------------------------------
const CANARY_TESTS = [
  {
    name: "Mode B — midnight UTC (Kirstin bug regression)",
    description: "Eastern user selects March 18; Kit sends midnight UTC. Resolved date must be March 18, not March 17.",
    settings: {
      title: "Canary Test Event",
      date: "2026-03-18T00:00:00.000Z", // midnight UTC — Mode B
      start_time: "10:00", start_ampm: "AM",
      end_time: "11:00", end_ampm: "AM",
      tz: "Eastern Time (US & Canada)",
      description: "Canary test — Mode B midnight UTC",
    },
    expect: {
      resolved_date: "2026-03-18",
      dtstart_contains: "20260318T", // DTSTART in ICS must be March 18
    },
  },
  {
    name: "Mode A — non-midnight UTC, western TZ (Pacific)",
    description: "Pacific user selects April 15; Kit sends midnight Pacific as UTC (Apr 15 08:00 UTC). Resolved date must be April 15.",
    settings: {
      title: "Canary Test Event",
      date: "2026-04-15T08:00:00.000Z", // Apr 15 midnight Pacific = Apr 15 08:00 UTC
      start_time: "10:00", start_ampm: "AM",
      end_time: "11:00", end_ampm: "AM",
      tz: "Pacific Time (US & Canada)",
      description: "Canary test — Mode A Pacific",
    },
    expect: {
      resolved_date: "2026-04-15",
      dtstart_contains: "20260415T",
    },
  },
  {
    name: "Mode A — non-midnight UTC, ahead-of-UTC TZ (Brisbane)",
    description: "Brisbane user selects April 15; Kit sends midnight Brisbane as UTC (Apr 14 14:00 UTC). Resolved date must be April 15.",
    settings: {
      title: "Canary Test Event",
      date: "2026-04-14T14:00:00.000Z", // Apr 15 midnight Brisbane = Apr 14 14:00 UTC
      start_time: "09:00", start_ampm: "AM",
      end_time: "10:00", end_ampm: "AM",
      tz: "Australia/Brisbane",
      description: "Canary test — Mode A Brisbane",
    },
    expect: {
      resolved_date: "2026-04-15",
      dtstart_contains: "20260414T23", // 9 AM Brisbane = Apr 14 23:00 UTC
    },
  },
  // ===== V2 FORMAT (Kit April 2026+) =====
  {
    name: "V2 — Central timezone, 60-min duration",
    description: "V2 format: ISO local start, duration in minutes, IANA timezone. Must produce correct DTSTART.",
    settings: {
      title: "Canary Test Event",
      start: "2026-04-10T10:00:00",
      duration: "60",
      timezone: "America/Chicago",
      description: "Canary test — V2 format",
    },
    expect: {
      dtstart_contains: "20260410T150000Z", // 10 AM CDT (UTC-5) = 15:00 UTC
    },
  },
  {
    name: "V2 — ahead-of-UTC timezone (Sydney)",
    description: "V2 format with UTC+ timezone. No Mode A/B/C ambiguity — just local datetime + IANA zone.",
    settings: {
      title: "Canary Test Event",
      start: "2026-04-10T09:00:00",
      duration: "60",
      timezone: "Australia/Sydney",
      description: "Canary test — V2 Sydney",
    },
    expect: {
      dtstart_contains: "20260409T230000Z", // 9 AM AEST (UTC+10, no DST in April) = Apr 9 23:00 UTC
    },
  },
  {
    name: "% character in description (double-decode regression)",
    description: "Event description contains a % sign. Must not throw URIError. This is the Ballantyne bug class.",
    settings: {
      title: "Canary Test Event",
      date: "2026-04-15T00:00:00.000Z",
      start_time: "10:00", start_ampm: "AM",
      end_time: "11:00", end_ampm: "AM",
      tz: "Eastern Time (US & Canada)",
      description: "Save 20% off — canary regression test",
    },
    expect: {
      dtstart_contains: "20260415T",
      ics_contains_description: "20%25 off", // % should be encoded as %25 in ICS URL params
    },
  },
  // ===== BROWSER EAST OF EVENT TZ (Helsinki→London class, June 2026) =====
  // The old max(utcDate, tzDate) logic landed a day early when the browser is east of
  // UTC and the event tz is west of the browser. These pin the date accuracy in prod.
  {
    name: "Helsinki browser → London event (THE reported bug)",
    description: "Helsinki (UTC+3 summer) midnight Jul 14 = Jul 13 21:00 UTC, event tz London. Resolved date must be July 14, not 13.",
    settings: {
      title: "Canary Test Event",
      date: "2026-07-13T21:00:00.000Z",
      start_time: "10:00", start_ampm: "AM",
      end_time: "11:00", end_ampm: "AM",
      tz: "London",
      description: "Canary — browser east of event tz",
    },
    expect: {
      resolved_date: "2026-07-14",
      dtstart_contains: "20260714T090000Z", // 10 AM London BST (UTC+1) = 09:00 UTC
    },
  },
  {
    name: "Dubai browser → London event (class generality)",
    description: "Dubai (UTC+4) midnight Jul 14 = Jul 13 20:00 UTC, event tz London. Resolved date must be July 14.",
    settings: {
      title: "Canary Test Event",
      date: "2026-07-13T20:00:00.000Z",
      start_time: "10:00", start_ampm: "AM",
      end_time: "11:00", end_ampm: "AM",
      tz: "London",
      description: "Canary — Gulf browser, UK event",
    },
    expect: {
      resolved_date: "2026-07-14",
      dtstart_contains: "20260714T090000Z",
    },
  },
  {
    name: "Brisbane browser → Eastern event (corrected Mode C)",
    description: "Brisbane (UTC+10) midnight Apr 15 = Apr 14 14:00 UTC, event tz Eastern. Resolved date must be April 15 (creator clicked the 15th).",
    settings: {
      title: "Canary Test Event",
      date: "2026-04-14T14:00:00.000Z",
      start_time: "10:00", start_ampm: "AM",
      end_time: "11:00", end_ampm: "AM",
      tz: "Eastern Time (US & Canada)",
      description: "Canary — corrected Mode C",
    },
    expect: {
      resolved_date: "2026-04-15",
      dtstart_contains: "20260415T140000Z", // 10 AM Eastern EDT (UTC-4) = 14:00 UTC
    },
  },
  {
    name: "Combined label 'London, Dublin (GMT+00:00)' — DST-aware (summer)",
    description: "Grouped Windows-style label must resolve to Europe/London (BST), not a fixed UTC+0. Jul 14 10:00 London = 09:00 UTC.",
    settings: {
      title: "Canary Test Event",
      date: "2026-07-13T21:00:00.000Z",
      start_time: "10:00", start_ampm: "AM",
      end_time: "11:00", end_ampm: "AM",
      tz: "London, Dublin (GMT+00:00)",
      description: "Canary — combined label honors BST",
    },
    expect: {
      resolved_date: "2026-07-14",
      dtstart_contains: "20260714T090000Z",
    },
  },
];

// ---------------------------------------------------------------------------
// HTTP helpers (no external deps — pure Node built-ins)
// ---------------------------------------------------------------------------
function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: REQUEST_TIMEOUT_MS,
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.write(body);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: { Accept: "*/*" },
      timeout: REQUEST_TIMEOUT_MS,
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, contentType: res.headers["content-type"] || "", body: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// ICS validators
// ---------------------------------------------------------------------------
function extractIcsUrl(html) {
  const match = html.match(/href="(https?:\/\/[^"]+\/api\/ics[^"]*)"/);
  return match ? match[1] : null;
}

function validateIcsDateAccuracy(icsBody, expectedDtstart) {
  const dtstart = icsBody.match(/^DTSTART[^:]*:([^\r\n]+)/m)?.[1];
  if (!dtstart) return { ok: false, error: "DTSTART not found in ICS" };
  if (!dtstart.includes(expectedDtstart)) {
    return { ok: false, error: `DTSTART mismatch: expected to contain '${expectedDtstart}', got '${dtstart}'` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Run a single canary test
// ---------------------------------------------------------------------------
async function runCanaryTest(test) {
  const result = { name: test.name, passed: false, error: null, details: {} };

  // Step 1: POST to calendar-block
  let html;
  try {
    const { status, body } = await httpPost(`${BASE_URL}/api/calendar-block`, { settings: test.settings });
    const data = JSON.parse(body);
    if (data.code === 500) {
      result.error = `calendar-block error: ${data.errors?.[0] || "unknown"}`;
      return result;
    }
    html = data.html || "";
  } catch (e) {
    result.error = `calendar-block request failed: ${e.message}`;
    return result;
  }

  // Step 2: Extract ICS URL
  const icsUrl = extractIcsUrl(html);
  if (!icsUrl) {
    result.error = "ICS URL not found in calendar-block HTML";
    return result;
  }
  result.details.ics_url = icsUrl;

  // Step 3: Fetch ICS
  let icsBody;
  try {
    const { status, contentType, body } = await httpGet(icsUrl);
    if (status !== 200) {
      result.error = `ICS fetch returned HTTP ${status}`;
      return result;
    }
    if (!contentType.includes("text/calendar")) {
      result.error = `ICS wrong Content-Type: ${contentType}`;
      return result;
    }
    icsBody = body;
  } catch (e) {
    result.error = `ICS fetch failed: ${e.message}`;
    return result;
  }

  // Step 4: Validate ICS structure
  if (!icsBody.includes("BEGIN:VCALENDAR") || !icsBody.includes("DTSTART")) {
    result.error = "ICS missing required fields (VCALENDAR or DTSTART)";
    return result;
  }

  // Step 5: Validate date accuracy (the critical check the VPS health check skips)
  if (test.expect.dtstart_contains) {
    const dateCheck = validateIcsDateAccuracy(icsBody, test.expect.dtstart_contains);
    if (!dateCheck.ok) {
      result.error = `Date accuracy check failed: ${dateCheck.error}`;
      result.details.ics_dtstart = icsBody.match(/^DTSTART[^:]*:[^\r\n]+/m)?.[0];
      return result;
    }
  }

  result.passed = true;
  return result;
}

// ---------------------------------------------------------------------------
// Slack notification
// ---------------------------------------------------------------------------
async function sendSlackAlert(results) {
  if (!SLACK_WEBHOOK_URL) return;

  const failed = results.filter((r) => !r.passed);
  const allOk = failed.length === 0;

  const header = allOk
    ? `✅ *Kit Calendar Canary — All tests passed* (${results.length}/${results.length})`
    : `🚨 *Kit Calendar Canary — ${failed.length} test${failed.length > 1 ? "s" : ""} FAILING*`;

  const lines = results.map((r) =>
    r.passed ? `  ✅ ${r.name}` : `  ❌ ${r.name}: ${r.error}`
  );

  const payload = {
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: [header, ...lines].join("\n") } },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Canary · date-accuracy validated · ${new Date().toISOString().slice(0, 16)} UTC` }],
      },
    ],
  };

  try {
    await httpPost(SLACK_WEBHOOK_URL, payload);
  } catch (e) {
    console.error("Slack notification failed:", e.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[${new Date().toISOString()}] Kit Calendar canary starting...`);
  console.log(`  Target: ${BASE_URL}\n`);

  const results = [];
  for (const test of CANARY_TESTS) {
    process.stdout.write(`  ${test.name}... `);
    const result = await runCanaryTest(test);
    results.push(result);
    console.log(result.passed ? "PASS" : `FAIL: ${result.error}`);
    if (!result.passed && result.details?.ics_dtstart) {
      console.log(`    ICS DTSTART found: ${result.details.ics_dtstart}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\nResults: ${passed}/${results.length} passed`);

  if (SLACK_WEBHOOK_URL) {
    await sendSlackAlert(results);
    console.log("Slack notification sent.");
  } else {
    console.log("(No SLACK_WEBHOOK_URL set — skipping Slack notification)");
  }

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
