# Kit Calendar

Add-to-calendar button generator for Kit (ConvertKit) email broadcasts. Generates Google Calendar, Outlook, Office 365, Yahoo, and ICS links from Kit's calendar block settings.

## Project Structure

| File | Purpose |
|------|---------|
| `api/calendar-block/index.js` | Main endpoint — timezone mapping, date parsing, link generation |
| `api/ics/index.js` | Stateless ICS file generation |
| `api/test-calendars/index.js` | Regression test suite (run via authenticated GET) |
| `utils/buildIcs.js` | ICS file builder helper |

Deployed on **Vercel** (`kit-app-build.vercel.app`).

## Critical Rules

### Learnings File — ALWAYS Upkeep
- **Read `memory/learnings.md` at session start** before making changes to date parsing or timezone logic
- **Update `learnings.md` after every bugfix** with what broke, why, and what the fix was
- This file is the project's institutional memory — it prevents repeating past mistakes
- Timezone bugs have bitten us three times already. The learnings file documents each failure mode.

### Date Parsing — Three Known Kit Modes
Kit's date picker sends dates in three different ways. All must be handled:
- **Mode A**: Midnight in browser TZ encoded as UTC (non-midnight UTC timestamp)
- **Mode B**: Midnight UTC or date-only string
- **Mode C**: Mode A but browser TZ ≠ Kit account TZ

The current fix uses midnight-UTC detection + `max(UTC date, target-TZ date)`. **Do not simplify this logic without reading `learnings.md` first.**

### Test Runner Must Stay In Sync
`api/test-calendars/index.js` has a COPY of the date parsing logic from `api/calendar-block/index.js`. When you change one, you MUST change the other. Always add a regression test for any new bug.

### Email Drafting
Always use the `email-draft` global skill. Never draft emails freehand. Always provide both `message` and `html_message` to Gmail MCP.
