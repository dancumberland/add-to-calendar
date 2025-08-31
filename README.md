# Add-to-Calendar Buttons Kit.com Plugin

This project is a content block plugin for the Kit.com platform. It allows Kit creators to easily embed customizable "Add to Calendar" buttons for Google Calendar, Apple Calendar, and Microsoft Outlook into their emails and landing pages.

The backend is built with Node.js and runs on Vercel as a serverless function with automated usage tracking and weekly email reports.

---

## 🌟 Features

*   **Three Major Calendar Services:** Generates links for Google, Apple (.ics), and Outlook calendars.
*   **Highly Customizable Buttons:**
    *   **Colors:** Custom background and text colors using a color picker.
    *   **Sizing:** Small, medium, or large button sizes.
    *   **Styling:** Adjustable rounded corners for the buttons.
    *   **Alignment:** Left, center, or right alignment for the button group.
*   **Rich Event Details:**
    *   Event Title, Date, Start/End Times.
    *   15-minute increments for time selection.
    *   Full timezone support.
    *   Location/URL and a description field.
*   **Seamless Kit Integration:**
    *   Works in both Kit emails and landing pages.
    *   Provides a user-friendly placeholder in the editor when event details are missing.
*   **Usage Analytics & Reporting:**
    *   Automatic usage tracking for all calendar events created
    *   Weekly email reports with comprehensive statistics
    *   All-time totals and trend analysis
    *   Timezone and event type insights
*   **Secure & Private:** Uses a temporary, secure cache (Vercel KV) to handle calendar file generation. Usage data is anonymized and aggregated.

---

## 🛠️ Architecture & How It Works

The application follows a simple client-server model where the Kit.com editor is the client and a Vercel serverless function is the server.

1.  **User Configures:** A Kit user adds the "Add-to-Calendar Buttons" block to their content and fills out the event details (title, time, colors, etc.) in the sidebar.
2.  **Kit Sends Request:** The Kit editor sends a `POST` request to our Vercel function (`/api/calendar-block`) with the user's settings in the JSON body.
3.  **Backend Processes:** The serverless function:
    *   Parses the settings.
    *   Uses the `luxon` library to handle dates and timezones correctly.
    *   Generates the appropriate calendar URLs for Google and Outlook.
    *   Creates an `.ics` calendar file for Apple Calendar and stores it in a temporary, secure cache (Vercel KV).
    *   Generates the button HTML with inline CSS styles based on the user's customization settings.
4.  **Backend Responds:** The function returns a JSON object containing the generated HTML: `{ "code": 200, "html": "..." }`.
5.  **Kit Renders:** Kit receives the response and injects the HTML directly into the editor, where the user sees their customized buttons.

### Tech Stack

*   **Backend:** Node.js on Vercel Serverless Functions
*   **Dependencies:** `luxon` for date/time manipulation.
*   **Hosting:** Vercel

---

## 📁 File Structure

```
Kit_App_Build/
├── api/
│   ├── calendar-block/
│   │   └── index.js       # Core serverless function with usage tracking
│   ├── ics/
│   │   └── [id].js        # Serves generated .ics files from Vercel KV
│   └── weekly-report/
│       └── index.js       # Weekly email report generation and sending
├── scripts/
│   ├── send-weekly-report.js  # Manual report trigger script
│   └── test-webhook.js        # Webhook testing utility
├── utils/
│   └── buildIcs.js        # Helper utility for .ics file generation (RFC 5545)
├── Support_Site/
│   ├── Notion_Privacy.md  # Privacy Policy
│   └── Notion_Support_Page.md # Support & FAQ
├── .env.example           # Environment variables template
├── vercel.json           # Vercel configuration with cron jobs
├── README.md             # This documentation
├── architecture.md       # High-level design document
└── package.json          # Dependencies and scripts
```

---

## 📚 Developer Resources

*   **Kit Developer Welcome:** [https://developers.kit.com/welcome](https://developers.kit.com/welcome)
*   **Using AI with Kit:** [https://developers.kit.com/kit-app-store/using-ai](https://developers.kit.com/kit-app-store/using-ai)
*   **Kit `llms.txt` for AI Context:** [https://developers.kit.com/llms.txt](https://developers.kit.com/llms.txt)

---

## 📊 Usage Analytics & Weekly Reports

This application includes comprehensive usage tracking and automated weekly email reports to help you understand how your calendar plugin is being used.

### What Gets Tracked

The system automatically tracks:
- **Event Creation Count**: Total number of calendar events created
- **Timezone Usage**: Which timezones are most popular with your users
- **Event Types**: Categorized by content (meetings, appointments, personal events, etc.)
- **Location Usage**: Percentage of events that include location information
- **Daily/Weekly Patterns**: Usage trends over time

### Weekly Email Reports

Every **Friday at noon Pacific**, you'll receive an automated email report containing:

#### 🎯 All-Time Totals
- Total events ever created since tracking began
- Date of first tracked event
- All-time location usage percentage
- Most popular timezone and event type across all time

#### 📊 Weekly Summary
- Events created in the past week
- Average events per day
- Weekly location usage percentage
- Most popular timezone and event type for the week

#### 📈 Detailed Breakdown
- Daily event counts for the past 7 days
- Timezone distribution for the week
- Event type categorization

### Email Delivery Setup

The system uses **Make.com** (free tier) for reliable email delivery:

1. **Make.com Scenario**: Webhook → Email module
2. **Webhook URL**: Configured in Vercel environment variables
3. **Email Format**: HTML with professional styling and data tables

### Environment Variables Required

```bash
# Core Configuration
REPORT_EMAIL=your-email@example.com
WEEKLY_REPORT_SECRET=your-secure-secret-here

# Email Service (choose one)
MAKE_WEBHOOK_URL=https://hook.us1.make.com/your-webhook-url
# OR
RESEND_API_KEY=your-resend-api-key
```

### Manual Testing & Triggers

Test the webhook integration:
```bash
node scripts/test-webhook.js
```

Manually trigger a weekly report:
```bash
npm run send-weekly-report
```

### Data Storage

- **Daily Metrics**: Stored in Vercel KV with 30-day expiration
- **All-Time Totals**: Stored in Vercel KV with no expiration
- **Privacy**: All data is anonymized and aggregated (no personal information stored)

---

## 🚀 Setup and Deployment

### Prerequisites

*   Node.js (v18 or later)
*   A free [Vercel](https://vercel.com) account and the Vercel CLI.

### Local Development

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Run the Development Server:**
    ```bash
    npx vercel dev
    ```
    This will start a local server, usually at `http://localhost:3000`.

### Deployment

To deploy the latest changes to production on Vercel, run:

```bash
npx vercel --prod
```

This single command handles the build process and deploys the function to the live URL associated with your Vercel project.

### Environment Variables Setup

Configure these environment variables in your Vercel dashboard:

#### Required Variables
```bash
REPORT_EMAIL=dan.cumberland@gmail.com
WEEKLY_REPORT_SECRET=your-secure-secret-here
```

#### Email Service Configuration
Choose one email delivery method:

**Option 1: Make.com (Recommended - Free)**
```bash
MAKE_WEBHOOK_URL=https://hook.us1.make.com/your-webhook-url
```

**Option 2: Resend.com (3,000 emails/month free)**
```bash
RESEND_API_KEY=your-resend-api-key
```

### Make.com Webhook Setup

1. **Create Make.com Account**: Sign up at make.com (free tier)
2. **Create New Scenario**: 
   - **Trigger**: Webhook module
   - **Action**: Email module
3. **Configure Email Module**:
   - **To**: `{{1.to}}` or your email address
   - **Subject**: `{{1.subject}}` or custom subject
   - **Content Type**: HTML
   - **Content**: `{{1.html}}`
4. **Copy Webhook URL**: Add to Vercel environment variables
5. **Activate Scenario**: Turn on the scenario in Make.com

### Testing the Setup

**Test webhook integration**:
```bash
node scripts/test-webhook.js
```

**Manually trigger weekly report**:
```bash
npm run send-weekly-report
```

**Test calendar functionality**:
```bash
curl -X POST https://your-deployment-url.vercel.app/api/calendar-block \
  -H "Content-Type: application/json" \
  -d '{"settings": {"title": "Test Event", "date": "2025-01-20", "start_time": "10:00", "start_ampm": "AM", "end_time": "11:00", "end_ampm": "AM", "tz": "America/Los_Angeles"}}'
```

### Keeping Your Deployment Active

Vercel may put serverless functions to sleep after periods of inactivity. This project includes both manual and automated solutions to prevent this:

#### Automated Daily Traffic (Recommended)

An automated cron job runs daily at 2:00 PM to keep the deployment active:

- **Script Location**: `~/scripts/vercel-keepalive.sh`
- **Log File**: `~/scripts/vercel-keepalive.log`
- **Cron Schedule**: `0 14 * * *` (daily at 2 PM)

The automated system:
- Pings the main deployment URL (`https://kit-app-build.vercel.app`)
- Tests the API endpoint (`/api/calendar-block`)
- Logs all results with timestamps
- Runs automatically when your Mac is awake

**Monitor the logs:**
```bash
cat ~/scripts/vercel-keepalive.log
```

**View/edit the cron job:**
```bash
crontab -l  # View current jobs
crontab -e  # Edit schedule
```

#### Manual Traffic Boost

For immediate traffic generation or troubleshooting, use the Windsurf workflow:

```bash
/vercel-traffic-boost
```

This workflow will:
- Send traffic to your main deployment URL
- Ping your API endpoints  
- Send test POST requests to simulate real usage
- Generate multiple requests to show sustained activity
- Check deployment status

**Usage scenarios:**
- When you receive Vercel notices about deployment inactivity
- Before expected traffic to warm up your serverless functions
- To test that your deployment is responding correctly
- As a quick health check for your Kit.com plugin

---

## 🔧 Troubleshooting

### Common Issues

**Webhook Test Fails (404 Error)**
- Verify the complete webhook URL from Make.com (should be much longer than the truncated version)
- Ensure Make.com scenario is active
- Check Make.com execution logs for errors

**No Weekly Email Received**
- Verify `MAKE_WEBHOOK_URL` is set in Vercel environment variables
- Check Make.com scenario is active and properly configured
- Test webhook manually: `node scripts/test-webhook.js`
- Check Vercel function logs for cron job execution

**Deployment Errors**
- Remove any invalid `functions` configuration from `vercel.json`
- Ensure all dependencies are listed in `package.json`
- Redeploy: `vercel --prod`

**Usage Tracking Not Working**
- Verify Vercel KV is enabled for your project
- Check function logs for tracking errors
- Test calendar creation manually to verify tracking code executes

### Monitoring & Logs

**View Vercel Function Logs**:
1. Go to Vercel dashboard → Your project → Functions tab
2. Click on function name to view execution logs
3. Check for errors in cron job execution or API calls

**Monitor Make.com Executions**:
1. Go to Make.com dashboard → Your scenario
2. View execution history and logs
3. Check for failed webhook deliveries

**Check Cron Job Status**:
- Cron jobs run automatically every Friday at noon Pacific (19:00 UTC)
- View execution in Vercel dashboard under Functions → Cron Jobs

### Data Recovery

If usage data appears lost:
- Daily data expires after 30 days (stored in Vercel KV)
- All-time totals are stored permanently
- No personal data is stored, only aggregated statistics

---
