# Kit Calendar — Input/Output Specification

**Version**: 1.0  
**Date**: 2026-04-04  
**Source of truth**: This document. Tests in `api/test-calendars/index.js` derive from it.

---

## What This Document Is

Kit's calendar block API is undocumented and unstable. This spec captures everything known about its behavior from direct observation, failure reports, and three rounds of bug fixes. It is written to force the question: "what is correct when X ≠ Y?" — the question that would have caught Bugs 2 and 3 before users did.

---

## Input Contract

### Endpoint

`POST /api/calendar-block`

Body: `{ "settings": { ... } }`

### Known Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | Yes | Event title |
| `date` | string | Yes | ISO 8601 — see Date Modes below |
| `start_time` | string | Yes | `HH:MM` (12-hour, no AM/PM) |
| `start_ampm` | string | Yes | `"AM"` or `"PM"` |
| `end_time` | string | Yes | `HH:MM` (12-hour, no AM/PM) |
| `end_ampm` | string | Yes | `"AM"` or `"PM"` |
| `tz` | string | Yes | Rails ActiveSupport timezone name (see Timezone section) |
| `location` | string | No | Event location |
| `description` | string | No | Event description. **May contain `%` signs** — do not re-decode. |
| `background_color` | string | No | Hex color, default `#4285F4` |
| `text_color` | string | No | Hex color, default `#FFFFFF` |
| `size` | string | No | `"small"`, `"medium"`, `"large"` |
| `rounded_corners` | string | No | CSS value e.g. `"4px"` |
| `alignment` | string | No | `"left"`, `"center"`, `"right"`, or flex values |

**Schema monitor**: If Kit sends a field not in this list, a Slack alert fires. Check `kit_schema_change` events in Vercel logs.

---

## The Three Kit Date Modes

Kit's date picker does not have a documented API contract. The following three modes have been observed in production. A fourth mode ("Mode D") has not been seen but cannot be ruled out.

### Mode B — Date-Only or Midnight UTC

**When it occurs**: Kit account timezone is UTC, or the user's browser sends the date as a plain date string.

**What Kit sends**:
```
"date": "2026-03-18"                      // plain date string
"date": "2026-03-18T00:00:00.000Z"        // midnight UTC timestamp
```

**Invariant**: The UTC date component IS the intended event date. The time zone of the *viewer* is irrelevant.

**Correct behavior**: Use the UTC date directly. `2026-03-18T00:00:00.000Z` → event is on March 18.

**Bug this fixed**: [Bug 2, Kirstin] Eastern timezone users were shifted one day back. `2026-03-18T00:00:00.000Z` in Eastern (UTC-4) → March 17 20:00 → wrong date.

**Detection**: `dateISO` has no `T`, OR UTC hour/minute/second are all zero.

---

### Mode A — Midnight-Local-as-UTC (Non-Midnight UTC)

**When it occurs**: Most users. Kit's browser-side code takes the user's local midnight and encodes it as UTC.

**What Kit sends**:
```
"date": "2026-04-14T14:00:00.000Z"   // Brisbane user selected Apr 15
"date": "2026-04-15T08:00:00.000Z"   // Pacific user selected Apr 15
"date": "2026-04-15T04:00:00.000Z"   // Eastern user selected Apr 15 (during DST)
```

**Invariant**: The local date in the *user's browser timezone* at the sent UTC timestamp is the intended event date.

**Correct behavior**: Convert UTC → target timezone, extract the date. `2026-04-14T14:00:00.000Z` in Brisbane (UTC+10) → April 15 00:00 AEST → event is on April 15.

**Detection**: UTC timestamp has a non-zero time component (not midnight UTC).

---

### Mode C — Browser TZ ≠ Kit Account TZ

**When it occurs**: User's Kit account timezone (set in Kit settings) differs from the browser's local timezone.

**What Kit sends**: Same format as Mode A, but the UTC offset corresponds to the *browser* timezone, not the Kit account timezone.

**Example**: Kit account set to Eastern. User is in Brisbane. Selects April 15. Browser encodes midnight Brisbane as UTC: `2026-04-14T14:00:00.000Z`. Target TZ is Eastern, not Brisbane.

**Invariant**: Convert the UTC timestamp to the *target* timezone (the Kit account's timezone, as specified in the `tz` field) and extract the date. The `max()` guard is a tie-breaker for near-midnight edge cases only — not the primary algorithm.

**Correct behavior**: `dateInTargetTz = utcMoment.setZone(ianaTimezone)` → extract date. The `max(utcDate, tzDate)` guard handles the rare case where rounding puts the UTC date and target-TZ date on different sides of midnight; taking the later one is always correct.

Example — Brisbane browser / Eastern Kit account, selects April 15:
- Kit sends `2026-04-14T14:00:00.000Z` (midnight Brisbane = UTC-14 hours)
- Convert to Eastern: April 14 10:00 AM EDT → date = April 14
- Convert to UTC date: April 14
- max(April 14, April 14) → April 14

This is correct: the user's Kit account is set to Eastern, so the event is on April 14 Eastern time. The browser (Brisbane) encoded the wrong midnight, but the target-TZ conversion recovers the right date.

**Code reference**: `api/calendar-block/index.js`, date parsing section (`dateInTargetTz = utcMoment.setZone(ianaTimezone)`).

**Bug this fixed**: [Bug 3] User with Brisbane browser but Eastern Kit account was getting wrong dates.

---

## Timezone Mapping

Kit sends Rails ActiveSupport timezone names (e.g., `"Eastern Time (US & Canada)"`, `"Abu Dhabi"`). These are mapped to IANA timezone names via `mapTimezoneToIANA()` in `api/calendar-block/index.js`.

134 entries are mapped. If a timezone is not in the map, it is used as-is (may fail with Luxon).

**Test coverage**: Pacific, Eastern, Brisbane/AU (ahead of UTC), Dubai/UAE (Rails non-standard name).

---

## Output Contract

### Success Response (HTTP 200)

```json
{
  "code": 200,
  "html": "<table>...</table>"
}
```

The `html` field contains a table-based layout with four anchor links:
- **Google Calendar**: `https://calendar.google.com/calendar/render?action=TEMPLATE&...`
- **Apple Calendar**: `https://{host}/api/ics?title=...&start=...&end=...`
- **Outlook**: `https://outlook.live.com/calendar/deeplink/compose?rru=addevent&...`
- **Office 365**: `https://outlook.office.com/calendar/deeplink/compose?rru=addevent&...`

All calendar dates are in UTC (`YYYYMMDD'T'HHmmss'Z'` for Google, ISO 8601 for Outlook).

### Error Response (HTTP 200 with code 500)

Kit requires HTTP 200 even for errors:

```json
{
  "code": 500,
  "errors": ["error message here"]
}
```

### Placeholder Response (incomplete settings)

When required fields are missing (design mode):

```json
{
  "code": 200,
  "html": "<div style=\"border: 1px dashed #ccc;...\">Add your event details in the sidebar --></div>"
}
```

---

## ICS Endpoint

`GET /api/ics?title=...&start=...&end=...&location=...&description=...`

**Critical**: `req.query` is already URL-decoded by the framework. Do NOT call `decodeURIComponent()` on query parameters. This was Bug 4 (Ballantyne): double-decode threw `URIError: URI malformed` when descriptions contained `%` characters.

Response: `text/calendar` with RFC 5545 VCALENDAR content.

---

## Known Failure Classes

| # | Date | Who Reported | Mode | Root Cause | Fix |
|---|------|-------------|------|-----------|-----|
| 1 | 2025-12 | Brisbane user | A | UTC→TZ conversion missing for ahead-of-UTC timezones | Implement timezone conversion |
| 2 | 2026-03 | Kirstin (Paige Brunton) | B | Mode B not detected; midnight UTC shifted by TZ offset | Detect midnight UTC, use UTC date directly |
| 3 | 2026-03 | US TZ user | C | Browser TZ ≠ Kit account TZ edge case | `max(utcDate, targetTZDate)` |
| 4 | 2026-04 | Ballantyne (Paige Brunton) | — | Double `decodeURIComponent` on ICS query params | Remove redundant decode calls |

All four were reported by users before any internal detection.

---

## What Could Still Break

1. **Mode D**: Kit changes date encoding format in a way not covered by Modes A-C. Detection: schema monitor will fire if payload keys change; corpus logs will show unusual `detected_mode` patterns.

2. **ICS encoding edge cases**: Unicode, ampersands, special characters in event title/description. Class-adjacent to Bug 4. Partially covered by HTTP test case "special chars in title".

3. **New Kit timezone names**: Kit adds a new Rails timezone string not in the 134-entry map. Detection: `mapTimezoneToIANA()` returns the raw string; Luxon will fail with an invalid zone error.

4. **Outlook URL format change**: Microsoft changes the deeplink format. Detection: VPS health check validates Outlook URL structure weekly.

---

## Testing This Spec

- **Unit tests**: `api/test-calendars/index.js` — 16 cases covering all three modes
- **HTTP integration tests**: Same file — 5 HTTP-level cases including full pipeline and double-decode regression
- **VPS health check**: `scripts/vps-health-check.py` — weekly, 4 timezone scenarios, actually fetches ICS
- **Canary (date-accuracy)**: `scripts/canary-test.js` — validates DTSTART date in ICS, not just structure
- **CI gate**: `.github/workflows/integration-tests.yml` — runs HTTP tests on every deploy
