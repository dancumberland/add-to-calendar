// ABOUTME: Analytics tracking and aggregation for usage metrics
// ABOUTME: Stores daily metrics (short-lived) and weekly aggregates (persistent)

import { kv } from "@vercel/kv";
import { DateTime } from "luxon";

// Track daily usage with event details
export async function trackDailyUsage(data) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `usage:daily:${today}`;

    // Get existing data or initialize
    const existing = await kv.get(key) || {
      count: 0,
      timezones: {},
      eventTypes: {},
      withLocation: 0
    };

    // Update daily metrics
    existing.count++;
    existing.timezones[data.timezone] = (existing.timezones[data.timezone] || 0) + 1;
    existing.eventTypes[data.eventType] = (existing.eventTypes[data.eventType] || 0) + 1;
    if (data.hasLocation) existing.withLocation++;

    // Store daily data with 30-day expiration (for detailed breakdown)
    await kv.set(key, existing, { ex: 2592000 });

    // Update all-time total counter (no expiration)
    const totalKey = 'usage:total';
    const totalData = await kv.get(totalKey) || {
      totalEvents: 0,
      firstEvent: today,
      allTimeTimezones: {},
      allTimeEventTypes: {},
      allTimeWithLocation: 0
    };

    totalData.totalEvents++;
    totalData.allTimeTimezones[data.timezone] = (totalData.allTimeTimezones[data.timezone] || 0) + 1;
    totalData.allTimeEventTypes[data.eventType] = (totalData.allTimeEventTypes[data.eventType] || 0) + 1;
    if (data.hasLocation) totalData.allTimeWithLocation++;
    totalData.lastEventDate = today;

    await kv.set(totalKey, totalData);

  } catch (error) {
    console.error('Daily usage tracking error:', error);
    throw error;
  }
}

// Aggregate daily data into weekly totals
// Call this at end of week to lock in historical data
export async function aggregateWeeklyData(targetDate = null) {
  try {
    // Use provided date or today
    const now = DateTime.fromISO(targetDate || new Date().toISOString().split('T')[0]);

    // Get the week ending date (Sunday)
    const weekEnd = now.endOf('week');
    const weekStart = weekEnd.minus({ days: 6 });

    const weekKey = `usage:weekly:${weekEnd.toISODate()}`;

    // Check if week already aggregated
    const existing = await kv.get(weekKey);
    if (existing) {
      return { status: 'already_aggregated', week: weekEnd.toISODate() };
    }

    // Sum up all daily data for this week
    let weekTotal = 0;
    let timezones = {};
    let eventTypes = {};
    let withLocation = 0;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = weekStart.plus({ days: dayOffset }).toISODate();
      const dayKey = `usage:daily:${date}`;

      try {
        const dayData = await kv.get(dayKey);
        if (dayData) {
          weekTotal += dayData.count;
          withLocation += dayData.withLocation;

          // Merge timezone data
          Object.entries(dayData.timezones).forEach(([tz, count]) => {
            timezones[tz] = (timezones[tz] || 0) + count;
          });

          // Merge event type data
          Object.entries(dayData.eventTypes).forEach(([type, count]) => {
            eventTypes[type] = (eventTypes[type] || 0) + count;
          });
        }
      } catch (error) {
        console.error(`Error aggregating data for ${date}:`, error);
      }
    }

    // Store weekly aggregate with 365-day expiration (1 year)
    const weeklyData = {
      weekEnd: weekEnd.toISODate(),
      weekStart: weekStart.toISODate(),
      count: weekTotal,
      timezones,
      eventTypes,
      withLocation,
      aggregatedAt: new Date().toISOString()
    };

    await kv.set(weekKey, weeklyData, { ex: 31536000 }); // 365 days

    console.log(`Weekly aggregate created for week ending ${weekEnd.toISODate()}: ${weekTotal} events`);

    return {
      status: 'aggregated',
      week: weekEnd.toISODate(),
      count: weekTotal
    };

  } catch (error) {
    console.error('Weekly aggregation error:', error);
    throw error;
  }
}

// Get 12-week trend data
// Prefers weekly aggregates (persistent) over daily data (expiring)
export async function getTwelveWeekTrend() {
  try {
    const now = DateTime.now();
    let weeklyTotals = [];
    let thisWeekTotal = 0;
    let lastWeekTotal = 0;

    // Look back 12 weeks
    for (let weekOffset = 0; weekOffset < 12; weekOffset++) {
      const weekEnd = now.minus({ weeks: weekOffset }).endOf('week');
      const weekStart = weekEnd.minus({ days: 6 });

      let weekTotal = 0;

      // Try weekly aggregate first (persistent)
      try {
        const weeklyKey = `usage:weekly:${weekEnd.toISODate()}`;
        const weeklyData = await kv.get(weeklyKey);

        if (weeklyData) {
          weekTotal = weeklyData.count;
        } else {
          // Fallback to summing daily data if aggregate doesn't exist yet
          for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const date = weekStart.plus({ days: dayOffset }).toISODate();
            const dayKey = `usage:daily:${date}`;

            try {
              const dayData = await kv.get(dayKey);
              if (dayData && dayData.count) {
                weekTotal += dayData.count;
              }
            } catch (error) {
              console.error(`Error fetching daily data for ${date}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching week data for ${weekEnd.toISODate()}:`, error);
      }

      // Format week label using end date
      const weekLabel = weekEnd.toFormat('MMM d');
      weeklyTotals.unshift({
        week: weekLabel,
        total: weekTotal,
        weekStart: weekStart.toISODate(),
        weekEnd: weekEnd.toISODate()
      });

      // Track current and previous week
      if (weekOffset === 0) {
        thisWeekTotal = weekTotal;
      } else if (weekOffset === 1) {
        lastWeekTotal = weekTotal;
      }
    }

    return {
      weeklyTotals,
      thisWeekTotal,
      lastWeekTotal
    };

  } catch (error) {
    console.error('Error getting 12-week trend:', error);
    throw error;
  }
}

// Get all-time statistics
export async function getAllTimeStats() {
  try {
    const totalKey = 'usage:total';
    const totalData = (await kv.get(totalKey)) || {
      totalEvents: 0,
      allTimeTimezones: {},
      allTimeEventTypes: {},
      allTimeWithLocation: 0
    };

    return {
      totalEvents: totalData.totalEvents,
      firstEvent: totalData.firstEvent,
      lastEventDate: totalData.lastEventDate,
      allTimeTimezones: totalData.allTimeTimezones,
      allTimeEventTypes: totalData.allTimeEventTypes,
      allTimeWithLocation: totalData.allTimeWithLocation
    };
  } catch (error) {
    console.error('Error getting all-time stats:', error);
    throw error;
  }
}