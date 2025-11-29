# Session: Timezone Fix - System Timezone vs Event Timezone

- Type: bugfix
- Scope: Timezone handling in calendar generation
- Date: 2025-10-01 14:43 MDT
- Location: Kit_App_Build
- Branch: main
- Status: Fix deployed, awaiting Kit team verification

## Summary

Fixed critical timezone bug where events appeared one day off when the user's system timezone differed from the event timezone. Root cause: parsing date in UTC instead of target timezone.

## Problem Statement

**Reported by**: Kit team (Rohan & Trung)  
**First reported**: September 23, 2025

**Issue**: Calendar events created with Dubai GMT+4 showed one day earlier (Oct 7 instead of Oct 8) when:
- User's system timezone was set to GMT+4 (Dubai)
- Event timezone was also set to GMT+4 (Dubai)

**Key insight from Trung**:
> "The issue is dependent on what time zone the user has set on their system when viewing the editor and adding the date"

## Root Cause Analysis

### The Bug

When Kit's date picker sends a date, it encodes it relative to the user's **system timezone**, not the **event timezone**.

**Example scenario**:
- User in Dubai (GMT+4) selects "October 8, 2025" in date picker
- Kit sends: `"2025-10-07T20:00:00Z"` (Oct 8 midnight Dubai = Oct 7 8PM UTC)
- Our code parsed this as UTC: `DateTime.fromISO(dateISO, { zone: 'utc' })`
- Extracted date: `"2025-10-07"` ❌ **WRONG!**
- Should be: `"2025-10-08"` ✅

### Why It Only Appeared in Certain Cases

**Worked correctly when**:
- User in Pacific Time (GMT-8) creates Dubai event
- Kit sends: `"2025-10-08T08:00:00Z"` (Oct 8 midnight Pacific = Oct 8 8AM UTC)
- Parsing as UTC gives: `"2025-10-08"` ✅ **CORRECT!**

**Failed when**:
- User in positive GMT offset timezone creates event in same timezone
- Date gets shifted backward by one day

## The Fix

### Code Change

**File**: `api/calendar-block/index.js`  
**Line**: 116

**Before**:
```javascript
// The date picker returns a full ISO string in UTC. We just need the date part.
const datePart = DateTime.fromISO(dateISO, { zone: 'utc' }).toISODate();
```

**After**:
```javascript
// The date picker returns a full ISO string. Parse it in the target timezone to get the correct date.
// This handles cases where the user's system timezone differs from the event timezone.
const datePart = DateTime.fromISO(dateISO, { zone: tz }).toISODate();
```

### Why This Works

By parsing the date in the **target timezone** (the event's timezone), we correctly interpret what date the user intended, regardless of their system timezone.

**Example with fix**:
- User in Dubai selects Oct 8
- Kit sends: `"2025-10-07T20:00:00Z"`
- Parse in Dubai timezone: `DateTime.fromISO("2025-10-07T20:00:00Z", { zone: 'Asia/Dubai' })`
- This correctly interprets it as Oct 8 midnight in Dubai
- Extract date: `"2025-10-08"` ✅ **CORRECT!**

## Investigation Process

### Systematic Diagnosis Workflow Applied

1. ✅ **Problem Definition**: Documented exact error and reproduction steps
2. ✅ **Hypothesis Generation**: Generated 7 possible root causes
3. ✅ **Hypothesis Prioritization**: Narrowed to top 2 most likely
4. ✅ **Strategic Logging**: Added comprehensive diagnostic logging
5. ✅ **Validation**: Kit team provided detailed reproduction steps
6. ✅ **Root Cause Identification**: Confirmed via Trung's detailed testing
7. ✅ **Fix Implementation**: Single-line change to parse in target timezone
8. ⏳ **Verification**: Awaiting Kit team confirmation

### Key Testing That Led to Discovery

**Initial tests** (couldn't reproduce):
- Tested from Mexico City GMT-6 → All correct
- Changed computer to Dubai time → Still correct
- Tested multiple timezones → All correct

**Breakthrough** (Trung's email):
- Tested **while system timezone was Dubai GMT+4**
- Created event **for Dubai GMT+4**
- Bug appeared: Oct 7 instead of Oct 8

This revealed the issue was **system timezone dependent**, not just event timezone dependent.

## Changes Made

### Code Files
- `api/calendar-block/index.js`:
  - Line 116: Changed date parsing from UTC to target timezone
  - Lines 118-122: Updated diagnostic logging to show comparison
  - Lines 65-71: Added request metadata logging (from earlier investigation)
  - Lines 104-112: Enhanced input logging (from earlier investigation)

### Documentation Files Created
- `sessions/2025-09-30-1538-timezone-investigation.md` - Initial investigation
- `TIMEZONE_ISSUE_SUMMARY.md` - Investigation summary
- `DIAGNOSTIC_LOGGING_GUIDE.md` - Log interpretation guide
- `SYSTEMATIC_DIAGNOSIS_PLAN.md` - Workflow tracking
- `sessions/2025-10-01-1443-timezone-fix-deployed.md` - This file

## Validation Plan

### Test Cases to Verify

**Priority 1: Original Bug Scenario**
- [ ] User in Dubai GMT+4 creates event for Oct 8 @ 7 PM Dubai
- [ ] Expected: Shows Oct 8 in Google Calendar
- [ ] Previously showed: Oct 7 ❌

**Priority 2: Other Positive Offsets**
- [ ] User in Tokyo GMT+9 creates event for same timezone
- [ ] User in Sydney GMT+11 creates event for same timezone

**Priority 3: Negative Offsets**
- [ ] User in New York GMT-5 creates event for Dubai GMT+4
- [ ] User in Los Angeles GMT-8 creates event for Tokyo GMT+9

**Priority 4: Edge Cases**
- [ ] User in GMT+4 creates event for GMT-5 (opposite direction)
- [ ] Early morning times (1 AM, 2 AM)
- [ ] Late night times (11 PM, midnight)

### Verification Steps

1. **Kit team tests** with original scenario
2. **Check diagnostic logs** to confirm correct date extraction
3. **Verify Google Calendar** shows correct date
4. **Test Apple Calendar** (.ics) shows correct date
5. **Test Outlook** shows correct date

## Deployment

**Deployed**: October 1, 2025 @ 2:43 PM MDT  
**URL**: https://kit-app-build-ribetd45n-dan-cumberlands-projects.vercel.app  
**Vercel Inspect**: https://vercel.com/dan-cumberlands-projects/kit-app-build/DdFVctk1CUMQoEtsEgQ63jafEkDx

## Response to Kit Team

Email sent requesting verification with original test case.

## Lessons Learned

### What Worked Well
1. **Systematic diagnosis workflow** prevented premature fixes
2. **Comprehensive logging** helped understand the issue
3. **Kit team's detailed testing** (especially Trung) revealed the exact scenario
4. **Persistence in testing** multiple scenarios

### What Could Be Improved
1. **Initial testing didn't cover system timezone variations** - should have tested with system timezone matching event timezone
2. **Assumed Kit sent consistent date format** - didn't consider system timezone impact on date picker

### Prevention
- ✅ Fix deployed addresses root cause
- ✅ Diagnostic logging remains for future issues
- 🔄 Consider adding automated tests for timezone edge cases
- 🔄 Document timezone handling in code comments

## Next Steps

1. ✅ **Email sent to Kit team** - Awaiting verification from Trung
2. ⏳ **Monitor logs** for any unexpected behavior
3. ⏳ **Remove diagnostic logging** once verified (optional - could keep for monitoring)
4. ✅ **Update SESSION_INDEX.md** with this fix
5. 🔄 **Consider adding timezone tests** to prevent regression

## Email Response Sent

**To**: Trung Nguyen, Rohan Raj  
**Sent**: October 1, 2025 @ 3:19 PM MDT  
**Subject**: Re: Timezone Issue - Fixed

Brief, direct email in Dan's voice:
- Acknowledged Trung's excellent detective work
- Explained the issue was system timezone dependent
- Described the one-line fix (parse in target timezone vs UTC)
- Requested verification testing
- Thanked them for thorough bug report

Email kept technical details minimal, focused on what matters.

## Technical Details

### Luxon DateTime Behavior

When parsing an ISO string with timezone:
```javascript
// UTC parsing (old way)
DateTime.fromISO("2025-10-07T20:00:00Z", { zone: 'utc' })
// Returns: Oct 7, 8:00 PM UTC

// Target timezone parsing (new way)
DateTime.fromISO("2025-10-07T20:00:00Z", { zone: 'Asia/Dubai' })
// Returns: Oct 8, 12:00 AM Dubai (correctly interprets as next day)
```

### Why This Matters

The `.toISODate()` method extracts just the date part. If we parse in UTC, we get the UTC date. If we parse in the target timezone, we get the date in that timezone - which is what the user intended.

---

**Status**: Fix deployed, awaiting Kit team verification
