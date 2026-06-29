# Kit Calendar — Input/Output Specification

**Version**: 2.1  
**Date**: 2026-06-29  
**Source of truth**: This document for behavior; `utils/kitDate.js` for the implementation (the shared parser the endpoint AND `api/test-calendars/index.js` both import — no copied logic).

---

## What This Document Is

Kit's calendar block API is undocumented and unstable. This spec captures everything known about its behavior from direct observation, failure reports, and three rounds of bug fixes. It is written to force the question: "what is correct when X ≠ Y?" — the question that would have caught Bugs 2 and 3 before users did.

---

## Input Contract

### Endpoint

`POST /api/calendar-block`

Body: `{ "settings": { ... } }`

### V2 Format (April 2026+)

Kit began sending a new format in April 2026. Both v1 and v2 are supported.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | Yes | Event title |
| `start` | string | Yes | ISO 8601 local datetime, e.g. `"2026-04-10T10:00:00"` (no Z suffix) |
| `duration` | string | Yes | Duration in minutes, e.g. `"60"` |
| `timezone` | string | Yes | IANA timezone name, e.g. `"America/Chicago"` |
| `location` | string | No | Event location (omitted when empty, unlike v1) |
| `description` | string | No | Event description |

**Key differences from v1**: No Mode A/B/C ambiguity. `start` is an unambiguous local datetime. `timezone` is IANA (no Rails mapping needed). End time is computed from `duration` instead of separate fields.

**Detection**: Request has `start` AND `duration` AND `timezone` fields → v2. Otherwise → v1.

### V1 Format (Legacy)

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

**Invariant**: The intended date is the wall-clock date the creator CLICKED — the local date in the creator's *browser* timezone, NOT the event/`tz` timezone.

**Correct behavior**: Recover the clicked date by rounding the UTC instant to the NEAREST midnight — UTC hour ≥ 12 ⇒ the browser is east of UTC ⇒ the clicked date is the next UTC day; hour < 12 ⇒ the same UTC day. This infers the browser offset from the time-of-day and is independent of the event timezone. `2026-04-14T14:00:00.000Z` (Brisbane UTC+10 selecting Apr 15): 14:00 ≥ 12 → April 15. ✓

> Earlier versions converted UTC → the event/`tz` timezone and extracted the date. That is correct only when the browser tz equals (or is west of) the event tz; it fails when the browser is EAST of the event tz (see Mode C). Nearest-midnight is the corrected primary algorithm.

**Detection**: UTC timestamp has a non-zero time component (not midnight UTC).

---

### Mode C — Browser TZ ≠ Event TZ (the "browser east of event tz" bug)

**When it occurs**: The creator's browser timezone differs from the event timezone they picked in the block's `tz` dropdown. (The `tz` field is the EVENT timezone the creator chose — not necessarily their browser or Kit-account timezone.)

**What Kit sends**: Same format as Mode A — the UTC offset corresponds to the *browser* timezone. The `tz` field carries the (possibly different) event timezone.

**Invariant**: The intended date is still the wall-clock date the creator clicked (browser-local). Recover it with nearest-UTC-midnight (Mode A), which is independent of the event tz. Then take the LATER of {nearest-midnight date, event-tz date}.

**Why the guard**: when the browser tz EQUALS the event tz at an extreme east offset (> +12, e.g. New Zealand in summer, +13), nearest-midnight rounds a day early, but the event-tz date recovers it. `max(nearestMidnight, eventTzDate)` is correct in both directions.

Example — Helsinki browser / London event, creator selects July 14 (THE June 2026 bug):
- Kit sends `2026-07-13T21:00:00.000Z` (Jul 14 00:00 Helsinki EEST = Jul 13 21:00 UTC)
- nearest-midnight: 21:00 ≥ 12 → **July 14** ✓ (the date the creator clicked)
- event-tz (London, BST) date of 21:00Z = July 13 22:00 → July 13
- max(July 14, July 13) → **July 14** ✓

> Correction (2026-06-29): a previous version of this spec claimed the Brisbane-browser / Eastern-account / "selects April 15" case should resolve to **April 14** (convert-to-event-tz). That was the bug, not the contract. The creator clicked the 15th and wants the 15th; nearest-midnight returns **April 15**. The "convert to the event/account tz" invariant only works when the browser is not east of the event tz.

**Known limitation**: a browser at offset **> +12** (NZ summer +13, Chatham +13:45, Samoa +13, Kiribati +14) scheduling an event in a timezone **WEST of the browser** is unrecoverable from `(UTC timestamp, event tz)` alone — both candidate dates land a day early and no heuristic can distinguish the intended date without the browser tz (which Kit does not send). The guard keeps the common `browser == event tz` case correct.

**Code reference**: `recoverClickedDate()` in `utils/kitDate.js`.

**Bugs this covers**: [Bug 3] US browser ≠ Kit account near midnight; [Bug 6] Helsinki browser, London event (browser east of event tz).

---

## Timezone Mapping

Kit sends Rails ActiveSupport timezone names (e.g., `"Eastern Time (US & Canada)"`, `"Abu Dhabi"`) — and sometimes grouped Windows-style labels (e.g., `"London, Dublin (GMT+00:00)"`). These resolve to IANA names via `resolveTimezone()` in `utils/kitDate.js` (shared by the endpoint and the test suite).

Resolution order: IANA passthrough → exact name → case-insensitive → strip `(GMT±..)` offset → **combined-label** (split on commas, take the first known city — grouped labels share one offset, so any city is correct and DST-aware) → fixed GMT offset (no DST) → UTC.

134 Rails names are mapped. When resolution falls through to a fixed offset or UTC (`matched: false`), the endpoint logs a `kit_timezone_unmapped` corpus event and fires a Slack alert (the **unmapped-tz watchdog**) — so a new/unhandled name surfaces automatically instead of via a support ticket. A fixed-offset fallback has NO DST, so event times would be 1h off in summer — which is why combined-label handling exists and why the watchdog matters.

**Test coverage**: Pacific, Eastern, Brisbane/AU, Dubai/UAE (Rails non-standard name), London/Helsinki/Tokyo (browser-east class), combined-label (winter GMT + summer BST).

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
| 6 | 2026-06 | Trung (Kit) / Finnish creator | A/C | Browser EAST of event tz: `max(utcDate, tzDate)` landed a day early (Helsinki browser, London event → showed the 13th for the 14th) | nearest-UTC-midnight recovery in `recoverClickedDate()` |

All were reported by users/partners before internal detection — the unmapped-tz watchdog + DTSTART-validating canary now close that gap for this class.

---

## What Could Still Break

1. **Mode D**: Kit changes date encoding format in a way not covered by Modes A-C or V2. Detection: schema monitor will fire if payload keys change; corpus logs will show unusual `detected_mode` patterns. **Note**: V2 format (April 2026) was detected this way — the schema monitor fired on new `start`, `duration`, `timezone` fields.

2. **ICS encoding edge cases**: Unicode, ampersands, special characters in event title/description. Class-adjacent to Bug 4. Partially covered by HTTP test case "special chars in title".

3. **New Kit timezone names / formats**: Kit adds a Rails name or label format not handled by `resolveTimezone()`. Detection: the unmapped-tz watchdog (`kit_timezone_unmapped` corpus event + Slack alert) fires on any fixed-offset/UTC fallback. Combined `"City, City (GMT±..)"` labels are handled; a genuinely unknown name still falls back (date stays correct via nearest-midnight, but the time may be 1h off in summer until the name is added to `TIMEZONE_MAP`).

4. **Outlook URL format change**: Microsoft changes the deeplink format. Detection: VPS health check validates Outlook URL structure weekly.

---

## Testing This Spec

- **Unit tests**: `api/test-calendars/index.js` — 30 cases covering v1 (three modes + the browser-east class + combined labels) and v2 format. Exercises the real parser in `utils/kitDate.js` (no copied logic).
- **HTTP integration tests**: Same file — 6 HTTP-level cases including full pipeline for both v1 and v2, and double-decode regression
- **VPS health check**: `scripts/vps-health-check.py` — weekly, 8 scenarios, fetches ICS AND asserts the resolved DTSTART date
- **Canary (date-accuracy)**: `scripts/canary-test.js` — 10 scenarios, validates DTSTART date in ICS (incl. browser-east + combined label)
- **CI gate**: `.github/workflows/integration-tests.yml` — runs HTTP tests on every deploy
