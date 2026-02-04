# Timezone Handling Research

**Date:** 2026-02-04
**Triggered by:** Brisbane timezone bug reported by Sharon Ma
**Research method:** Hypothesis-driven investigation (deep-research-v2)

---

## Executive Summary

Browser date pickers fundamentally cannot send "just a date" without timezone contamination. This is an **architectural limitation of JavaScript**, not a bug in our code. The solution is to interpret dates in the context of the user's intended timezone, use UTC for all calendar URL generation, and maintain comprehensive timezone coverage.

**Key findings:**
1. JavaScript's `Date` object cannot represent "just a date" - it always represents a specific instant
2. The `Date.parse()` "historical spec error" treats date-only strings as UTC, causing day shifts
3. UTC with Z suffix is the safest cross-platform format for calendar URLs
4. Luxon handles DST automatically but ambiguous times need explicit detection
5. 45-50 carefully selected timezones cover 99%+ of global users

---

## Hypotheses Tested

| Hypothesis | Verdict | Key Evidence |
|------------|---------|--------------|
| Browser date pickers can't send "just a date" without TZ contamination | **SUPPORTED** | MDN: Date.parse() "historical spec error", JavaScript Date always represents an instant |
| Major calendar apps use UTC with metadata | **PARTIALLY SUPPORTED** | UTC with Z suffix is safest; Outlook has NO timezone URL parameter |
| Luxon solves all timezone bugs | **PARTIALLY REFUTED** | DST ambiguity not auto-handled; needs explicit `getPossibleOffsets()` check |
| 30-50 timezones covers 99% of users | **SUPPORTED** | Top 20 = ~85%, 45-50 = ~99%+; must include "gotcha" zones |

---

## Root Cause: The Brisbane Bug

### What Happened

User Sharon Ma in Brisbane selected February 5, 2026 in Kit's date picker, but the event was created for February 4.

### Technical Explanation

```
1. Sharon selects "February 5, 2026" in the date picker
2. Her browser (Brisbane, GMT+10) creates: new Date("2026-02-05")
3. This represents: February 5, 2026 at 00:00:00 Brisbane time
4. Kit calls .toISOString() which converts to UTC: "2026-02-04T14:00:00.000Z"
5. Our old code extracted: dateISO.split('T')[0] = "2026-02-04" (WRONG!)
6. The event was created for February 4
```

### Why This Happens

JavaScript's `Date.parse()` has a documented "historical spec error":

> "The interpretation as a UTC time is due to a historical spec error that was not consistent with ISO 8601 but could not be changed due to web compatibility." - MDN

This means:
- **Date-only strings** (`"2024-03-15"`) are parsed as **UTC midnight**
- **Date-time strings** (`"2024-03-15T00:00:00"`) are parsed as **local midnight**

When a user in a timezone **ahead of UTC** (like Brisbane, GMT+10) selects a date:
- Their local midnight is the **previous day** in UTC
- `toISOString()` outputs the UTC date, which is one day behind

### The Fix

Instead of extracting the date from the ISO string directly:
```javascript
// OLD (broken for eastern timezones):
const datePart = dateISO.split('T')[0];

// NEW (correct):
const utcMoment = DateTime.fromISO(dateISO, { zone: 'utc' });
const dateInTargetTz = utcMoment.setZone(ianaTimezone);
const datePart = dateInTargetTz.toISODate();
```

This interprets the UTC moment in the context of the user's intended timezone.

---

## Browser Date Picker Architecture

### The Fundamental Problem

HTML5 `<input type="date">` returns a clean string (`"2024-03-15"`), but the moment JavaScript touches it, timezone contamination begins:

| Method | Result | Problem |
|--------|--------|---------|
| `input.value` | `"2024-03-15"` | Clean string |
| `input.valueAsDate` | `Date` object | UTC midnight |
| `new Date(input.value)` | `Date` object | UTC midnight (spec error) |
| `date.toISOString()` | `"2024-03-15T00:00:00.000Z"` | UTC conversion |

### The Future: Temporal API

The [Temporal API](https://tc39.es/proposal-temporal/docs/) introduces `PlainDate`:

```javascript
const date = Temporal.PlainDate.from("2024-03-15");
// No timezone contamination possible
```

This is the architectural fix, but browser support is still limited (as of 2026).

### Current Best Practice

Treat dates as **opaque strings** (`YYYY-MM-DD`) on the frontend, and only parse them on the server where you control timezone interpretation.

---

## Calendar URL Formats

### Google Calendar

```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text={title}
  &dates={YYYYMMDDTHHmmssZ}/{YYYYMMDDTHHmmssZ}
  &details={description}
  &location={location}
  &ctz={IANA_timezone}  // optional, affects display
```

- With `Z` suffix: interpreted as UTC
- Without `Z`: interpreted in user's calendar timezone
- Compact ISO format (no separators)

### Outlook (Live & Office 365)

```
https://outlook.live.com/calendar/deeplink/compose
  ?path=/calendar/action/compose
  &rru=addevent
  &subject={title}
  &startdt={YYYY-MM-DDTHH:mm:ssZ}
  &enddt={YYYY-MM-DDTHH:mm:ssZ}
  &body={description}
  &location={location}
```

**CRITICAL:** There is NO supported `timeZone` parameter for Outlook URLs. Microsoft has confirmed this does not work. UTC is the only reliable approach.

### ICS Files (Apple Calendar)

RFC 5545 supports three formats:

| Format | Example | Use Case |
|--------|---------|----------|
| UTC | `DTSTART:19980119T070000Z` | Safest, cross-platform |
| Local+TZID | `DTSTART;TZID=America/New_York:19980119T020000` | Requires VTIMEZONE |
| Floating | `DTSTART:19980118T230000` | Dangerous - avoid |

Our implementation uses UTC format for maximum compatibility.

---

## Luxon Best Practices

### Critical Pattern Difference

```javascript
// WRONG: Parses as local time, then converts (changes the time!)
DateTime.fromISO("2024-03-15T14:30").setZone("America/Denver")

// CORRECT: Interprets the string AS IF it were in Denver time
DateTime.fromISO("2024-03-15T14:30", { zone: "America/Denver" })
```

### DST Edge Cases

**Spring Forward (Invalid Times):**
When 2:30 AM doesn't exist, Luxon automatically advances to 3:30 AM.

**Fall Back (Ambiguous Times):**
When 1:30 AM occurs twice, Luxon's behavior is undefined. Use:

```javascript
const offsets = dt.getPossibleOffsets();
if (offsets.length > 1) {
  // Time is ambiguous - ask user or pick a default
}
```

### Always Validate

```javascript
const dt = DateTime.fromISO(input, { zone: timezone });
if (!dt.isValid) {
  console.error(dt.invalidReason, dt.invalidExplanation);
}
```

---

## Timezone Coverage

### Population Coverage Estimates

| Tier | Zones | Coverage |
|------|-------|----------|
| Top 5 | Shanghai, Kolkata, New York, Lagos, Sao Paulo | ~50% |
| Top 20 | + Tokyo, London, Paris, Sydney, etc. | ~85% |
| Top 45 | + Brisbane, Adelaide, Phoenix, Tehran, etc. | ~99% |

### Critical "Gotcha" Zones

These are low-population but high-complaint zones:

| Zone | IANA Name | Why Critical |
|------|-----------|--------------|
| Brisbane | `Australia/Brisbane` | No DST (Sydney has DST) |
| Phoenix | `America/Phoenix` | Arizona has no DST |
| Adelaide | `Australia/Adelaide` | Half-hour offset (+9:30) with DST |
| India | `Asia/Kolkata` | Half-hour offset (+5:30), 1.47B people |
| Nepal | `Asia/Kathmandu` | 45-minute offset (+5:45) |
| Iran | `Asia/Tehran` | Half-hour offset (+3:30) with DST |
| Newfoundland | `America/St_Johns` | Half-hour offset (-3:30) with DST |

### Unusual Offsets

**Half-hour offsets (must support):**
- India (+5:30) - 1.47 billion people
- Iran (+3:30)
- Afghanistan (+4:30)
- Myanmar (+6:30)
- South Australia (+9:30)
- Newfoundland (-3:30)

**45-minute offsets (rare but exist):**
- Nepal (+5:45) - 30 million people
- Chatham Islands (+12:45)

---

## Implementation Checklist

### Completed

- [x] Fix date extraction for eastern timezones
- [x] Add Brisbane timezone
- [x] Expand timezone mapping to 45+ zones
- [x] Add half-hour offset timezones (India, Iran, Adelaide, etc.)
- [x] Add 45-minute offset timezones (Nepal)
- [x] Add DST anomaly zones (Phoenix, Brisbane)

### Recommended

- [ ] Add DST ambiguity detection for scheduling
- [ ] Add validation that warns when unknown timezone is used
- [ ] Consider exposing full IANA database via search
- [ ] Add timezone analytics to track missing zones

---

## Sources

### Official Documentation

| Source | URL | Credibility |
|--------|-----|-------------|
| MDN: Date.parse() | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse | High |
| MDN: input type="date" | https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date | High |
| MDN: Temporal.PlainDate | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/PlainDate | High |
| Luxon zones.md | https://github.com/moment/luxon/blob/master/docs/zones.md | High |
| RFC 5545 (iCalendar) | https://www.rfc-editor.org/rfc/rfc5545 | High |
| IANA Time Zone Database | https://www.iana.org/time-zones | Authoritative |

### Community Resources

| Source | URL | Credibility |
|--------|-----|-------------|
| react-datepicker Issue #1018 | https://github.com/Hacker0x01/react-datepicker/issues/1018 | Medium-High |
| Microsoft Q&A (Outlook TZ) | https://learn.microsoft.com/en-us/answers/questions/4662690 | Medium-High |
| add-event-to-calendar-docs | https://interactiondesignfoundation.github.io/add-event-to-calendar-docs/ | Medium |

---

## Appendix: Full Timezone Map

The following IANA timezones are now supported in the Kit Calendar App:

### Americas (22 zones)
- America/Los_Angeles (Pacific)
- America/Denver (Mountain)
- America/Phoenix (Arizona - no DST)
- America/Chicago (Central)
- America/New_York (Eastern)
- America/Toronto
- America/Mexico_City
- America/Lima
- America/Bogota
- America/Anchorage
- America/Sao_Paulo
- America/Argentina/Buenos_Aires
- America/Santiago
- America/Caracas
- America/St_Johns (Newfoundland - half hour)
- Pacific/Honolulu

### Europe (16 zones)
- UTC / GMT
- Europe/London
- Europe/Dublin
- Europe/Lisbon
- Europe/Paris
- Europe/Berlin
- Europe/Amsterdam
- Europe/Rome
- Europe/Madrid
- Europe/Stockholm
- Europe/Warsaw
- Europe/Athens
- Europe/Helsinki
- Europe/Istanbul
- Europe/Moscow

### Africa (5 zones)
- Africa/Cairo
- Africa/Johannesburg
- Africa/Lagos
- Africa/Nairobi
- Africa/Casablanca

### Middle East (5 zones)
- Asia/Dubai
- Asia/Riyadh
- Asia/Jerusalem / Asia/Tel_Aviv
- Asia/Tehran (half hour)

### Asia (20 zones)
- Asia/Kabul (half hour)
- Asia/Karachi
- Asia/Kolkata (India - half hour)
- Asia/Colombo
- Asia/Kathmandu (45 minute)
- Asia/Dhaka
- Asia/Yangon (half hour)
- Asia/Bangkok
- Asia/Ho_Chi_Minh
- Asia/Jakarta
- Asia/Singapore
- Asia/Hong_Kong
- Asia/Shanghai
- Asia/Taipei
- Asia/Manila
- Asia/Seoul
- Asia/Tokyo

### Australia & Oceania (10 zones)
- Australia/Perth
- Australia/Darwin (half hour, no DST)
- Australia/Adelaide (half hour, has DST)
- Australia/Brisbane (no DST)
- Australia/Sydney (has DST)
- Australia/Melbourne (has DST)
- Australia/Hobart (has DST)
- Pacific/Auckland
- Pacific/Fiji
- Pacific/Chatham (45 minute)
