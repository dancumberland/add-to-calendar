# Session: Timezone Investigation - Dubai GMT+4 Issue

- Type: bugfix/investigation
- Scope: Calendar timezone handling
- Date: 2025-09-30 15:38 MDT
- Location: Kit_App_Build
- Branch: main
- Status: Investigation phase - diagnostic logging added

## Problem Report

**From**: Rohan (Kit Team)  
**Issue**: Calendar events created with Dubai/Gulf Standard Time (GMT+4) appear one day earlier in Google Calendar

**Expected Behavior**:
- Creator sets: October 8, 2025 @ 7:00 PM - 8:00 PM (GMT+4)
- Google Calendar should show: October 8, 2025 @ 7:00 PM

**Actual Behavior**:
- Google Calendar shows: October 7, 2025 @ 7:00 PM
- Off by exactly one day

**Key Observation**: The mismatch appears when the user's system timezone matches the event timezone (GMT+4)

## Analysis: 5-7 Possible Root Causes

### High Likelihood Issues

1. **Date Picker UTC Conversion Issue** ⭐⭐⭐
   - Location: `api/calendar-block/index.js` line 96
   - Code: `DateTime.fromISO(dateISO, { zone: 'utc' }).toISODate()`
   - Problem: Kit editor sends ISO date string, we parse as UTC and extract date
   - If Kit sends "2025-10-08T00:00:00Z" (midnight UTC) but means "Oct 8 in GMT+4", this creates off-by-one error
   - GMT+4 is 4 hours ahead, so Oct 8 midnight in GMT+4 = Oct 7 20:00 UTC

2. **Timezone-Naive String Construction** ⭐⭐
   - Location: Lines 99-104
   - Code: Constructs `"2025-10-08 07:00 PM"` then applies timezone
   - If datePart is wrong from issue #1, this compounds the error
   - Luxon should handle this correctly, but edge cases possible

### Medium Likelihood Issues

3. **Google Calendar URL Format**
   - Google expects UTC timestamps in `YYYYMMDDTHHmmssZ` format
   - We convert correctly, but if input DateTime is wrong, output is wrong
   - This is likely a symptom, not the root cause

4. **ICS File Timezone Handling**
   - `buildIcs()` converts everything to UTC (no timezone preservation)
   - ICS format: `DTSTART:20251008T150000Z` (UTC only)
   - Apple Calendar might interpret this differently than intended

### Low Likelihood Issues

5. **Kit Editor Date Format**
   - Kit might send dates in unexpected format
   - Timezone info might already be baked into the ISO string

6. **Luxon Library Bug**
   - Version 3.4.4 might have timezone handling issues
   - Unlikely but possible

7. **Browser/System Timezone Interference**
   - Kit editor's date picker influenced by browser timezone
   - Could affect how ISO date string is generated

## Most Likely Root Cause

**Primary Hypothesis**: Date picker UTC conversion issue (Issue #1)

The problem is likely on line 96 where we parse the incoming `dateISO` as UTC and extract just the date part. 

**Theory**: 
- Kit editor sends: `"2025-10-08T00:00:00Z"` (representing "Oct 8" in some timezone)
- We parse as UTC: Oct 8 at midnight UTC
- Extract date: "2025-10-08"
- Construct: "2025-10-08 07:00 PM" in GMT+4
- Convert to UTC: Oct 8 19:00 GMT+4 = Oct 8 15:00 UTC ✓ (correct)

BUT if Kit actually sends the date already adjusted:
- Kit editor sends: `"2025-10-07T20:00:00Z"` (Oct 8 midnight in GMT+4, expressed in UTC)
- We parse as UTC: Oct 7 at 20:00 UTC
- Extract date: "2025-10-07" ❌ (WRONG!)
- Construct: "2025-10-07 07:00 PM" in GMT+4
- Result: One day off

**Secondary Hypothesis**: We should be parsing the date in the target timezone, not UTC.

## Diagnostic Logging Added

Added comprehensive console logging to validate assumptions:

### Input Logging
- Raw `dateISO` from Kit
- `start_time`, `start_ampm`, `end_time`, `end_ampm`
- Target timezone `tz`
- Event title

### Date Parsing Logging
- `datePart` after UTC conversion
- Original dateISO parsed as UTC
- Original dateISO parsed in target timezone (for comparison)

### String Construction Logging
- `fullStartString` and `fullEndString`

### Luxon DateTime Logging
- `startDateTime` and `endDateTime` objects
- ISO format
- UTC conversion
- Validation status

### URL Generation Logging
- Google Calendar start/end times (UTC format)
- Complete Google Calendar URL
- Complete Outlook URL
- ICS URL

## Next Steps

1. **Deploy with diagnostic logging**
   ```bash
   vercel --prod
   ```

2. **Request test case from Kit team**
   - Ask Rohan to create a test event with:
     - Date: October 8, 2025
     - Time: 7:00 PM - 8:00 PM
     - Timezone: Dubai (GMT+4)
   - Collect Vercel function logs

3. **Analyze logs to identify**
   - Exact format of `dateISO` from Kit
   - Whether date extraction is causing the issue
   - Confirm which hypothesis is correct

4. **Implement fix** based on findings
   - Likely solution: Parse date in target timezone instead of UTC
   - Alternative: Adjust date extraction logic
   - Test with multiple timezones (GMT+, GMT-, GMT)

5. **Validate fix**
   - Test with Dubai GMT+4 (original issue)
   - Test with other positive offsets (GMT+8, GMT+10)
   - Test with negative offsets (GMT-5, GMT-8)
   - Test with GMT/UTC (edge case)

## Files Modified

- `api/calendar-block/index.js` - Added diagnostic logging (lines 95-131, 169-194)

## Testing Strategy

Once logs are collected:
1. Identify exact input format from Kit
2. Create local test cases with same format
3. Verify fix works for all timezone offsets
4. Deploy and confirm with Kit team

## References

- Luxon documentation: https://moment.github.io/luxon/
- RFC 5545 (iCalendar): https://tools.ietf.org/html/rfc5545
- Google Calendar URL parameters: https://github.com/InteractionDesignFoundation/add-event-to-calendar-docs/blob/main/services/google.md

---

## Update: Systematic Diagnosis Approach Applied

After initial investigation, we applied the Systematic Error Diagnosis Workflow:

### Testing Results
- ✅ Tested from Mexico City GMT-6 → All conversions correct
- ✅ Changed computer timezone to Dubai GMT+4 → Still correct
- ✅ Tested multiple timezones (Dubai, Sydney, Hawaii) → All correct
- ❌ **Cannot reproduce the reported bug**

### Key Finding
The bug is **not reproducible** through direct API testing, which suggests:
1. Issue is specific to Kit's UI/platform
2. Kit might be preprocessing dates before sending to our API
3. Different data format sent by Kit vs our test payloads

### Enhanced Logging Deployed
Added additional diagnostic logging:
- Request metadata (User-Agent, Origin, Referer)
- Raw JSON of full settings object
- Type checking for dateISO
- Enhanced date format inspection

### Next Phase
**Blocked**: Need Kit team to create test event through their UI so we can:
1. Capture actual data Kit sends to our API
2. Compare Kit's payload to our test payloads
3. Identify where the discrepancy occurs
4. Implement targeted fix based on evidence

**Action Required**: Email Kit team requesting test event creation and log timestamp

---

**Status**: Phase 5 of Systematic Diagnosis - Awaiting validation test data from Kit team
