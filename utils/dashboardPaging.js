const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ALLOWED_RANGES = new Set([8, 12, 24, 52]);

function utcDate(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isoDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// Pure date-window calculation shared by the dashboard analytics query and
// focused tests. Page zero is newest; higher page numbers move into history.
export function getDashboardPageWindow({ now = new Date(), firstEvent = null, weeks = 12, page = 0 } = {}) {
  const pageSize = ALLOWED_RANGES.has(Number(weeks)) ? Number(weeks) : 12;
  const requestedPage = Number.isInteger(Number(page)) && Number(page) >= 0 ? Number(page) : 0;
  const today = utcDate(now);
  const todayWeekday = new Date(today).getUTCDay();
  const daysSinceMonday = (todayWeekday + 6) % 7;
  const latestWeekEnd = today - daysSinceMonday * DAY_MS - DAY_MS;

  const parsedFirstEvent = firstEvent ? new Date(`${firstEvent.slice(0, 10)}T00:00:00.000Z`) : null;
  const earliestWeekEnd = parsedFirstEvent && !Number.isNaN(parsedFirstEvent.getTime())
    ? utcDate(parsedFirstEvent) + (7 - parsedFirstEvent.getUTCDay()) % 7 * DAY_MS
    : latestWeekEnd - 11 * WEEK_MS;
  const historyWeeks = earliestWeekEnd <= latestWeekEnd
    ? Math.floor((latestWeekEnd - earliestWeekEnd) / WEEK_MS) + 1
    : 0;
  const pageCount = Math.max(1, Math.ceil(historyWeeks / pageSize));
  const safePage = Math.min(requestedPage, pageCount - 1);
  const pageEnd = latestWeekEnd - safePage * pageSize * WEEK_MS;
  const count = Math.min(pageSize, historyWeeks - safePage * pageSize);
  const weekRanges = [];

  for (let offset = count - 1; offset >= 0; offset--) {
    const weekEnd = pageEnd - offset * WEEK_MS;
    const weekStart = weekEnd - 6 * DAY_MS;
    weekRanges.push({ weekStart: isoDate(weekStart), weekEnd: isoDate(weekEnd) });
  }

  return {
    page: safePage,
    pageCount,
    rangeWeeks: pageSize,
    weekRanges,
    startDate: weekRanges[0]?.weekStart ?? null,
    endDate: weekRanges.at(-1)?.weekEnd ?? null,
    hasPrevious: safePage < pageCount - 1,
    hasNext: safePage > 0,
  };
}
