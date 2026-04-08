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

**Pattern**: Every bug was caught by a user, not internal monitoring. Four bugs, four user reports.

---

## Date Parsing — Three Kit Modes

See `docs/KIT-DATE-SPEC.md` for the authoritative specification. Summary:

- **Mode B** (midnight UTC or date-only string): UTC date IS the intended date. Detect with `isMidnightUTC` flag.
- **Mode A** (non-midnight UTC): Kit browser sent local midnight as UTC. Convert to target TZ to recover intended date.
- **Mode C** (Mode A but browser TZ ≠ Kit account TZ): Same code path as Mode A; `max()` guard handles near-midnight edge cases.

**The `max()` is a tie-breaker, not the primary algorithm.** Primary: convert UTC timestamp to target TZ, extract date.

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
- **VPS health check** (`scripts/vps-health-check.py`): weekly, 4 timezone scenarios, actually fetches ICS. Deployed at `/home/claude/kit-calendar-health/health_check.py`. Cron: Friday 7pm UTC (verified running 2026-04-05).
- **Canary** (`scripts/canary-test.js`): validates DTSTART date accuracy (not just structure). Run: `node scripts/canary-test.js`.
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
- Kit's timezone picker sends **Rails ActiveSupport timezone names** (e.g. `"Eastern Time (US & Canada)"`, `"Abu Dhabi"`). Mapped in `api/calendar-block/index.js`.

---

## Before Touching Date Parsing

1. Read this file
2. Read `docs/KIT-DATE-SPEC.md` — the invariant section, not just the examples
3. Check `api/test-calendars/index.js` — it has a **copy** of the date parsing logic that must stay in sync
4. When you fix a bug: update both files, add a regression test, update this log
