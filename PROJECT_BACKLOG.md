# Project Backlog

**Last Updated**: 2025-11-29 13:50  
**Session Context**: See [sessions/SESSION-INDEX.md](./sessions/SESSION-INDEX.md)

---

## NEXT (This or Next Session)

### Verify Weekly Analytics Aggregation
**Priority**: CRITICAL
**Estimated Effort**: 1-2 hours
**Status**: Ready to start

Confirm that the new weekly aggregation system is working correctly and producing accurate email reports.

**Deliverables**:
- Verify next weekly email (Dec 5) shows full 12-week trend with no zeros
- Check all-time total matches sum of weekly aggregates
- Validate Week-over-week calculations are accurate
- Monitor Vercel logs for any aggregation errors

**Dependencies**:
- ✅ Weekly aggregates implemented (analytics.js complete)
- ✅ Email report updated to use aggregates
- ❌ First aggregation run (will happen Dec 1 at week boundary)

**Test Checklist**:
- [ ] Manual report generation: `POST /api/weekly-report` works
- [ ] Cron trigger runs: `GET /api/weekly-report` executes
- [ ] Next email contains all 12 weeks of data
- [ ] Historical gap (Sep-Oct) is now populated

---

## SOON (1-2 Weeks)

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

(None currently)

---

## Completed (This Session - Nov 29)

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

