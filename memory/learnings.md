# Kit Calendar — Learnings & Operational Runbook

Read this before touching date parsing, timezone logic, or the observability system.

---

## Bug History

| # | Date | Reporter | Symptom | Root Cause | Fix |
|---|------|----------|---------|-----------|-----|
| 1 | 2025-12 | Brisbane user | Wrong date (off by -1 day) | UTC→TZ conversion missing for ahead-of-UTC timezones | Implement timezone conversion |
| 2 | 2026-03 | Kirstin (Paige Brunton) | Eastern timezone date off by -1 | Mode B not detected; midnight UTC was shifted by TZ offset | Detect midnight UTC, use UTC date directly |
| 3 | 2026-03 | US TZ user | Wrong date near midnight | Browser TZ ≠ Kit account TZ edge case | `max(utcDate, targetTZDate)` guard |
| 4 | 2026-04 | Ballantyne (Paige Brunton) | Apple Calendar 500 error | Double `decodeURIComponent()` on ICS query params | Remove redundant decode calls |
| 5 | 2026-05 | Shannon Mattern | Buttons squeezed/truncated on mobile | Four-button horizontal row had no responsive breakpoint | `<style>` block with `@media (max-width: 480px)` stacks button cells vertically |
| 6 | 2026-06 | Trung (Kit) / Finnish creator | Date off by -1 when browser is EAST of the event tz (Helsinki browser, London event → July 14 shows as 13) | `max(utcDate, tzDate)` is blind to browser-east-of-event; both operands land a day early | Round the UTC instant to the NEAREST midnight in `recoverClickedDate()` (`utils/kitDate.js`) |

**Pattern**: Every bug was caught by a user/partner, not internal monitoring. Six bugs, six external reports. The unmapped-tz watchdog + DTSTART-validating canary (added with #6) are the first internal detection for this class.

---

## Mobile Button Layout (added 2026-05-17)

The calendar block returns inline HTML embedded into Kit's email template. The four buttons live in a single `<tr>`/`<td>` row — fine on desktop, but four ~90px buttons fight for ~340px on a phone, so labels truncate ("Goo gle", "Out look").

**Fix**: prepend a `<style>` block with classes `kc-btn-table` and `kc-btn-cell`; under `@media (max-width: 480px)` the cells flip to `display: block; width: 100%`. Falls back to today's horizontal layout in any client that strips `<style>` tags.

**Why a `<style>` block in the body works for Kit emails**: every major mobile client (iOS Mail, Gmail iOS/Android, Outlook mobile) honors media queries in body `<style>`. Kit's own broadcast templates use the same pattern, so it survives Kit's HTML processing.

**Kit cache caveat**: Kit caches the rendered HTML server-side. Users may need to delete and re-add the calendar block in an existing broadcast to see the fix. New broadcasts pick it up automatically.

---

## Date Parsing — Three Kit Modes

See `docs/KIT-DATE-SPEC.md` for the authoritative specification. Summary:

- **Mode B** (midnight UTC or date-only string): UTC date IS the intended date.
- **Mode A** (non-midnight UTC): Kit encoded the creator's BROWSER-local midnight as UTC. Recover the clicked date by rounding the UTC instant to the NEAREST midnight (UTC hour ≥ 12 → next day). Independent of the event tz.
- **Mode C** (browser TZ ≠ event TZ): same nearest-midnight recovery, then `max(nearestMidnight, eventTzDate)` as a guard for browser offset > +12.

**Superseded (2026-06):** the old primary "convert UTC → event tz, extract date" with a `max(utcDate, tzDate)` tie-breaker FAILS when the browser is east of the event tz (Bug 6). Nearest-midnight is the corrected primary algorithm. See the June 2026 section below and `docs/KIT-DATE-SPEC.md` Mode C.

### V2 Format (detected 2026-04-08)

Kit began sending a completely new payload format:
- `start`: ISO local datetime `"2026-04-10T10:00:00"` (no Z, no UTC encoding)
- `duration`: minutes as string `"60"` (replaces `end_time`/`end_ampm`)
- `timezone`: IANA name `"America/Chicago"` (replaces Rails ActiveSupport `tz`)

**Key wins**: No more Mode A/B/C ambiguity. `start` is an unambiguous local datetime. No timezone mapping needed.

**Detection**: `start && duration && timezone` → v2. Otherwise → v1 (legacy).

**What to watch**: V2 payloads may omit `location`/`description` when empty (v1 always included them). The styling fields (`background_color`, `text_color`, `size`, `rounded_corners`, `alignment`) have not been seen in v2 yet — may be sent when users customize styling, or may be gone entirely.

**Schema monitor fired the alert.** First v2 payload hit at 2026-04-08T14:44:17Z. Two alerts (5 seconds apart) — likely Kit's preview rendering hitting the endpoint twice.

### Mode B Boundary Tolerance (investigated 2026-04-05)

The midnight-UTC check is `hour === 0 && minute === 0 && second === 0`.

- **Sub-second jitter is safe**: `00:00:00.500Z` → second is still 0 → correctly detected as Mode B.
- **Second-level jitter is NOT safe**: `00:00:01Z` → routes to Mode A → date off by 1 for UTC+ users.
- **In practice**: Kit constructs Mode B dates from date values (Rails `Date.new(...).to_datetime.utc`), so second-level jitter is not expected. Validated: Kit sends `.000Z` exactly.
- **Action**: Comment added to code documenting this tolerance. No code change needed.

---

## Browser East of Event TZ — Bug 6 + Shared Module (2026-06-29)

**Symptom**: A creator with a Helsinki browser set an event's timezone to London and picked July 14; the button showed July 13. Switching the event tz to Helsinki "fixed" it. Reported via Kit's tech team (Trung).

**Root cause**: Kit encodes the picked date as midnight in the creator's BROWSER timezone, expressed as UTC. Helsinki (UTC+3 in summer) midnight Jul 14 = Jul 13 21:00 UTC. The old recovery — `max(utcDate, tzDate)` where `tzDate` is the date in the EVENT timezone — gave `max(Jul 13, Jul 13) = Jul 13`. The `max()` only rescues browser-WEST-of-UTC cases; when the browser is east of UTC AND the event tz is west of the browser, BOTH operands land a day early. This is a whole class: Dubai→London, Sydney→Tokyo, India→London, and the spec's own Brisbane→Eastern "Mode C" example were all the same bug.

**Fix**: `recoverClickedDate()` rounds the UTC instant to the NEAREST midnight (UTC hour ≥ 12 → next day), inferring the browser offset from the time-of-day and recovering the clicked wall-clock date independent of the event tz. The event-tz date is kept as a guard via `max(nearestMidnight, eventTzDate)` so the `browser == event tz` case at extreme east offsets (> +12, NZ summer) stays correct. The new value is always ≥ the old one → the change is monotonic and cannot regress a currently-correct case (verified against all prior modes + the existing suite).

**Known limitation**: browser offset > +12 (NZ summer +13, Chatham, Samoa, Kiribati) scheduling an event WEST of the browser is unrecoverable from `(UTC timestamp, event tz)` alone — Kit doesn't send the browser tz. Documented, not solved.

**Structural change — killed the copy.** The date parser + timezone map were extracted to `utils/kitDate.js`, imported by BOTH the endpoint and `api/test-calendars/index.js`. Previously the test kept a hand-copied SUBSET of the map that omitted all of Europe — exactly why this bug had zero test coverage. There is no longer a copy to drift.

**Two new watchdogs (first internal detection for this class):**
- **Unmapped-tz tracker**: when `resolveTimezone()` can't resolve a NAME and falls back to a fixed offset / UTC, the endpoint logs `kit_timezone_unmapped` + fires a Slack alert. A fixed offset has no DST → 1h-off summer times; this surfaces the next "Abu Dhabi"/"London, Dublin" before a user hits it.
- **Combined-label handling**: `"London, Dublin (GMT+00:00)"` now resolves to `Europe/London` (DST-aware), not a fixed UTC+0.

**Open question for Kit**: confirm the exact `tz` string Kit sends for the "London, Dublin (GMT+00:00)" option. If it's a bare Rails name ("London"), the map already covered it; if it's the combined label, the new handler covers it. Either way the DATE is fixed — this only affects whether summer event TIMES are correct.

---

## Weekly Report — Lessons Learned (2026-04-07)

### Partial-week WoW is meaningless
- **Bug**: Report compared current partial week (e.g. 2 days = 78 events) to last full week (7 days = 239), showing -67%. Completely artificial.
- **Fix**: `generateWeeklyReport()` strips the current partial week. "This week" = last completed Mon-Sun. "Last week" = the one before. Always apples-to-apples.
- **Rule**: Never compare partial periods to full periods in trend metrics.

### Unauthenticated endpoints WILL get hit
- **Bug**: GET handler checked that `WEEKLY_REPORT_SECRET` env var *existed* but never verified it against the request. Bots/crawlers triggered spurious Slack reports.
- **Fix**: GET handler requires either `Authorization: Bearer <CRON_SECRET>` (Vercel cron) or `?secret=` query param (manual). `CRON_SECRET` set in Vercel env vars.
- **Rule**: Every endpoint that has side effects (sending messages, writing data) needs auth, even if "only" called by cron.

### Backfill has a time window
- Daily data has 30-day TTL. Weekly aggregates created from daily data can only be backfilled within that window. After 30 days, the stale aggregate is all you have.
- Backfill route: `GET /api/weekly-report?backfill=true&secret=...&weeks=N` (max 8).

---

## Observability System (added 2026-04-05)

### What's running
- **Corpus log** (`calendar_block_request`): structured JSON on every request — raw Kit input, detected mode, resolved date. Also logs `calendar_block_error` on failure path. Sent to VPS receiver (unlimited retention, JSONL files). Python HTTP receiver at `159.203.139.119:9201`, PM2 process `kit-log-receiver`, logs at `/home/claude/kit-calendar-log-receiver/logs/corpus-YYYY-MM-DD.jsonl`. Env vars: `VPS_LOG_URL` (`http://159.203.139.119:9201/log`), `VPS_LOG_SECRET`.
- **Schema monitor** (`kit_schema_change`): fires when Kit sends unknown payload keys. Sends Slack alert via `SLACK_WEBHOOK_URL`. **Scope**: detects key additions only — NOT removal, semantic changes, or encoding drift.
- **VPS health check** (`scripts/vps-health-check.py`): weekly, 8 scenarios, fetches ICS AND asserts the resolved DTSTART date (not just structure). Deployed at `/home/claude/kit-calendar-health/health_check.py`. Cron: Friday 7pm UTC. **Redeploy after edits**: `scp scripts/vps-health-check.py claude@<vps>:/home/claude/kit-calendar-health/health_check.py`.
- **Canary** (`scripts/canary-test.js`): validates DTSTART date accuracy, 10 scenarios (incl. browser-east + combined label). Run: `node scripts/canary-test.js`.
- **Unmapped-tz tracker**: `resolveTimezone()` fallback to fixed-offset/UTC logs `kit_timezone_unmapped` + Slack alert — surfaces a new Rails name or label format before a user hits it (the "next Abu Dhabi" early-warning).
- **CI gate** (`.github/workflows/integration-tests.yml`): HTTP integration tests on every push to main. **Requires VERCEL_TOKEN GitHub secret for SHA-bound testing — fails loudly without it.**
- **Incident runbook**: `docs/INCIDENT_RUNBOOK.md` — what to do when each alert fires.

### When the corpus log fires an anomaly
Signs to look for in Logtail (`event = "calendar_block_request"`):
- `resolved_date` doesn't match what you'd expect from `raw_date_iso` and `timezone_raw`
- High frequency of `calendar_block_error` events
- `detected_mode` shows only `midnight-utc` when you'd expect a mix (suggests Kit changed their encoding)

**If you see a suspect entry**: Check `raw_date_iso` → manually compute what date it should produce → compare to `resolved_date`. If they don't match, there's a silent failure.

### When the schema monitor fires (`kit_schema_change` Slack alert)
1. Check the `unknown_keys` in the Vercel log for the event
2. Compare against `KNOWN_SETTINGS_KEYS` in `api/calendar-block/index.js`
3. If the new key is benign (e.g. `version`, `locale`): add it to `KNOWN_SETTINGS_KEYS` and commit
4. If the new key is a date/time variant: investigate if it changes the date parsing logic; update `docs/KIT-DATE-SPEC.md` first

### When the VPS health check fails (Slack alert)
Triage order:
1. Is it all 4 scenarios or just one? → one scenario = timezone-specific bug; all = endpoint down
2. Check the ICS button first — it's the highest-fidelity test (actually fetches the file)
3. Run `node scripts/canary-test.js` to check date accuracy
4. Check Vercel function logs for `calendar_block_error` events

### When the CI gate fails
1. Check which test failed in the GitHub Actions run log
2. If it's an HTTP test (not a unit test), check if Vercel deployed successfully
3. If `VERCEL_TOKEN` is set, the deployment URL is SHA-bound — check that the right deployment was tested
4. Run the test endpoint manually: `curl -H "x-test-secret: [secret]" https://kit-app-build.vercel.app/api/test-calendars`

### Vercel env var whitespace breaks deploys (2026-04-08)
- **Symptom**: CI fails at "Wait for Vercel deployment" step with "Vercel deployment failed." Deployment state is ERROR with 0ms build time — never even starts building.
- **Root cause**: `CRON_SECRET` env var had a trailing `\n` (newline). Vercel validates that cron secrets are valid HTTP header values; whitespace is rejected. Error code: `INVALID_CRON_SECRET`.
- **Diagnosis**: `npx vercel ls` showed ERROR state → Vercel API (`/v13/deployments/<id>`) returned `errorCode: INVALID_CRON_SECRET` with a clear message about whitespace.
- **Fix**: `vercel env rm CRON_SECRET production` → `printf 'value' | vercel env add CRON_SECRET production` (printf avoids trailing newline).
- **Rule**: When adding Vercel env vars, use `printf` not `echo` to avoid trailing newlines. Always check `vercel env pull` output with `cat -v` or `od -c` if deploys fail with no build logs.

---

## Debug Mode

Set `DEBUG=true` in `.env.local` to enable verbose diagnostic logging. Never set in production — it gates all the `🔍 TIMEZONE/ALIGNMENT DEBUG` logs that would otherwise pollute the corpus log stream.

---

## Kit Platform Behavior

- Kit may **cache rendered HTML server-side**. After a fix is deployed, users may need to create a new calendar block to get fresh API responses.
- Kit's API is **completely undocumented**. All behavior is inferred from failure reports.
- Kit's timezone picker sends **Rails ActiveSupport timezone names** (e.g. `"Eastern Time (US & Canada)"`, `"Abu Dhabi"`), and sometimes **grouped Windows-style labels** (`"London, Dublin (GMT+00:00)"`). Resolved in `utils/kitDate.js` (`resolveTimezone`), which handles bare names, `(GMT±..)` suffixes, and combined labels (first known city). Unresolved names hit the unmapped-tz watchdog.

---

## Before Touching Date Parsing

1. Read this file
2. Read `docs/KIT-DATE-SPEC.md` — the invariant section, not just the examples
3. The parser is a **single shared module** — `utils/kitDate.js` (`resolveTimezone` + `recoverClickedDate`). The endpoint AND `api/test-calendars/index.js` both import it, so there is no longer a copy to keep in sync (there used to be — it drifted and hid Bug 6). Change the logic ONLY in `utils/kitDate.js`.
4. When you fix a bug: change `utils/kitDate.js`, add a regression test to `api/test-calendars/index.js` (and a date-accuracy case to `scripts/canary-test.js` / `scripts/vps-health-check.py`), update this log and `docs/KIT-DATE-SPEC.md`.
