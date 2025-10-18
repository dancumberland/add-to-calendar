# Timezone Issue Investigation Summary

**Date**: September 30, 2025  
**Status**: Diagnostic logging deployed - awaiting test data  
**Deployment**: https://kit-app-build-5oz1f5kqp-dan-cumberlands-projects.vercel.app

## Problem Statement

Calendar events created with Dubai/Gulf Standard Time (GMT+4) appear **one day earlier** in Google Calendar when the creator's system timezone also matches GMT+4.

**Example**:
- **Input**: October 8, 2025 @ 7:00 PM - 8:00 PM (GMT+4)
- **Expected**: October 8, 2025 @ 7:00 PM in Google Calendar
- **Actual**: October 7, 2025 @ 7:00 PM in Google Calendar

## Investigation Approach

### 1. Analyzed 5-7 Possible Root Causes

**High Likelihood** (⭐⭐⭐):
- **Date Picker UTC Conversion Issue**: The code currently parses the incoming date as UTC and extracts just the date part. If Kit sends a date that's already been adjusted for timezone, this creates an off-by-one error.
- **Timezone-Naive String Construction**: Building date strings without proper timezone context.

**Medium Likelihood** (⭐⭐):
- Google Calendar URL format issues
- ICS file timezone handling (UTC-only format)

**Low Likelihood** (⭐):
- Kit editor date format inconsistencies
- Luxon library bugs
- Browser/system timezone interference

### 2. Primary Hypothesis

The issue is likely in this code section (`api/calendar-block/index.js`, line 96):

```javascript
const datePart = DateTime.fromISO(dateISO, { zone: 'utc' }).toISODate();
```

**Theory**: 
- If Kit sends `"2025-10-08T00:00:00Z"` (representing Oct 8 at midnight UTC), we extract "2025-10-08" ✓
- But if Kit sends `"2025-10-07T20:00:00Z"` (Oct 8 midnight in GMT+4, already converted to UTC), we extract "2025-10-07" ❌

This would cause the entire event to be shifted one day earlier.

### 3. Diagnostic Logging Added

Comprehensive logging now captures:

#### Input Data
- Raw `dateISO` from Kit editor
- Start/end times and AM/PM
- Target timezone
- Event title

#### Date Parsing
- `datePart` after UTC conversion
- Original dateISO parsed as UTC
- Original dateISO parsed in target timezone (for comparison)

#### DateTime Construction
- Full date/time strings constructed
- Luxon DateTime objects created
- ISO format representation
- UTC conversion results
- Validation status

#### URL Generation
- Google Calendar start/end times (UTC format)
- Complete URLs for Google, Outlook, and ICS

All logs are prefixed with `🔍 TIMEZONE DEBUG` for easy filtering in Vercel logs.

## Next Steps

### 1. Request Test Case from Kit Team

Email Rohan requesting:
- Create a test event with the exact same parameters:
  - **Date**: October 8, 2025
  - **Time**: 7:00 PM - 8:00 PM
  - **Timezone**: Dubai / Gulf Standard Time (GMT+4)
  - **Title**: "Timezone Test - Dubai GMT+4"
- Trigger the plugin to generate calendar buttons
- Provide the approximate timestamp of the test

### 2. Collect Diagnostic Data

- Access Vercel function logs at: https://vercel.com/dan-cumberlands-projects/kit-app-build/logs
- Filter for `🔍 TIMEZONE DEBUG` entries
- Analyze the exact format of `dateISO` received from Kit
- Confirm which hypothesis is correct

### 3. Implement Fix

Based on the diagnostic data, likely solutions:

**Option A**: Parse date in target timezone instead of UTC
```javascript
const datePart = DateTime.fromISO(dateISO, { zone: tz }).toISODate();
```

**Option B**: Extract date without timezone conversion
```javascript
const datePart = dateISO.split('T')[0]; // Simple string split
```

**Option C**: Use a different date parsing strategy based on Kit's actual format

### 4. Validate Fix

Test with multiple timezone scenarios:
- ✅ Dubai GMT+4 (original issue)
- ✅ Tokyo GMT+9 (large positive offset)
- ✅ New York GMT-5 (negative offset)
- ✅ London GMT+0 (zero offset)
- ✅ Sydney GMT+10 (large positive offset)
- ✅ Los Angeles GMT-8 (large negative offset)

### 5. Deploy and Confirm

- Deploy fix to production
- Request Kit team to retest
- Monitor for any new edge cases

## Technical Details

### Current Code Flow

1. **Input**: Kit sends `dateISO`, `start_time`, `start_ampm`, `end_time`, `end_ampm`, `tz`
2. **Parse Date**: Extract date part from ISO string (currently using UTC)
3. **Construct String**: Build "YYYY-MM-DD HH:MM AM/PM" string
4. **Parse with Timezone**: Use Luxon to parse string in target timezone
5. **Convert to UTC**: Generate UTC timestamps for calendar URLs
6. **Generate URLs**: Create Google, Outlook, and ICS links

### Key Files

- `api/calendar-block/index.js` - Main calendar generation logic
- `utils/buildIcs.js` - ICS file generation (RFC 5545 format)

### Dependencies

- `luxon` v3.4.4 - DateTime manipulation
- `@vercel/kv` - Temporary storage for ICS files
- `uuid` - Unique IDs for ICS files

## Email Draft for Kit Team

---

**Subject**: Re: Timezone Issue Investigation - Diagnostic Logging Deployed

Hi Rohan,

Thanks for the detailed bug report! I've investigated the timezone issue and deployed diagnostic logging to identify the root cause.

**Analysis Summary**:

I've identified 5-7 possible sources of the problem and narrowed it down to 2 most likely causes:

1. **Date Picker UTC Conversion Issue** (most likely): The code currently parses the incoming date as UTC and extracts just the date part. If Kit's date picker sends a date that's already been adjusted for the user's timezone, this creates an off-by-one error.

2. **Timezone-Naive String Construction**: The way we're building date strings might not properly account for timezone context.

**Next Steps**:

To validate my hypothesis and implement the correct fix, I need your help collecting diagnostic data:

1. **Create a test event** in the Kit editor with these exact parameters:
   - **Date**: October 8, 2025
   - **Time**: 7:00 PM - 8:00 PM  
   - **Timezone**: Dubai / Gulf Standard Time (GMT+4)
   - **Title**: "Timezone Test - Dubai GMT+4"

2. **Trigger the plugin** to generate the calendar buttons

3. **Send me the approximate timestamp** of when you created the test (e.g., "Oct 30, 2025 at 3:45 PM PT")

I've added comprehensive logging that will capture:
- The exact format of the date/time data Kit sends
- How it's being parsed at each step
- The final UTC timestamps being generated

Once I see the logs, I'll be able to confirm the root cause and implement the correct fix. I expect this will be a quick fix once we have the data - likely just changing how we parse the initial date from Kit.

I'll also test the fix across multiple timezones (positive and negative offsets) to ensure it works universally.

Let me know if you have any questions!

Best,
Dan

---

## Resources

- **Vercel Logs**: https://vercel.com/dan-cumberlands-projects/kit-app-build/logs
- **Deployment**: https://kit-app-build-5oz1f5kqp-dan-cumberlands-projects.vercel.app
- **Session Log**: `sessions/2025-09-30-1538-timezone-investigation.md`
- **Luxon Docs**: https://moment.github.io/luxon/
- **RFC 5545 (iCalendar)**: https://tools.ietf.org/html/rfc5545
