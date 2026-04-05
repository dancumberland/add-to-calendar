# Kit Calendar — Incident Response Runbook

**When a monitoring alert fires, open this file first.**

---

## Alert 1: Schema Monitor — Slack `kit_schema_change`

**What it means**: Kit sent a payload key that isn't in `KNOWN_SETTINGS_KEYS`.

**Scope reminder**: This monitor detects key *additions* only. Key removal, semantic changes, and encoding drift are NOT detected here — those require corpus analysis.

### Triage (5 min)

1. Open Vercel logs → filter by `kit_schema_change`
2. Find the `unknown_keys` field in the event JSON
3. Is the key benign (e.g. `version`, `locale`, `created_at`)?

**If benign:**
- Add the key to `KNOWN_SETTINGS_KEYS` in `api/calendar-block/index.js`
- Commit + push (CI gate will verify)
- No user impact

**If date/time related (e.g. `utc_date`, `timezone_offset`, `date_v2`):**
- Do NOT merge anything yet
- Read `docs/KIT-DATE-SPEC.md` — check if new key changes date parsing
- Update `docs/KIT-DATE-SPEC.md` first to document the new behavior
- Update date parsing in both `api/calendar-block/index.js` AND `api/test-calendars/index.js`
- Add a regression test before deploying
- Check corpus for `calendar_block_request` events showing the new key in `raw_date_iso`

**If unknown/scary:**
- Check if Kit recently sent a broadcast — corpus logs will show what `raw_date_iso` looks like now
- Compare against `docs/KIT-DATE-SPEC.md` invariants

---

## Alert 2: VPS Health Check — Slack `🚨 Kit Calendar — N scenarios FAILING`

**What it means**: One or more calendar button scenarios are broken end-to-end.

### Triage (10 min)

**Is it one scenario or all four?**

| Pattern | Likely cause |
|---------|-------------|
| All 4 failing | Endpoint down / Vercel deployment broken |
| Only Brisbane or Dubai | Ahead-of-UTC timezone regression (Mode A) |
| Only Eastern (Mode B) | Midnight-UTC detection broken |
| Only Mode B | Kit changed how it sends midnight UTC |
| Apple Calendar only | ICS endpoint broken |
| All except Apple | Calendar link generation broken |

**Step 1** — Check Vercel function logs for `calendar_block_error` events in the last 24h.

**Step 2** — Run the canary manually:
```bash
node scripts/canary-test.js
```

**Step 3** — If canary shows wrong dates, check `api/calendar-block/index.js` date parsing (lines ~499-514). Compare `isMidnightUTC` detection and `dateInTargetTz` conversion against the failing scenario.

**Step 4** — Check Vercel deployment — was a recent deploy broken?
```bash
vercel ls
```

**Step 5** — If Kit's cache is stale for a user: they may need to create a **new calendar block** in Kit to get a fresh API response. Kit may cache the rendered HTML server-side.

---

## Alert 3: CI Gate — Red check on GitHub

**URL**: github.com/dancumberland/add-to-calendar/actions

### Triage

**`VERCEL_TOKEN not set` error:**
- Create token at vercel.com/account/tokens
- Add it: `gh secret set VERCEL_TOKEN --repo dancumberland/add-to-calendar --body "your-token"`
- Re-run the workflow

**`Vercel deployment failed` error:**
- Check Vercel dashboard for build errors
- Check if `package.json` or `vercel.json` changed

**`FAILURES DETECTED` in test output:**
- Find failing test name in the output
- Check `api/test-calendars/index.js` for that test case
- If it's an HTTP test: the endpoint may be returning 500. Check Vercel logs.
- If it's a unit test: the date parsing logic regressed. Check recent commits to `api/calendar-block/index.js`.

---

## Alert 4: Corpus Anomaly (manual check via Logtail)

**Run this check when**: a user reports a wrong date AND you want to diagnose root cause.

### Logtail query

Filter: `event = "calendar_block_request"`

Red flags to look for:
- `resolved_date` doesn't match what you'd expect from `raw_date_iso` + `timezone_raw`
- `detected_mode` is `midnight-utc` for ALL requests (suggests Kit changed its encoding)
- Spike in `calendar_block_error` events
- Unfamiliar value in `timezone_raw` not in the IANA map

**If you see a suspect entry:**
1. Get `raw_date_iso` and `timezone_raw` from the log entry
2. Manually compute: what date should this produce?
   - If `raw_date_iso` is midnight UTC: the date component IS the answer
   - Otherwise: convert UTC → target TZ, take the later of that and the UTC date
3. Compare to `resolved_date` in the log
4. If they don't match: silent regression. Check recent deploys.

---

## Corpus Learning Loop (for new failure modes)

When Mode D (unknown failure mode) appears:

1. Corpus log captures it with `detected_mode: 'midnight-local-as-utc'` or similar
2. Find the event in Logtail — copy `raw_date_iso`, `timezone_raw`, `resolved_date`
3. Determine the correct expected date
4. If `resolved_date` is wrong: you've characterized Mode D
5. Add a regression test to `api/test-calendars/index.js`
6. Fix `api/calendar-block/index.js` AND `api/test-calendars/index.js`
7. Update `memory/learnings.md` with the new bug entry
8. Update `docs/KIT-DATE-SPEC.md` if the mode is new

---

## Quick Reference

| Check | Command |
|-------|---------|
| Run canary | `node scripts/canary-test.js` |
| Run integration tests | `curl -H "x-test-secret: $WEEKLY_REPORT_SECRET" https://kit-app-build.vercel.app/api/test-calendars` |
| Check recent Vercel logs | vercel.com → kit-app-build → Functions → calendar-block |
| Trigger health check manually | `python3 scripts/vps-health-check.py` |
| View corpus in Logtail | logtail.com → filter `event = "calendar_block_request"` |
