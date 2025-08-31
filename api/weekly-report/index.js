import { kv } from "@vercel/kv";
import { DateTime } from "luxon";

export default async function handler(req, res) {
  // Handle both POST requests (manual) and GET requests (cron)
  if (req.method === 'GET') {
    // Cron job triggered - use environment variables
    const email = process.env.REPORT_EMAIL;
    const secret = process.env.WEEKLY_REPORT_SECRET;
    
    if (!email) {
      return res.status(500).json({ error: 'REPORT_EMAIL environment variable not set' });
    }
    
    if (!secret) {
      return res.status(500).json({ error: 'WEEKLY_REPORT_SECRET environment variable not set' });
    }
    
    try {
      const report = await generateWeeklyReport();
      await sendEmailReport(email, report);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Weekly report sent successfully via cron',
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

  const { secret, email } = req.body;
  
  // Basic security - you should set this environment variable
  if (secret !== process.env.WEEKLY_REPORT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!email) {
    return res.status(400).json({ error: 'Email address required' });
  }

  try {
    const report = await generateWeeklyReport();
    await sendEmailReport(email, report);
    
    res.status(200).json({ 
      success: true, 
      message: 'Weekly report sent successfully',
      stats: report.summary 
    });
  } catch (error) {
    console.error('Weekly report error:', error);
    res.status(500).json({ error: 'Failed to generate or send report' });
  }
}

async function generateWeeklyReport() {
  const now = DateTime.now();
  const twelveWeeksAgo = now.minus({ weeks: 12 });

  let weeklyTotals = [];
  let thisWeekTotal = 0;
  let lastWeekTotal = 0;

  // Collect data from the past 12 weeks
  for (let weekOffset = 0; weekOffset < 12; weekOffset++) {
    const weekStart = now.minus({ weeks: weekOffset }).startOf('week');
    let weekTotal = 0;
    
    // Sum up 7 days for this week
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = weekStart.plus({ days: dayOffset }).toISODate();
      const key = `usage:${date}`;
      
      try {
        const dayData = await kv.get(key);
        if (dayData && dayData.count) {
          weekTotal += dayData.count;
        }
      } catch (error) {
        console.error(`Error fetching data for ${date}:`, error);
      }
    }

    // Store week data with label (use week ending date for clarity)
    const weekEnd = weekStart.plus({ days: 6 });
    const weekLabel = weekEnd.toFormat('MMM d');
    weeklyTotals.unshift({ // Add to beginning so most recent is last
      week: weekLabel,
      total: weekTotal,
      weekStart: weekStart.toISODate()
    });

    // Track current and previous week for trend calculation
    if (weekOffset === 0) {
      thisWeekTotal = weekTotal;
    } else if (weekOffset === 1) {
      lastWeekTotal = weekTotal;
    }
  }

  // Get all-time total events
  const allTimeEvents = (await kv.get('usage:total'))?.totalEvents || 0;

  // Calculate WoW trend for total events
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
      totalEvents: allTimeEvents,
    },
    weeklyTotals,
  };
}

async function sendEmailReport(email, report) {
  const emailContent = generateEmailHTML(report);
  
  // Option 1: Make.com Webhook (Recommended)
  if (process.env.MAKE_WEBHOOK_URL) {
    try {
      const response = await fetch(process.env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: email,
          subject: `Calendar App Weekly Report - ${report.summary.totalEvents} events this week`,
          html: emailContent,
          text: generatePlainTextReport(report),
          reportData: report // Raw data for Make.com to use
        })
      });
      
      if (response.ok) {
        console.log('✅ Report sent via Make.com webhook');
        return true;
      } else {
        throw new Error(`Make.com webhook failed: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Make.com webhook error:', error);
      // Fall through to other options
    }
  }
  
  // Option 2: Resend.com
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Calendar Reports <reports@yourdomain.com>',
          to: [email],
          subject: `Calendar App Weekly Report - ${report.summary.totalEvents} events this week`,
          html: emailContent
        })
      });
      
      if (response.ok) {
        console.log('✅ Report sent via Resend');
        return true;
      } else {
        throw new Error(`Resend failed: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Resend error:', error);
      // Fall through to logging
    }
  }
  
  // Fallback: Log to console (visible in Vercel function logs)
  console.log('=== WEEKLY CALENDAR APP REPORT ===');
  console.log(`To: ${email}`);
  console.log('Content:', emailContent);
  console.log('📊 Report Data:', JSON.stringify(report, null, 2));
  
  return true;
}

function generatePlainTextReport(report) {
  const { summary, allTime, period } = report;
  const trendSign = summary.totalEventsTrend >= 0 ? '+' : '';

  return `
CALENDAR APP WEEKLY REPORT
Period: ${period.start} to ${period.end}

THIS WEEK'S SUMMARY:
- Events This Week: ${summary.thisWeekTotal}
- Week-over-Week: ${summary.trendIndicator} ${trendSign}${summary.totalEventsTrend}%

ALL-TIME TOTALS:
- Total Events Created: ${allTime.totalEvents}

Generated on ${new Date().toISOString().split('T')[0]}
  `;
}

function generateEmailHTML(report) {
  const { summary, allTime, period, weeklyTotals } = report;
  const trendSign = summary.totalEventsTrend >= 0 ? '+' : '';
  const trendColor = summary.totalEventsTrend >= 0 ? '#34a853' : '#ea4335';

  // Chart dimensions for 12-week trend
  const maxBarHeight = 120;
  const maxEvents = Math.max(...weeklyTotals.map(w => w.total), 1);
  
  // Generate bars for 12-week trend
  const generateWeeklyBars = () => {
    return weeklyTotals.map((week, index) => {
      const barHeight = Math.round((week.total / maxEvents) * maxBarHeight);
      const isCurrentWeek = index === weeklyTotals.length - 1;
      const barColor = isCurrentWeek ? '#4285F4' : '#a0c3ff';
      
      return `
        <td style="width: 8.33%; vertical-align: bottom; padding: 0 2px; text-align: center;">
          <div style="height: ${barHeight}px; background-color: ${barColor}; width: 100%; margin: 0 auto; border-radius: 2px 2px 0 0; min-height: 2px;"></div>
          <div style="font-size: 10px; color: #666; margin-top: 4px; transform: rotate(-45deg); transform-origin: center; white-space: nowrap;">${week.week}</div>
          <div style="font-size: 11px; font-weight: bold; margin-top: 8px;">${week.total}</div>
        </td>
      `;
    }).join('');
  };

  return `
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #333;">
      <h2 style="color: #4285F4;">📅 Kit Weekly Report</h2>
      <p style="color: #666;">Period: ${period.start} to ${period.end}</p>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">📊 This Week's Summary</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="margin: 10px 0; font-size: 16px;"><strong>Events This Week:</strong> ${summary.thisWeekTotal}</li>
          <li style="margin: 10px 0; font-size: 16px;">
            <strong>Week-over-Week:</strong> 
            <span style="font-size: 20px; vertical-align: middle;">${summary.trendIndicator}</span>
            <span style="color: ${trendColor}; font-weight: bold;">${trendSign}${summary.totalEventsTrend}%</span>
          </li>
        </ul>
      </div>

      <div style="margin: 40px 0; overflow-x: auto;">
        <h3 style="text-align: center; margin-bottom: 20px;">📈 12-Week Trend</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tbody>
            <tr style="height: ${maxBarHeight + 60}px;">
              ${generateWeeklyBars()}
            </tr>
          </tbody>
        </table>
        <p style="text-align: center; color: #666; font-size: 12px; margin-top: 10px;">
          Current week highlighted in dark blue
        </p>
      </div>
      
      <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 40px 0; border-left: 4px solid #34a853;">
        <h3 style="margin-top: 0; color: #34a853;">🎯 All-Time Total</h3>
        <p style="font-size: 18px; margin: 0;"><strong>Total Events Created:</strong> ${allTime.totalEvents}</p>
      </div>
      
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
      <p style="color: #666; font-size: 12px;">
        This is an automated report from Kit. 
        <br>Generated on ${new Date().toISOString().split('T')[0]}
      </p>
    </body>
    </html>
  `;
}
