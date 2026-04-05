import { DateTime } from "luxon";
import { getTwelveWeekTrend, getAllTimeStats, aggregateWeeklyData } from "../../utils/analytics.js";

export default async function handler(req, res) {
  // Handle both POST requests (manual) and GET requests (cron)
  if (req.method === 'GET') {
    // Cron job triggered - use environment variables
    const secret = process.env.WEEKLY_REPORT_SECRET;

    if (!secret) {
      return res.status(500).json({ error: 'WEEKLY_REPORT_SECRET environment variable not set' });
    }

    try {
      // Aggregate last week's data before generating report
      const aggregateResult = await aggregateWeeklyData();
      console.log('Weekly aggregation:', aggregateResult);

      const report = await generateWeeklyReport();
      await sendSlackReport(report);

      return res.status(200).json({
        success: true,
        message: 'Weekly report sent to Slack via cron',
        aggregation: aggregateResult,
        stats: report.summary
      });
    } catch (error) {
      console.error('Cron job error:', error);
      return res.status(500).json({ error: 'Failed to send weekly report', details: error.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { secret } = req.body;

  if (secret !== process.env.WEEKLY_REPORT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Aggregate last week's data before generating report
    const aggregateResult = await aggregateWeeklyData();
    console.log('Weekly aggregation:', aggregateResult);

    const report = await generateWeeklyReport();
    await sendSlackReport(report);

    res.status(200).json({
      success: true,
      message: 'Weekly report sent to Slack',
      aggregation: aggregateResult,
      stats: report.summary
    });
  } catch (error) {
    console.error('Weekly report error:', error);
    res.status(500).json({ error: 'Failed to generate or send report' });
  }
}

async function generateWeeklyReport() {
  const now = DateTime.now();
  const trendData = await getTwelveWeekTrend();
  const allTimeData = await getAllTimeStats();

  // Calculate WoW trend for total events
  const lastWeekTotal = trendData.lastWeekTotal;
  const thisWeekTotal = trendData.thisWeekTotal;
  const totalEventsTrend = lastWeekTotal > 0
    ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
    : (thisWeekTotal > 0 ? 100 : 0);

  const getTrendIndicator = (trend) => {
    if (trend > 5) return '↗️';
    if (trend < -5) return '↘️';
    return '➡️';
  };

  return {
    period: {
      start: now.minus({ days: 7 }).toISODate(),
      end: now.minus({ days: 1 }).toISODate(),
    },
    summary: {
      thisWeekTotal,
      lastWeekTotal,
      totalEventsTrend,
      trendIndicator: getTrendIndicator(totalEventsTrend),
    },
    allTime: {
      totalEvents: allTimeData.totalEvents,
    },
    weeklyTotals: trendData.weeklyTotals,
  };
}

async function sendSlackReport(report) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('❌ SLACK_WEBHOOK_URL not set — falling back to console log');
    console.log('📊 Report Data:', JSON.stringify(report, null, 2));
    return true;
  }

  const { summary, allTime, period, weeklyTotals } = report;
  const trendSign = summary.totalEventsTrend >= 0 ? '+' : '';

  // Horizontal bar chart — last 8 weeks, plain text (no code block to avoid orange styling)
  const recent8 = weeklyTotals.slice(-8);
  const maxVal = Math.max(...recent8.map(w => w.total), 1);
  const barWidth = 12;
  // Convert "Mar 1" → "03/01" for consistent digit-width alignment
  const MONTHS = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                   Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
  const padLabel = (label) => {
    const parts = label.split(' ');
    if (parts.length === 2 && MONTHS[parts[0]]) {
      return `${MONTHS[parts[0]]}/${parts[1].padStart(2, '0')}`;
    }
    return label;
  };
  const maxCount = Math.max(...recent8.map(w => w.total));
  const countWidth = String(maxCount).length;
  const chartRows = recent8.map((w, i) => {
    const filled = Math.max(Math.round((w.total / maxVal) * barWidth), 1);
    const empty = barWidth - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const count = String(w.total).padStart(countWidth);
    const isLatest = i === recent8.length - 1;
    const isLastWeek = i === recent8.length - 2;
    const suffix = isLatest ? '  ← this week' : (isLastWeek ? '  ← last week' : '');
    return `${padLabel(w.week)}  ${bar}  ${count}${suffix}`;
  }).join('\n');

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📅 Add-to-Calendar for Kit — Weekly Report',
          emoji: true,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${period.start} → ${period.end}`,
          },
        ],
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Events This Week*\n${summary.thisWeekTotal}`,
          },
          {
            type: 'mrkdwn',
            text: `*Week-over-Week*\n${summary.trendIndicator} ${trendSign}${summary.totalEventsTrend}%`,
          },
          {
            type: 'mrkdwn',
            text: `*All-Time Total*\n${allTime.totalEvents.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Last Week*\n${summary.lastWeekTotal}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*8-Week Trend*\n${chartRows}`,
        },
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    console.log('✅ Weekly report posted to Slack');
    return true;
  } else {
    const text = await response.text();
    throw new Error(`Slack webhook failed: ${response.status} — ${text}`);
  }
}
