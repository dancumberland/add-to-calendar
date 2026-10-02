import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { getDashboardPageWindow } from "../../utils/dashboardPaging.js";

const fixtureSecret = "dashboard-test-key";
const source = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8")
  .replace('import { getWeeklyTrendPage, getAllTimeStats } from "../../utils/analytics.js";', "")
  .replace("export default async function handler", "async function handler");

async function getWeeklyTrendPage(options) {
  const window = getDashboardPageWindow({ ...options, now: new Date("2026-10-02T12:00:00Z") });
  return {
    ...window,
    weeklyTotals: window.weekRanges.map((range, index) => ({
      ...range,
      week: `${range.weekStart} – ${range.weekEnd}`,
      total: index + 1,
    })),
  };
}

async function getAllTimeStats() {
  return { firstEvent: "2025-08-19", lastEventDate: "2026-10-02", totalEvents: 12345 };
}

const handler = new vm.Script(`${source}\nhandler;`).runInNewContext({
  getWeeklyTrendPage,
  getAllTimeStats,
  process: { env: { WEEKLY_REPORT_SECRET: fixtureSecret } },
  Date,
  Math,
  JSON,
  Number,
  String,
});

function createResponse() {
  const result = { statusCode: 200, headers: {}, body: "" };
  result.res = {
    status(code) { result.statusCode = code; return this; },
    setHeader(name, value) { result.headers[name] = value; return this; },
    send(value) { result.body = String(value); return this; },
    json(value) { result.body = JSON.stringify(value); return this; },
  };
  return result;
}

test("dashboard GET preserves query-key auth and renders full date labels and ranges", async () => {
  const unauthorized = createResponse();
  await handler({ method: "GET", query: {}, headers: {} }, unauthorized.res);
  assert.equal(unauthorized.statusCode, 401);

  const page = createResponse();
  await handler({ method: "GET", query: { secret: fixtureSecret, weeks: "8", page: "0" }, headers: {} }, page.res);
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers["Set-Cookie"], undefined);
  assert.equal(page.headers["Referrer-Policy"], "no-referrer");
  assert.equal(page.body.includes(fixtureSecret), false);
  assert.match(page.body, /<option value="8" selected>8 weeks<\/option>/);
  assert.match(page.body, /<option value="12"\s*>12 weeks<\/option>/);
  assert.match(page.body, /<option value="24"\s*>24 weeks<\/option>/);
  assert.match(page.body, /<option value="52"\s*>1 year<\/option>/);
  assert.match(page.body, /2026-09-21/);
  assert.match(page.body, /2026-09-27/);
  assert.match(page.body, /Weeks run Monday through Sunday/);
});

test("GET query parameters select older pages and invalid ranges fall back safely", async () => {
  const olderPage = createResponse();
  await handler({ method: "GET", query: { secret: fixtureSecret, weeks: "8", page: "1" }, headers: {} }, olderPage.res);
  assert.equal(olderPage.statusCode, 200);
  assert.match(olderPage.body, /"page":1/);
  assert.match(olderPage.body, /"rangeWeeks":8/);
  assert.match(olderPage.body, /"hasNext":true/);
  assert.match(olderPage.body, /"hasPrevious":true/);
  assert.match(olderPage.body, /"startDate":"2026-06-08"/);
  assert.match(olderPage.body, /"endDate":"2026-08-02"/);

  const badRange = createResponse();
  await handler({ method: "GET", query: { secret: fixtureSecret, weeks: "10", page: "0" }, headers: {} }, badRange.res);
  assert.match(badRange.body, /<option value="12" selected>12 weeks<\/option>/);
});

test("range controls reset to newest, retain query auth, and block repeat navigation", async () => {
  const page = createResponse();
  await handler({ method: "GET", query: { secret: fixtureSecret }, headers: {} }, page.res);
  assert.match(page.body, /rangeSelect\.addEventListener\('change', \(\) => loadPage\(Number\(rangeSelect\.value\), 0\)\)/);
  assert.match(page.body, /const params = new URLSearchParams\(location\.search\)/);
  assert.match(page.body, /location\.assign\(location\.pathname \+ '\?' \+ params\.toString\(\) \+ location\.hash\)/);
  assert.match(page.body, /previousButton\.disabled = true/);
  assert.match(page.body, /nextButton\.disabled = true/);
  assert.match(page.body, /previousButton\.disabled = !state\.hasPrevious/);
  assert.match(page.body, /nextButton\.disabled = !state\.hasNext/);
});
