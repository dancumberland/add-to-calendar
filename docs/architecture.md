# Architecture Overview – Kit “Add to Calendar” App

> A living blueprint of how the pieces fit together.  Feel free to append notes as we build.

---

## Goal
Let any **Kit** creator drop fully-styled “Add to Google / Apple / Microsoft Calendar” buttons into an email or landing page.  Recipients click and instantly add the event—with the creator-chosen title, date/time, link, etc.

## Core Components

| # | Component | Purpose |
|---|-----------|---------|
| 1 | **Kit Content-Block Plugin** | Presents a form in the Kit editor so the creator can fill event details.  Triggers backend call and embeds returned HTML. |
| 2 | **Backend (Vercel serverless functions)** | Builds the calendar links & ICS file, then returns the HTML snippet Kit will render. |
| 3 | **ICS Delivery** | Same Vercel function (or static file) serves the `.ics` file used by Apple & Outlook. |
| 4 | **Hosting / Deployment** | Vercel automatically deploys the functions when we push or run `vercel --prod`. |

### 2.1 Backend Endpoints

| Route | Method | What it does |
|-------|--------|-------------|
| `/api/calendar-block/html` | POST | • Receives JSON `{settings:{…}}` from Kit  
• Generates unique ID & `.ics` text  
• Stores/serves the file (in memory or temp)  
• Builds Google & Outlook URLs  
• Returns **HTML snippet** containing three `<a>` buttons |
| `/api/ics/[id].js` | GET | Looks up the `.ics` text by `id` and returns it with `text/calendar` mime-type. |

> *In the simplest version we can regenerate the file on-the-fly every request and skip storage entirely.*

### 2.2 Plugin Settings Schema (shown to creators)
```json
[
  { "id": "title",       "type": "text",      "label": "Event title",  "required": true },
  { "id": "date",        "type": "date",      "label": "Date",         "required": true },
  { "id": "start_time",  "type": "time",      "label": "Start time",   "required": true },
  { "id": "end_time",    "type": "time",      "label": "End time" },
  { "id": "timezone",    "type": "timezone",  "label": "Time zone",     "default": "America/Los_Angeles" },
  { "id": "location",    "type": "text",      "label": "Location / Link" },
  { "id": "description", "type": "textarea",  "label": "Description" }
]
```

## Data Flow (🎈 ELI5 version)
1. **Drag the block in** – Creator opens Kit editor and picks *Calendar Buttons*.
2. **Fill the form** – They type title, choose the date & time.
3. **Kit calls us** – Kit sends those details to `/api/calendar-block/html`.
4. **We cook the goodies** – Our function mixes the data, bakes an `.ics` cookie, and wraps three colorful buttons in HTML.
5. **Kit shows buttons** – Kit pastes that HTML into the email.
6. **Reader clicks** – Google opens instantly OR their device downloads the `.ics` file (Apple/Outlook).  Everyone’s happy.

## Proposed File Structure
```
Kit_App_Build/
├── api/
│   ├── calendar-block/
│   │   └── html.js        # POST handler for Kit
│   └── ics/
│       └── [id].js        # GET handler serving .ics
├── utils/
│   └── buildIcs.js        # Helper to generate RFC5545 text
├── architecture.md        # ← you are here
└── README.md
```

## Nice-to-Have Enhancements (future)
- Persist generated events in a tiny KV store (Vercel KV or Deta Base) for analytics.
- Allow custom button styles via extra plugin fields.
- Auto-detect all-day events when no end-time provided.
- Internationalised time-zone picker.

---

## 3. Analytics Layer (Added 2025-11-29)

Tracks usage metrics and generates weekly email reports. See [sessions/251129.1315-Email-Report-Fix.md](./sessions/251129.1315-Email-Report-Fix.md) for implementation details.

### 3.1 Data Model

**Daily Counters** (`usage:daily:YYYY-MM-DD`, 30-day TTL):
- `count`: Total events created that day
- `timezones`: Breakdown by timezone (e.g., `{"America/New_York": 5}`)
- `eventTypes`: Breakdown by inferred type (meeting, appointment, etc.)
- `withLocation`: Count of events that included a location

**Weekly Aggregates** (`usage:weekly:YYYY-MM-DD`, 365-day TTL):
- Sums of daily data for entire week
- Locked in once per week via `aggregateWeeklyData()`
- Persistent historical record (1 year retention)

**All-Time Total** (`usage:total`, no expiration):
- `totalEvents`: Sum of all events ever created
- `allTimeTimezones`: Aggregate timezone usage (all-time)
- `allTimeEventTypes`: Aggregate event type usage (all-time)
- `firstEvent`: Date of first tracked event
- `lastEventDate`: Date of most recent event

### 3.2 Weekly Report Generation

**Flow**:
1. Cron job or manual trigger calls `POST /api/weekly-report`
2. Handler calls `aggregateWeeklyData()` to lock in last week's totals
3. `getTwelveWeekTrend()` retrieves 12 weeks of data (prefers aggregates, falls back to daily math)
4. Email generated with 12-week chart + trend indicators
5. Sent via Make.com webhook or Resend.com API

**Report Contents**:
- This week's event count
- Week-over-week % change (↗️ up, ↘️ down, ➡️ flat)
- 12-week trend chart (bars for each week, current week highlighted)
- All-time total events created

### 3.3 Files Added/Modified

**New**:
- `utils/analytics.js` – Centralized analytics module (tracking, aggregation, reporting)
- `sessions/` – Session documentation structure

**Modified**:
- `api/calendar-block/index.js` – Now calls `trackDailyUsage()` instead of inline `trackUsage()`
- `api/weekly-report/index.js` – Refactored to use analytics functions

## Nice-to-Have Enhancements (future)
- Dashboard to view real-time metrics and historical trends
- Data reconciliation for missed weeks
- Export usage data as CSV for analysis
- Alert on failed weekly aggregations
- Backfill historical data from Vercel logs if needed

---
**Status:** 
- _Initial skeleton committed – 2025-07-09_
- _Analytics layer added – 2025-11-29_ (See [sessions/](./sessions/) for details)
