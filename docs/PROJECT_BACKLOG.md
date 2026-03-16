# Project Backlog

**Last Updated**: 2026-03-16
**Session Context**: See [.claude/INDEX.md](../.claude/INDEX.md)

---

## NEXT (This or Next Session)

### Add Cron Failure Alerts to Test Endpoint
**Priority**: HIGH
**Estimated Effort**: 1-2 hours
**Status**: Ready

The cron-triggered test endpoint (`/api/test-calendars`) runs silently — it returns JSON results but doesn't send failure alerts. The alert/email logic lives only in the CLI script (`scripts/test-calendar-integrations.js`). Add failure alerting directly to the API endpoint so the Monday cron actually notifies on test failures.

**Deliverables**:
- Add email/webhook alert to `/api/test-calendars` when any test fails
- Use existing MAKE_WEBHOOK_URL or REPORT_EMAIL env vars
- Keep the endpoint working as-is for manual GET requests

**Dependencies**:
- ✅ Test endpoint working (12/12 pass)
- ✅ Alert env vars configured (MAKE_WEBHOOK_URL, REPORT_EMAIL)

---

### Fix Weekend Data Gap in Weekly Aggregation
**Priority**: MEDIUM
**Estimated Effort**: 1 hour
**Status**: Ready

The Friday cron creates weekly aggregates for the current ISO week (Mon-Sun), but runs on Friday — so Saturday and Sunday data is never included. Options: run aggregation on Monday for the prior week, or re-aggregate the prior week on each run.

**Deliverables**:
- Weekly aggregates include full Mon-Sun data
- WoW comparisons remain accurate
- Backfill current aggregates if approach changes

**Dependencies**:
- ✅ Weekly aggregation working
- ✅ Data verified via KV inspection

---

### Add Metrics Dashboard
**Priority**: HIGH
**Estimated Effort**: 4-6 hours
**Status**: Design phase

Create a simple admin dashboard to view real-time metrics and historical trends.

**Deliverables**:
- `/api/dashboard` endpoint returning analytics data
- Simple HTML page showing weekly trends and all-time stats
- Quick link to last 4 weeks of data

**Dependencies**:
- ✅ Analytics module complete
- ✅ Data being tracked consistently
- ❌ Need authentication/security for admin access

---

## BACKLOG (Lower Priority)

### Data Reconciliation for Missed Weeks
**Priority**: MEDIUM
**Estimated Effort**: 3-4 hours
**Status**: Planning

If any weekly aggregations fail, implement a reconciliation process to backfill missing weeks.

**Deliverables**:
- Script to detect missing weekly aggregates
- Manual aggregation trigger endpoint
- Health check endpoint reporting aggregation status

**Dependencies**:
- ✅ Weekly aggregates working
- ❌ Need monitoring/alerts first

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

