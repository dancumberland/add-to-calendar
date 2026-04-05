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

### Mode B Boundary Tolerance (investigated 2026-04-05)

The midnight-UTC check is `hour === 0 && minute === 0 && second === 0`.

- **Sub-second jitter is safe**: `00:00:00.500Z` → second is still 0 → correctly detected as Mode B.
- **Second-level jitter is NOT safe**: `00:00:01Z` → routes to Mode A → date off by 1 for UTC+ users.
- **In practice**: Kit constructs Mode B dates from date values (Rails `Date.new(...).to_datetime.utc`), so second-level jitter is not expected. Validated: Kit sends `.000Z` exactly.
- **Action**: Comment added to code documenting this tolerance. No code change needed.

---

## Observability System (added 2026-04-05)

### What's running
- **Corpus log** (`calendar_block_request`): structured JSON on every request — raw Kit input, detected mode, resolved date. Also logs `calendar_block_error` on failure path. **Requires Logtail log drain for 30-day retention — 1-hour retention without it.**
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
