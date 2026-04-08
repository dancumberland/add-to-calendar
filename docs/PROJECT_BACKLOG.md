# Project Backlog

**Last Updated**: 2026-04-07
**Session Context**: See [.claude/INDEX.md](../.claude/INDEX.md)

---

## NEXT (This or Next Session)

- Monitor Friday cron fires correctly with new CRON_SECRET auth
- Evaluate Vercel Hobby plan cron reliability — may need alternative trigger

---

## BACKLOG (Lower Priority)

### Metrics Export Functionality
**Priority**: LOW
**Estimated Effort**: 2-3 hours
**Status**: Ideas stage

Allow exporting historical metrics as CSV for analysis.

**Deliverables**:
- `/api/metrics/export` endpoint
- CSV format with date, count, timezone breakdown
- Date range filtering

### Historical Data Backfill
**Priority**: LOW
**Estimated Effort**: 4-5 hours
**Status**: Research needed

If Vercel logs contain old daily data, implement backfill for Sep-Oct 2025 to populate historical trend.

**Deliverables**:
- Vercel log parser script
- Historical weekly aggregate creation
- Before/after comparison

---

## BLOCKED

### Brisbane Timezone in Kit Dropdown
**Priority**: HIGH (user-facing)
**Status**: Waiting on Kit support
**Blocked by**: Kit platform — timezone picker controlled by Kit, not our app

Brisbane/Queensland isn't in Kit's timezone dropdown. Drafted feature request to support@kit.com on 2026-02-05.

**Workaround for users**: Select Sydney (same GMT+10), but will be off by 1 hour during Sydney's DST months (Oct-Apr).

---

---

## Completed (Apr 7, 2026)

✅ Fixed WoW comparison — now compares last two completed Mon-Sun weeks (was comparing partial current week to full last week)
✅ Added backfill route — `?backfill=true&secret=...&weeks=N` re-aggregates from daily data with `force` option
✅ Backfilled 4 weeks of weekend data (04/05: 239→396, 03/29: 395→460, 03/22: 293→350, 03/15: 317→340)
✅ Secured GET endpoint — requires Vercel CRON_SECRET header or query param (was unauthenticated, bots were triggering reports)
✅ Data reconciliation backlog item completed via backfill route

## Completed (Apr 5, 2026) — Session 2

✅ Cron failure alerts — Slack alert on any Monday test failure (lists tests + errors + dashboard link)
✅ Fixed weekend data gap — `aggregateWeeklyData()` now targets previous completed week (was missing Sat/Sun)
✅ Metrics dashboard — `/api/dashboard` with 12-week Chart.js bar chart and stat cards
✅ Dashboard link in all Slack messages (weekly report + failure alerts)

## Completed (Apr 5, 2026) — Session 1

✅ Fixed Apple Calendar 500 error — removed double decodeURIComponent in ICS endpoint (bug #4)
✅ Built corpus logging system — every Kit request logged to VPS (unlimited retention, JSONL)
✅ Added schema monitor — Slack alert when Kit sends unknown payload keys
✅ Added VPS health check — 4 timezone scenarios, runs Friday 7pm UTC, fetches real ICS
✅ Added canary test — validates DTSTART date accuracy
✅ Added CI gate — HTTP integration tests on every push to main
✅ Replaced BetterStack with self-hosted VPS log receiver, closed BetterStack account
✅ Documented Mode B boundary tolerance (sub-second jitter safe, second-level not)
✅ Created incident runbook (docs/INCIDENT_RUNBOOK.md)
✅ Drafted reply to Ballantyne (Paige Brunton) re: Apple Calendar fix

## Completed (Mar 16, 2026)

✅ Fixed browser TZ ≠ account TZ date-shift bug — max(UTC date, target-TZ date) handles all three Kit date picker modes
✅ Fixed midnight-UTC date-shift bug for US/western users
✅ Migrated ICS serving from Vercel KV to stateless URL generation
✅ Added 4 regression tests (16/16 total passing)
✅ Created project CLAUDE.md and learnings.md for institutional memory
✅ Updated test count: 12 → 16 tests

## Completed (Feb 16, 2026)

✅ Verified automated calendar tests: 12/12 passing, cron configured correctly
✅ Verified weekly analytics aggregation: 10 consecutive weeks with data (83-301 events/week)
✅ Verified all-time total: 7,666 events since Aug 19, 2025, daily tracking active
✅ Confirmed UAE timezone fix working in production with real user traffic
✅ Identified cron alert gap (added to backlog) and weekend data gap (added to backlog)
✅ Fixed UAE/Dubai timezone bug — "Abu Dhabi" mapping missing from TIMEZONE_MAP
✅ Replaced 70-entry timezone map with complete 134-entry Rails ActiveSupport list
✅ Removed dangerous partial-match logic, added GMT offset fallback
✅ Fixed single-digit hour parsing (hh:mm → h:mm)
✅ Added 3 new test cases (Dubai, Dubai with offset, single-digit hours) — 12/12 pass
✅ Deployed fix and replied to Kit support (ticket #69557511)

## Completed (Jan 6, 2026)

✅ Fixed Outlook date format (ISO 8601 with separators)
✅ Fixed timezone date-shift bug (dates showing one day early)
✅ Added Office 365 button for enterprise users
✅ Removed problematic iCal download attribute
✅ Created automated test endpoint (api/test-calendars)
✅ Added weekly test cron job (Mondays 12:00 UTC)
✅ Created test script with email alerts (npm run test-calendars)
✅ Verified all calendar URLs working correctly

## Completed (Nov 29, 2025)

✅ Implemented Option B: persistent weekly aggregates with 365-day TTL
✅ Created utils/analytics.js centralized module
✅ Updated calendar-block API to use trackDailyUsage()
✅ Updated weekly-report API to use analytics functions
✅ Created session documentation (SESSION-INDEX.md)
✅ Renamed all session files to protocol: YYMMDD.HHMM-Name.md
✅ Cleaned up workspace (removed unnecessary files)
✅ Updated architecture.md with analytics layer
✅ Pushed all changes to GitHub  

---

## Notes

- **Primary Location**: `/Users/dancumberland/Documents/Work/AI Projects & Training Docs/Kit_App_Build`
- **Git Remote**: `https://github.com/dancumberland/add-to-calendar.git`
- **Main Branch**: `main` (keep up-to-date with origin)
- **Always Start Here**: Read `sessions/SESSION-INDEX.md` when resuming work

