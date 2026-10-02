import { getWeeklyTrendPage, getAllTimeStats } from "../../utils/analytics.js";

const RANGE_OPTIONS = [8, 12, 24, 52];

function numberParam(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function chartPayload(trend) {
  return {
    weeks: trend.weeklyTotals,
    page: trend.page,
    pageCount: trend.pageCount,
    rangeWeeks: trend.rangeWeeks,
    startDate: trend.startDate,
    endDate: trend.endDate,
    hasPrevious: trend.hasPrevious,
    hasNext: trend.hasNext,
  };
}

export default async function handler(req, res) {
  const expectedSecret = process.env.WEEKLY_REPORT_SECRET;
  const secret = req.query?.secret;
  if (expectedSecret && secret !== expectedSecret) return res.status(401).send("Unauthorized");

  const weeks = RANGE_OPTIONS.includes(numberParam(req.query.weeks, 12))
    ? numberParam(req.query.weeks, 12)
    : 12;
  const page = Math.max(0, numberParam(req.query.page, 0));
  let trend;
  let allTimeData;
  let latestTrend;
  let error;
  try {
    allTimeData = await getAllTimeStats();
    trend = await getWeeklyTrendPage({ weeks, page, firstEvent: allTimeData.firstEvent });
    // The fixed summary cards always compare the latest two completed weeks,
    // regardless of which historic page is selected in the chart.
    latestTrend = weeks === 12 && page === 0
      ? trend
      : await getWeeklyTrendPage({ weeks: 12, page: 0, firstEvent: allTimeData.firstEvent });
  } catch (caught) {
    error = caught.message;
    allTimeData = {};
    trend = {
      weeklyTotals: [], page: 0, pageCount: 1, rangeWeeks: weeks,
      startDate: null, endDate: null, hasPrevious: false, hasNext: false,
    };
    latestTrend = trend;
  }

  const completedWeeks = latestTrend.weeklyTotals;
  const thisWeek = completedWeeks.at(-1)?.total ?? 0;
  const lastWeek = completedWeeks.at(-2)?.total ?? 0;
  const allTime = allTimeData.totalEvents ?? 0;
  const wowPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  const wowSign = wowPct !== null && wowPct >= 0 ? "+" : "";
  const wowColor = wowPct === null ? "#94a3b8" : wowPct >= 0 ? "#22c55e" : "#ef4444";
  const firstEvent = allTimeData.firstEvent ?? "—";
  const lastEvent = allTimeData.lastEventDate ?? "—";
  const data = JSON.stringify(chartPayload(trend)).replace(/</g, "\\u003c");
  const errorBlock = error ? `<div class="error">⚠️ Data fetch error: ${escapeHtml(error)}</div>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kit Calendar — Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f172a; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; min-height: 100vh; padding: 32px 24px; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.25rem; font-weight: 600; color: #f1f5f9; margin-bottom: 4px; }
  .subtitle { font-size: 0.8rem; color: #64748b; margin-bottom: 28px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .card, .chart-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; }
  .card { padding: 20px; }
  .card-label { font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .card-value { font-size: 2rem; font-weight: 700; color: #f1f5f9; line-height: 1; }
  .card-sub { font-size: 0.78rem; color: #64748b; margin-top: 6px; }
  .chart-card { padding: 24px; margin-bottom: 24px; }
  .chart-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; flex-wrap: wrap; margin-bottom: 18px; }
  .chart-title { font-size: 0.85rem; font-weight: 600; color: #cbd5e1; margin-bottom: 5px; }
  .period-label, .chart-note { font-size: 0.75rem; color: #64748b; }
  .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  select, button { border: 1px solid #475569; border-radius: 7px; background: #0f172a; color: #e2e8f0; font: inherit; font-size: 0.8rem; min-height: 36px; padding: 7px 10px; }
  button { cursor: pointer; }
  button:hover:not(:disabled), select:hover { border-color: #3b82f6; }
  button:focus-visible, select:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
  button:disabled { cursor: not-allowed; color: #64748b; opacity: 0.55; }
  .page-indicator { min-width: 76px; text-align: center; color: #94a3b8; font-size: 0.75rem; }
  .chart-wrap { position: relative; min-height: 280px; }
  .chart-note { min-height: 1em; margin-top: 10px; }
  .error { background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 16px; color: #fca5a5; font-size: 0.85rem; margin-bottom: 24px; }
  .footer { font-size: 0.72rem; color: #475569; margin-top: 16px; text-align: center; }
  @media (max-width: 560px) { body { padding: 24px 14px; } .chart-card { padding: 17px 13px; } .controls { width: 100%; } .controls select { flex: 1; } .chart-wrap { min-height: 230px; } }
</style>
</head>
<body>
<main>
<h1>📅 Kit Calendar</h1>
<div class="subtitle">Usage Dashboard · Generated ${new Date().toISOString().substring(0, 16).replace("T", " ")} UTC</div>
${errorBlock}
<section class="cards" aria-label="Weekly summary">
  <div class="card"><div class="card-label">Latest Full Week</div><div class="card-value">${thisWeek.toLocaleString()}</div><div class="card-sub">events</div></div>
  <div class="card"><div class="card-label">Prior Full Week</div><div class="card-value">${lastWeek.toLocaleString()}</div><div class="card-sub">events</div></div>
  <div class="card"><div class="card-label">Week-over-Week</div><div class="card-value" style="color:${wowColor}">${wowPct !== null ? `${wowSign}${wowPct}%` : "—"}</div><div class="card-sub">${wowPct !== null ? (wowPct >= 0 ? "up from prior full week" : "down from prior full week") : "no prior data"}</div></div>
  <div class="card"><div class="card-label">All-Time</div><div class="card-value">${allTime.toLocaleString()}</div><div class="card-sub">since ${escapeHtml(firstEvent)}</div></div>
</section>
<section class="chart-card" aria-label="Completed week trend chart">
  <div class="chart-head">
    <div><div class="chart-title">Completed-Week Trend</div><div id="period" class="period-label" aria-live="polite"></div></div>
    <div class="controls">
      <label for="range">Show</label>
      <select id="range" aria-label="Weeks shown">
        ${RANGE_OPTIONS.map((option) => `<option value="${option}" ${option === weeks ? "selected" : ""}>${option === 52 ? "1 year" : `${option} weeks`}</option>`).join("")}
      </select>
      <button id="previous" type="button" aria-label="Show older weeks">← Previous</button>
      <span id="page-indicator" class="page-indicator" aria-live="polite"></span>
      <button id="next" type="button" aria-label="Show newer weeks">Next →</button>
    </div>
  </div>
  <div class="chart-wrap"><canvas id="chart" role="img" aria-label="Calendar events by completed week"></canvas></div>
  <div id="chart-note" class="chart-note" aria-live="polite"></div>
</section>
<div class="footer">Last event: ${escapeHtml(lastEvent)} &nbsp;·&nbsp; kit-app-build.vercel.app</div>
</main>
<script>
const RANGE_OPTIONS = ${JSON.stringify(RANGE_OPTIONS)};
let chartState = ${data};
const rangeSelect = document.getElementById('range');
const previousButton = document.getElementById('previous');
const nextButton = document.getElementById('next');
const period = document.getElementById('period');
const indicator = document.getElementById('page-indicator');
const note = document.getElementById('chart-note');
const ctx = document.getElementById('chart').getContext('2d');

const chart = new Chart(ctx, {
  type: 'bar',
  data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 4, borderSkipped: false }] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { title: items => chartState.weeks[items[0].dataIndex]?.week ?? '', label: item => item.parsed.y.toLocaleString() + ' events' } }
    },
    scales: {
      x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
      y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8', precision: 0 } }
    }
  }
});

function updateChart(state) {
  chartState = state;
  const weeks = state.weeks || [];
  chart.data.labels = weeks.map(week => week.week);
  chart.data.datasets[0].data = weeks.map(week => week.total);
  chart.data.datasets[0].backgroundColor = weeks.map((_, index) => state.page === 0 && index === weeks.length - 1 ? '#3b82f6' : '#1e3a5f');
  chart.update();
  period.textContent = state.startDate && state.endDate
    ? state.startDate + ' through ' + state.endDate + ' · ' + weeks.length + ' completed weeks'
    : 'No completed weeks available';
  indicator.textContent = 'Page ' + (state.page + 1) + ' of ' + state.pageCount;
  previousButton.disabled = !state.hasPrevious;
  nextButton.disabled = !state.hasNext;
  const missingWeeks = weeks.filter(week => week.total === null).length;
  note.textContent = missingWeeks
    ? missingWeeks + ' week(s) have no retained aggregate; those chart values are left blank.'
    : (weeks.length && weeks.every(week => week.total === 0)
    ? 'No events recorded in this period.'
    : (!weeks.length ? 'No completed weeks are available in this period.' : 'Weeks run Monday through Sunday. The current partial week is excluded.'));
}

function loadPage(weeks, page) {
  const params = new URLSearchParams(location.search);
  params.set('weeks', String(weeks));
  params.set('page', String(Math.max(0, page)));
  previousButton.disabled = true;
  nextButton.disabled = true;
  rangeSelect.disabled = true;
  note.textContent = 'Loading completed weeks…';
  location.assign(location.pathname + '?' + params.toString() + location.hash);
}

rangeSelect.addEventListener('change', () => loadPage(Number(rangeSelect.value), 0));
previousButton.addEventListener('click', () => loadPage(chartState.rangeWeeks, chartState.page + 1));
nextButton.addEventListener('click', () => loadPage(chartState.rangeWeeks, Math.max(0, chartState.page - 1)));
updateChart(chartState);
</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  return res.status(200).send(html);
}
