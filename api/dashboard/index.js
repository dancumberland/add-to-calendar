// /api/dashboard/index.js
// Admin metrics dashboard — protected by WEEKLY_REPORT_SECRET query param.
// Returns a self-contained HTML page with 12-week trend chart and usage stats.

import { getTwelveWeekTrend, getAllTimeStats } from "../../utils/analytics.js";

export default async function handler(req, res) {
  const secret = req.query.secret;
  const expectedSecret = process.env.WEEKLY_REPORT_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return res.status(401).send("Unauthorized");
  }

  let trendData, allTimeData, error;
  try {
    [trendData, allTimeData] = await Promise.all([
      getTwelveWeekTrend(),
      getAllTimeStats(),
    ]);
  } catch (e) {
    error = e.message;
  }

  const weeks = trendData?.weeklyTotals ?? [];
  const thisWeek = trendData?.thisWeekTotal ?? 0;
  const lastWeek = trendData?.lastWeekTotal ?? 0;
  const allTime = allTimeData?.totalEvents ?? 0;
  const wowPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  const wowSign = wowPct !== null ? (wowPct >= 0 ? "+" : "") : "";
  const wowColor = wowPct === null ? "#94a3b8" : wowPct >= 0 ? "#22c55e" : "#ef4444";

  const labels = JSON.stringify(weeks.map(w => w.week));
  const data = JSON.stringify(weeks.map(w => w.total));
  const maxVal = Math.max(...weeks.map(w => w.total), 1);

  const firstEvent = allTimeData?.firstEvent ?? "—";
  const lastEvent = allTimeData?.lastEventDate ?? "—";

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
  h1 { font-size: 1.25rem; font-weight: 600; color: #f1f5f9; margin-bottom: 4px; }
  .subtitle { font-size: 0.8rem; color: #64748b; margin-bottom: 32px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
  .card-label { font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .card-value { font-size: 2rem; font-weight: 700; color: #f1f5f9; line-height: 1; }
  .card-sub { font-size: 0.78rem; color: #64748b; margin-top: 6px; }
  .chart-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  .chart-title { font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-bottom: 20px; }
  .error { background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 16px; color: #fca5a5; font-size: 0.85rem; margin-bottom: 24px; }
  .footer { font-size: 0.72rem; color: #334155; margin-top: 16px; text-align: center; }
</style>
</head>
<body>

<h1>📅 Kit Calendar</h1>
<div class="subtitle">Usage Dashboard · Generated ${new Date().toISOString().substring(0, 16).replace("T", " ")} UTC</div>

${error ? `<div class="error">⚠️ Data fetch error: ${error}</div>` : ""}

<div class="cards">
  <div class="card">
    <div class="card-label">This Week</div>
    <div class="card-value">${thisWeek.toLocaleString()}</div>
    <div class="card-sub">events</div>
  </div>
  <div class="card">
    <div class="card-label">Last Week</div>
    <div class="card-value">${lastWeek.toLocaleString()}</div>
    <div class="card-sub">events</div>
  </div>
  <div class="card">
    <div class="card-label">Week-over-Week</div>
    <div class="card-value" style="color:${wowColor}">${wowPct !== null ? `${wowSign}${wowPct}%` : "—"}</div>
    <div class="card-sub">${wowPct !== null ? (wowPct >= 0 ? "up from last week" : "down from last week") : "no prior data"}</div>
  </div>
  <div class="card">
    <div class="card-label">All-Time</div>
    <div class="card-value">${allTime.toLocaleString()}</div>
    <div class="card-sub">since ${firstEvent}</div>
  </div>
</div>

<div class="chart-card">
  <div class="chart-title">12-Week Trend</div>
  <canvas id="chart" height="80"></canvas>
</div>

<div class="footer">Last event: ${lastEvent} &nbsp;·&nbsp; kit-app-build.vercel.app</div>

<script>
const ctx = document.getElementById('chart').getContext('2d');
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ${labels},
    datasets: [{
      data: ${data},
      backgroundColor: ${data}.map((v, i) => i === ${data}.length - 1 ? '#3b82f6' : '#1e3a5f'),
      borderRadius: 4,
      borderSkipped: false,
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ctx.parsed.y + ' events'
        }
      }
    },
    scales: {
      x: {
        grid: { color: '#1e293b' },
        ticks: { color: '#64748b', font: { size: 11 } }
      },
      y: {
        grid: { color: '#1e293b' },
        ticks: { color: '#64748b', font: { size: 11 }, precision: 0 },
        suggestedMax: ${Math.ceil(maxVal * 1.2)}
      }
    }
  }
});
</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(html);
}
