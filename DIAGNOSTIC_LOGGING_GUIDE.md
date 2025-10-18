# Diagnostic Logging Guide - Timezone Issue

## How to Access Logs

1. **Vercel Dashboard**: https://vercel.com/dan-cumberlands-projects/kit-app-build
2. Navigate to: **Functions** → **api/calendar-block** → **Logs**
3. Filter by: `🔍 TIMEZONE DEBUG`

## Log Output Format

When a calendar event is created, you'll see output like this:

```
🔍 TIMEZONE DEBUG - Input from Kit:
  dateISO: 2025-10-08T00:00:00Z
  start_time: 07:00 PM
  end_time: 08:00 PM
  timezone: Asia/Dubai
  title: Timezone Test - Dubai GMT+4

🔍 TIMEZONE DEBUG - Date parsing:
  datePart (after UTC conversion): 2025-10-08
  Original dateISO parsed as UTC: 2025-10-08T00:00:00.000Z
  Original dateISO parsed in target TZ: 2025-10-08T04:00:00.000+04:00

🔍 TIMEZONE DEBUG - String construction:
  fullStartString: 2025-10-08 07:00 PM
  fullEndString: 2025-10-08 08:00 PM

🔍 TIMEZONE DEBUG - Luxon DateTime objects:
  startDateTime: 2025-10-08T19:00:00.000+04:00
  startDateTime (ISO): 2025-10-08T19:00:00.000+04:00
  startDateTime (UTC): 2025-10-08T15:00:00.000Z
  startDateTime.isValid: true
  endDateTime: 2025-10-08T20:00:00.000+04:00
  endDateTime (ISO): 2025-10-08T20:00:00.000+04:00
  endDateTime (UTC): 2025-10-08T16:00:00.000Z
  endDateTime.isValid: true

🔍 TIMEZONE DEBUG - URL generation:
  Google start (UTC): 20251008T150000Z
  Google end (UTC): 20251008T160000Z
  Google Calendar URL: https://calendar.google.com/calendar/render?action=TEMPLATE&text=...
  Outlook URL: https://outlook.live.com/owa/?path=...
  ICS URL: https://kit-app-build.vercel.app/api/ics/abc123
🔍 TIMEZONE DEBUG - End of diagnostic logging
==========================================
```

## What to Look For

### 1. Input Date Format
**Key Question**: What format does Kit send for `dateISO`?

**Expected formats**:
- `2025-10-08T00:00:00Z` (midnight UTC)
- `2025-10-08T00:00:00+04:00` (midnight in GMT+4)
- `2025-10-08` (date only, no time)

**Red flags**:
- If `dateISO` shows Oct 7 when creator selected Oct 8
- If timezone offset is already baked into the ISO string

### 2. Date Part Extraction
**Key Question**: Does `datePart` match the intended date?

**Check**:
- `datePart (after UTC conversion): 2025-10-08`
- Should match the date the creator selected in Kit

**Red flags**:
- If `datePart` is "2025-10-07" when creator selected Oct 8
- This indicates the UTC conversion is causing the off-by-one error

### 3. Timezone Comparison
**Key Question**: How does parsing differ between UTC and target timezone?

**Compare these two lines**:
- `Original dateISO parsed as UTC: 2025-10-08T00:00:00.000Z`
- `Original dateISO parsed in target TZ: 2025-10-08T04:00:00.000+04:00`

**Analysis**:
- If both show Oct 8, the date is correct
- If UTC shows Oct 7 but target TZ shows Oct 8, we have the bug

### 4. Final DateTime Objects
**Key Question**: Are the final DateTime objects correct?

**Check**:
- `startDateTime: 2025-10-08T19:00:00.000+04:00` (7 PM in GMT+4)
- `startDateTime (UTC): 2025-10-08T15:00:00.000Z` (3 PM UTC = 7 PM GMT+4)

**Math check**:
- GMT+4 means 4 hours ahead of UTC
- 7 PM GMT+4 = 3 PM UTC (19:00 - 4:00 = 15:00) ✓
- If this math doesn't work out, we have the bug

### 5. Google Calendar URL
**Key Question**: What UTC timestamp is being sent to Google?

**Check**:
- `Google start (UTC): 20251008T150000Z`
- This should be: Oct 8, 2025 at 15:00 UTC (3 PM UTC = 7 PM GMT+4)

**Red flags**:
- If it shows `20251007T...` (Oct 7), the date is wrong
- If the time doesn't match the expected UTC conversion

## Expected vs. Buggy Output

### ✅ CORRECT Output (What We Want)

```
dateISO: 2025-10-08T00:00:00Z
datePart: 2025-10-08
startDateTime: 2025-10-08T19:00:00.000+04:00
startDateTime (UTC): 2025-10-08T15:00:00.000Z
Google start (UTC): 20251008T150000Z
```

### ❌ BUGGY Output (Current Issue)

```
dateISO: 2025-10-07T20:00:00Z  ← Kit already converted to UTC!
datePart: 2025-10-07  ← Wrong date extracted!
startDateTime: 2025-10-07T19:00:00.000+04:00  ← One day off!
startDateTime (UTC): 2025-10-07T15:00:00.000Z  ← One day off!
Google start (UTC): 20251007T150000Z  ← Shows Oct 7 instead of Oct 8!
```

## Likely Fix Scenarios

### Scenario 1: Kit Sends Date-Only String
If `dateISO` is just `"2025-10-08"` (no time component):

**Fix**: Don't parse as UTC, just use the string directly
```javascript
const datePart = dateISO.split('T')[0]; // Simple string split
```

### Scenario 2: Kit Sends UTC with Timezone Offset
If `dateISO` is `"2025-10-07T20:00:00Z"` (already in UTC):

**Fix**: Parse in target timezone instead of UTC
```javascript
const datePart = DateTime.fromISO(dateISO, { zone: tz }).toISODate();
```

### Scenario 3: Kit Sends Local Midnight
If `dateISO` is `"2025-10-08T00:00:00"` (no timezone):

**Fix**: Parse as-is without timezone conversion
```javascript
const datePart = DateTime.fromISO(dateISO).toISODate();
```

## Testing Checklist

After implementing the fix, test with:

- [ ] **Dubai GMT+4** (original issue)
- [ ] **Tokyo GMT+9** (large positive offset)
- [ ] **Sydney GMT+10** (crosses date line)
- [ ] **London GMT+0** (zero offset)
- [ ] **New York GMT-5** (negative offset)
- [ ] **Los Angeles GMT-8** (large negative offset)
- [ ] **Samoa GMT-11** (extreme negative offset)

For each test:
1. Create event for "Tomorrow at 7 PM" in that timezone
2. Check Google Calendar shows correct date
3. Check Apple Calendar (.ics) shows correct date
4. Check Outlook shows correct date

## Quick Reference: Timezone Math

| Timezone | Offset | Example: 7 PM Local | UTC Equivalent |
|----------|--------|---------------------|----------------|
| Dubai (GST) | GMT+4 | 19:00 | 15:00 UTC |
| Tokyo (JST) | GMT+9 | 19:00 | 10:00 UTC |
| London (GMT) | GMT+0 | 19:00 | 19:00 UTC |
| New York (EST) | GMT-5 | 19:00 | 00:00 UTC (next day) |
| Los Angeles (PST) | GMT-8 | 19:00 | 03:00 UTC (next day) |

**Key Rule**: 
- Positive offset (GMT+X): Subtract X hours to get UTC
- Negative offset (GMT-X): Add X hours to get UTC

## Contact

If you need help interpreting the logs, contact Dan Cumberland at dan.cumberland@gmail.com
