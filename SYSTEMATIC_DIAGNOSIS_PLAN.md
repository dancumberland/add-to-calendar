# Systematic Error Diagnosis Plan - Timezone Issue

**Date**: September 30, 2025  
**Status**: Phase 5 - Ready for validation tests  
**Deployment**: https://kit-app-build-fymlau2pz-dan-cumberlands-projects.vercel.app

---

## Phase 1: Problem Definition ✅ COMPLETE

### Observable Problem
- **Error**: Calendar events created with Dubai GMT+4 show one day earlier in Google Calendar
- **Reported by**: Kit team (Rohan)
- **When**: Unknown exact date, but recent
- **Expected**: Oct 8 @ 7 PM Dubai → Shows Oct 8 in Google Calendar
- **Actual** (per report): Oct 8 @ 7 PM Dubai → Shows Oct 7 in Google Calendar
- **Reproducible by us**: ❌ NO

### Environmental Context
- **Recent changes**: None to timezone logic (last change: Sept 26 - email template)
- **Dependencies**: luxon v3.4.4 (stable, no recent updates)
- **Platform**: Vercel serverless functions
- **Testing results**:
  - ✅ Direct API tests from Mexico City GMT-6 → All correct
  - ✅ Computer timezone changed to Dubai → Still correct
  - ❌ Kit team tests through Kit UI → Bug reported

---

## Phase 2: Hypothesis Generation ✅ COMPLETE

### All 7 Hypotheses Generated:

1. **Kit Editor Date Picker Sends Different Format** ⭐⭐⭐ HIGH
2. **Browser-Specific Date Parsing Issue** ⭐⭐ MEDIUM
3. **Kit Platform Preprocessing the Date** ⭐⭐⭐ HIGH
4. **Cached/Stale Response** ⭐ LOW
5. **User Error in Bug Report** ⭐⭐ MEDIUM
6. **Google Calendar Display Bug** ⭐ LOW
7. **Specific Date/Time Combination Edge Case** ⭐⭐ MEDIUM

---

## Phase 3: Hypothesis Prioritization ✅ COMPLETE

### Top 2 Selected Hypotheses:

#### Hypothesis #1: Kit Editor Date Picker Format Issue
**Likelihood**: HIGH ⭐⭐⭐  
**Impact**: Critical  
**Ease of testing**: Easy

**Theory**: When events are created through Kit's UI (not direct API), the date picker sends a different ISO format that our code mishandles.

**Evidence**:
- Our direct API tests work perfectly
- Kit team's UI tests fail
- This is the primary difference between test methods

**How to validate**:
- Get Kit team to create event through their UI
- Check diagnostic logs for exact `dateISO` format received
- Compare to expected format

#### Hypothesis #2: Kit Platform Preprocessing
**Likelihood**: HIGH ⭐⭐⭐  
**Impact**: Critical  
**Ease of testing**: Hard (requires Kit cooperation)

**Theory**: Kit's platform preprocesses/transforms dates before sending to our API, and this transformation is timezone-dependent.

**Evidence**:
- We test API directly, they use Kit's UI
- Kit platform sits between user and our API
- Could explain timezone-specific behavior

**How to validate**:
- Ask Kit team what their platform sends to our API
- Compare Kit's request payload to our test payloads
- Check if Kit does date transformation

---

## Phase 4: Strategic Logging ✅ COMPLETE

### Logging Added:

#### Request Metadata (NEW)
```javascript
console.log('🔍 TIMEZONE DEBUG - Request metadata:');
console.log('  Method:', req.method);
console.log('  User-Agent:', req.headers['user-agent']);
console.log('  Origin:', req.headers['origin']);
console.log('  Referer:', req.headers['referer']);
console.log('  Request timestamp:', new Date().toISOString());
```

#### Input Data (ENHANCED)
```javascript
console.log('🔍 TIMEZONE DEBUG - Input from Kit:');
console.log('  dateISO:', dateISO);
console.log('  dateISO type:', typeof dateISO);
console.log('  dateISO raw value:', JSON.stringify(dateISO));
console.log('  start_time:', start_time, start_ampm);
console.log('  end_time:', end_time, end_ampm);
console.log('  timezone:', tz);
console.log('  title:', title);
console.log('  Full settings object:', JSON.stringify(settings, null, 2));
```

#### Date Parsing
```javascript
console.log('🔍 TIMEZONE DEBUG - Date parsing:');
console.log('  datePart (after UTC conversion):', datePart);
console.log('  Original dateISO parsed as UTC:', ...);
console.log('  Original dateISO parsed in target TZ:', ...);
```

#### DateTime Objects
```javascript
console.log('🔍 TIMEZONE DEBUG - Luxon DateTime objects:');
console.log('  startDateTime:', startDateTime.toString());
console.log('  startDateTime (ISO):', startDateTime.toISO());
console.log('  startDateTime (UTC):', startDateTime.toUTC().toString());
// ... etc
```

#### URL Generation
```javascript
console.log('🔍 TIMEZONE DEBUG - URL generation:');
console.log('  Google start (UTC):', formatDateForGoogle(startDateTime));
console.log('  Google Calendar URL:', googleUrl.toString());
// ... etc
```

### Deployment Status:
✅ **Deployed to production**: https://kit-app-build-fymlau2pz-dan-cumberlands-projects.vercel.app

---

## Phase 5: Execute Validation Tests ⏳ IN PROGRESS

### Critical Next Steps:

#### Step 1: Request Kit Team Test ⚠️ **ACTION REQUIRED**

**Email to send to Rohan:**

---

**Subject**: Timezone Issue - Need Your Help to Collect Diagnostic Data

Hi Rohan,

I've done a systematic investigation of the timezone issue and deployed comprehensive diagnostic logging. I've tested extensively from my end and cannot reproduce the bug, which suggests it's specific to how Kit's platform sends data to our API.

**I need your help to collect diagnostic data:**

1. **Create a test event through Kit's UI** with these exact details:
   - **Date**: October 8, 2025
   - **Time**: 7:00 PM - 8:00 PM
   - **Timezone**: Dubai / Gulf Standard Time (GMT+4)
   - **Title**: "Timezone Debug Test - Oct 8"
   - **Location**: "Test"

2. **After creating the event**, send me:
   - Screenshot of what you see in the Kit editor
   - Screenshot of what appears in Google Calendar (showing the wrong date)
   - Approximate timestamp of when you created it (e.g., "Sept 30, 2025 at 4:30 PM Dubai time")

3. **I'll check the server logs** to see exactly what data Kit's platform sent to our API

The logs will show me:
- The exact format of the date Kit sends
- Whether Kit is preprocessing the date before sending it
- Where the timezone conversion is going wrong

Once I see the actual data Kit sends, I'll know exactly how to fix it.

**Alternative test** (if you have time):
- Try creating the same event but with **New York timezone** instead of Dubai
- See if that one works correctly
- This would tell us if the issue is specific to positive GMT offsets

Thanks for your help!

Best,
Dan

---

#### Step 2: Monitor Vercel Logs

Once Kit team creates the test event:

1. **Access logs**: https://vercel.com/dan-cumberlands-projects/kit-app-build/logs
2. **Filter for**: `🔍 TIMEZONE DEBUG`
3. **Look for the test event** (search for "Timezone Debug Test")
4. **Capture all log output** for that request

#### Step 3: Analyze Log Data

**Key questions to answer from logs:**

1. **What is the exact format of `dateISO`?**
   - Is it: `2025-10-08T00:00:00Z` (expected)
   - Or: `2025-10-07T20:00:00Z` (problematic)
   - Or: `2025-10-08` (date only)
   - Or: Something else?

2. **What does `datePart` become after extraction?**
   - Should be: `2025-10-08`
   - If it's: `2025-10-07` → We found the bug!

3. **What are the final UTC timestamps?**
   - Google start should be: `20251008T150000Z` (Oct 8, 3 PM UTC)
   - If it's: `20251007T150000Z` → Confirms one day off

4. **What is the User-Agent and Origin?**
   - Tells us what browser/platform Kit is using
   - Might reveal Kit-specific preprocessing

#### Step 4: Validate or Invalidate Hypotheses

Based on log analysis:

**If `dateISO` is `2025-10-07T20:00:00Z`:**
- ✅ **CONFIRMED**: Hypothesis #1 or #2 (Kit sends wrong format)
- **Root cause**: Kit is converting "Oct 8 midnight in Dubai" to UTC before sending
- **Fix**: Parse date in target timezone, not UTC

**If `dateISO` is `2025-10-08T00:00:00Z` but `datePart` is `2025-10-07`:**
- ✅ **CONFIRMED**: Our parsing logic has a bug
- **Root cause**: Luxon parsing issue or edge case
- **Fix**: Change date extraction method

**If logs show correct values but Google Calendar shows wrong date:**
- ✅ **CONFIRMED**: Hypothesis #6 (Google Calendar bug)
- **Root cause**: Not our issue
- **Action**: Report to Google or find workaround

**If we can't reproduce even with Kit team's help:**
- ✅ **CONFIRMED**: Hypothesis #4 or #5 (cache or user error)
- **Action**: Ask for more details or close as cannot reproduce

---

## Phase 6: Root Cause Identification ⏳ PENDING

**Waiting for**: Log data from Kit team's test

**Once confirmed**, document:
- Exact root cause
- Why it wasn't caught earlier
- Conditions that trigger it
- Scope of impact

---

## Phase 7: Implement & Verify Fix ⏳ PENDING

### Likely Fix Scenarios:

#### Scenario A: Kit Sends Date Already in UTC
**If** `dateISO` is `2025-10-07T20:00:00Z` (Oct 8 midnight Dubai = Oct 7 8PM UTC)

**Fix**:
```javascript
// Change from:
const datePart = DateTime.fromISO(dateISO, { zone: 'utc' }).toISODate();

// To:
const datePart = DateTime.fromISO(dateISO, { zone: tz }).toISODate();
```

**Reasoning**: Parse the date in the target timezone, not UTC

#### Scenario B: Need to Extract Date Differently
**If** our parsing logic has edge cases

**Fix**:
```javascript
// Change from:
const datePart = DateTime.fromISO(dateISO, { zone: 'utc' }).toISODate();

// To:
const datePart = dateISO.split('T')[0]; // Simple string split
```

**Reasoning**: Avoid timezone conversion entirely for date extraction

#### Scenario C: Kit Sends Inconsistent Formats
**If** Kit sends different formats in different scenarios

**Fix**: Add format detection and handle multiple cases
```javascript
let datePart;
if (dateISO.includes('T')) {
  // Has time component - parse in target timezone
  datePart = DateTime.fromISO(dateISO, { zone: tz }).toISODate();
} else {
  // Date only - use as-is
  datePart = dateISO;
}
```

### Testing Plan for Fix:
- [ ] Test with Dubai GMT+4 (original issue)
- [ ] Test with Tokyo GMT+9 (large positive offset)
- [ ] Test with New York GMT-5 (negative offset)
- [ ] Test with UTC GMT+0 (zero offset)
- [ ] Test with early morning times (1 AM, 2 AM)
- [ ] Test with late night times (11 PM, midnight)
- [ ] Test through Kit UI (not just direct API)

---

## Phase 8: Post-Mortem & Prevention ⏳ PENDING

**To be completed after fix is deployed and verified**

### Will document:
- Root cause
- Why it happened
- How it was discovered
- Time to resolution
- Preventive measures

### Will add:
- Automated tests for this scenario
- Better error messages
- Monitoring/alerts if needed
- Updated documentation

---

## Current Status Summary

✅ **Completed**:
- Problem definition
- Hypothesis generation (7 hypotheses)
- Hypothesis prioritization (top 2 selected)
- Strategic logging implementation
- Production deployment with enhanced logs

⏳ **In Progress**:
- Waiting for Kit team to create test event
- Need to analyze logs to validate hypotheses

⏸️ **Blocked**:
- Cannot proceed without real data from Kit's platform
- Our tests show everything working correctly

---

## Quick Action Items

**Immediate** (Today):
- [ ] Send email to Kit team requesting test event
- [ ] Prepare to monitor Vercel logs

**Within 24-48 hours**:
- [ ] Receive test event from Kit team
- [ ] Analyze logs
- [ ] Validate/invalidate hypotheses
- [ ] Identify root cause

**After root cause identified**:
- [ ] Implement targeted fix
- [ ] Test thoroughly
- [ ] Deploy to production
- [ ] Verify with Kit team
- [ ] Document and create memory

---

## Log Access

- **Vercel Dashboard**: https://vercel.com/dan-cumberlands-projects/kit-app-build
- **Direct Logs**: https://vercel.com/dan-cumberlands-projects/kit-app-build/logs
- **Filter**: `🔍 TIMEZONE DEBUG`

---

## Contact

**Kit Team Contact**: Rohan (rohan@kit.com - assumed)  
**Our Deployment**: https://kit-app-build-fymlau2pz-dan-cumberlands-projects.vercel.app
