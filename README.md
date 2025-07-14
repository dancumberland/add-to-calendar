# Add-to-Calendar Buttons Kit.com Plugin

This project is a content block plugin for the Kit.com platform. It allows Kit creators to easily embed customizable "Add to Calendar" buttons for Google Calendar, Apple Calendar, and Microsoft Outlook into their emails and landing pages.

The backend is built with Node.js and runs on Vercel as a serverless function.

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
*   **Stateless & Secure:** The backend is stateless and does not store any user data, ensuring privacy.

---

## 🛠️ Architecture & How It Works

The application follows a simple client-server model where the Kit.com editor is the client and a Vercel serverless function is the server.

1.  **User Configures:** A Kit user adds the "Add-to-Calendar Buttons" block to their content and fills out the event details (title, time, colors, etc.) in the sidebar.
2.  **Kit Sends Request:** The Kit editor sends a `POST` request to our Vercel function (`/api/calendar-block`) with the user's settings in the JSON body.
3.  **Backend Processes:** The serverless function:
    *   Parses the settings.
    *   Uses the `luxon` library to handle dates and timezones correctly.
    *   Generates the appropriate calendar URLs for Google and Outlook.
    *   Creates an `.ics` calendar file for Apple Calendar and stores it in a temporary in-memory cache.
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
│   └── calendar-block/
│       └── index.js       # The core serverless function that handles POST requests from Kit.
├── utils/
│   └── buildIcs.js        # A helper utility to generate the .ics file content (RFC 5545 format).
├── Support_Site/
│   ├── Notion_Privacy.md  # Privacy Policy for the app.
│   └── Notion_Support_Page.md # Support & FAQ page.
├── README.md              # This file.
├── architecture.md        # The original high-level design document.
└── package.json           # Project dependencies.
```

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
