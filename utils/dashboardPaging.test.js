import test from "node:test";
import assert from "node:assert/strict";
import { getDashboardPageWindow } from "./dashboardPaging.js";

const fixedNow = new Date("2026-10-02T12:00:00.000Z");
const firstEvent = "2025-08-19";

function assertMonSunday(ranges) {
  for (const range of ranges) {
    assert.equal(new Date(`${range.weekStart}T00:00:00Z`).getUTCDay(), 1, `${range.weekStart} is Monday`);
    assert.equal(new Date(`${range.weekEnd}T00:00:00Z`).getUTCDay(), 0, `${range.weekEnd} is Sunday`);
  }
}

test("all supported ranges return newest completed Monday-Sunday weeks", () => {
  for (const weeks of [8, 12, 24, 52]) {
    const result = getDashboardPageWindow({ now: fixedNow, firstEvent, weeks });
    assert.equal(result.rangeWeeks, weeks);
    assert.equal(result.weekRanges.length, weeks);
    assert.equal(result.page, 0);
    assert.equal(result.hasNext, false);
    assertMonSunday(result.weekRanges);
    assert.equal(result.endDate, "2026-09-27");
  }
});

test("previous and next pages are adjacent without overlap, and repeat deterministically", () => {
  const newest = getDashboardPageWindow({ now: fixedNow, firstEvent, weeks: 8, page: 0 });
  const older = getDashboardPageWindow({ now: fixedNow, firstEvent, weeks: 8, page: 1 });
  const olderAgain = getDashboardPageWindow({ now: fixedNow, firstEvent, weeks: 8, page: 1 });
  assert.equal(older.page, 1);
  assert.equal(older.hasPrevious, true);
  assert.equal(older.hasNext, true);
  assert.deepEqual(older, olderAgain);
  assert.equal(older.weekRanges.at(-1).weekEnd, new Date(new Date(newest.weekRanges[0].weekStart + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10));
  assertMonSunday([...older.weekRanges, ...newest.weekRanges]);
});

test("oldest page clamps to available history and exposes its true boundary", () => {
  const firstPage = getDashboardPageWindow({ now: fixedNow, firstEvent, weeks: 8, page: 999 });
  assert.equal(firstPage.page, firstPage.pageCount - 1);
  assert.equal(firstPage.hasPrevious, false);
  assert.equal(firstPage.hasNext, true);
  assert.ok(firstPage.weekRanges.length > 0 && firstPage.weekRanges.length <= 8);
  assert.equal(firstPage.weekRanges[0].weekStart, "2025-08-18");
  assertMonSunday(firstPage.weekRanges);
});

test("current partial week is excluded, and missing first-event metadata has a 12-week fallback", () => {
  const sunday = getDashboardPageWindow({ now: new Date("2026-10-04T12:00:00Z"), firstEvent, weeks: 8 });
  assert.equal(sunday.endDate, "2026-09-27");
  const monday = getDashboardPageWindow({ now: new Date("2026-10-05T00:05:00Z"), firstEvent, weeks: 8 });
  assert.equal(monday.endDate, "2026-10-04");
  const fallback = getDashboardPageWindow({ now: fixedNow, weeks: 12 });
  assert.equal(fallback.weekRanges.length, 12);
  assert.equal(fallback.startDate, "2026-07-06");
  assert.equal(fallback.endDate, "2026-09-27");
});

test("no completed weeks are shown when tracking began during the current partial week", () => {
  const result = getDashboardPageWindow({ now: fixedNow, firstEvent: "2026-09-28", weeks: 8 });
  assert.equal(result.weekRanges.length, 0);
  assert.equal(result.pageCount, 1);
  assert.equal(result.hasPrevious, false);
  assert.equal(result.hasNext, false);
  assert.equal(result.startDate, null);
  assert.equal(result.endDate, null);
});
