#!/usr/bin/env python3
"""
Kit Calendar — Weekly Health Check
Runs on the VPS via cron, tests all calendar buttons end-to-end,
and sends results to Slack alongside the weekly usage report.

Deploy to VPS:
  mkdir -p /home/claude/kit-calendar-health
  cp vps-health-check.py /home/claude/kit-calendar-health/health_check.py
  chmod +x /home/claude/kit-calendar-health/health_check.py

Cron (Friday 7pm UTC = Friday 1pm CT — same time as weekly report):
  0 19 * * 5 /usr/bin/python3 /home/claude/kit-calendar-health/health_check.py >> /home/claude/kit-calendar-health/health_check.log 2>&1

Environment (reads Slack webhook from VPS file, no .env needed):
  Webhook file: /home/claude/dancumberlandlabs-content/.slack-webhook
  Fallback:     SLACK_WEBHOOK_URL environment variable
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL = "https://kit-app-build.vercel.app"
SLACK_WEBHOOK_FILE = "/home/claude/dancumberlandlabs-content/.slack-webhook"
REQUEST_TIMEOUT = 20  # seconds

# ---------------------------------------------------------------------------
# Test scenarios — covers all three Kit date modes and key timezone regions.
# Include a % in one description to keep the double-decode regression tested.
# ---------------------------------------------------------------------------
TEST_CASES = [
    {
        "name": "Pacific / Mode A (browser midnight-as-UTC)",
        "settings": {
            "title": "Weekly Health Check",
            "date": "2026-04-15T08:00:00.000Z",   # Apr 15 00:00 Pacific = Apr 15 08:00 UTC
            "start_time": "10:00", "start_ampm": "AM",
            "end_time": "11:00",   "end_ampm": "AM",
            "tz": "Pacific Time (US & Canada)",
            "location": "Online",
            "description": "Automated health check",
        },
    },
    {
        "name": "Eastern / Mode B (midnight-UTC, Kirstin bug)",
        "settings": {
            "title": "Weekly Health Check",
            "date": "2026-04-15T00:00:00.000Z",   # midnight UTC
            "start_time": "10:00", "start_ampm": "AM",
            "end_time": "11:00",   "end_ampm": "AM",
            "tz": "Eastern Time (US & Canada)",
            "location": "Online",
            "description": "Automated health check — 100% automated",   # % char: ICS decode regression
        },
    },
    {
        "name": "Brisbane/AU (ahead of UTC, Mode A)",
        "settings": {
            "title": "Weekly Health Check",
            "date": "2026-04-14T14:00:00.000Z",   # Apr 15 00:00 Brisbane = Apr 14 14:00 UTC
            "start_time": "09:00", "start_ampm": "AM",
            "end_time": "10:00",   "end_ampm": "AM",
            "tz": "Australia/Brisbane",
            "location": "Online",
            "description": "Automated health check",
        },
    },
    {
        "name": "Dubai/UAE (Rails 'Abu Dhabi' name, Mode A)",
        "settings": {
            "title": "Weekly Health Check",
            "date": "2026-04-14T20:00:00.000Z",   # Apr 15 00:00 Dubai = Apr 14 20:00 UTC
            "start_time": "10:00", "start_ampm": "AM",
            "end_time": "11:00",   "end_ampm": "AM",
            "tz": "Abu Dhabi",
            "location": "Online",
            "description": "Automated health check",
        },
    },
    # ===== V2 FORMAT (Kit April 2026+) =====
    {
        "name": "V2 / Central (ISO start + duration + IANA TZ)",
        "settings": {
            "title": "Weekly Health Check",
            "start": "2026-04-15T10:00:00",
            "duration": "60",
            "timezone": "America/Chicago",
            "location": "Online",
            "description": "Automated health check — V2 format",
        },
    },
    {
        "name": "V2 / Sydney (ahead-of-UTC, IANA TZ)",
        "settings": {
            "title": "Weekly Health Check",
            "start": "2026-04-15T09:00:00",
            "duration": "60",
            "timezone": "Australia/Sydney",
            "location": "Online",
            "description": "Automated health check — V2 format",
        },
    },
]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def http_post(url, payload, timeout=REQUEST_TIMEOUT):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8")


def http_get(url, timeout=REQUEST_TIMEOUT):
    req = urllib.request.Request(url, headers={"Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.headers.get("Content-Type", ""), resp.read().decode("utf-8")


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------
def validate_google_url(url):
    if not url:
        return False, "URL missing from HTML"
    try:
        parsed = urllib.parse.urlparse(url)
        params = dict(urllib.parse.parse_qsl(parsed.query))
        if "calendar.google.com" not in parsed.netloc:
            return False, f"wrong host: {parsed.netloc}"
        if params.get("action") != "TEMPLATE":
            return False, "missing action=TEMPLATE"
        if not params.get("text"):
            return False, "missing text param"
        dates = params.get("dates", "")
        if not dates or "/" not in dates:
            return False, f"invalid dates param: {dates!r}"
        return True, None
    except Exception as e:
        return False, str(e)


def validate_outlook_url(url, url_type):
    if not url:
        return False, "URL missing from HTML"
    try:
        parsed = urllib.parse.urlparse(url)
        params = dict(urllib.parse.parse_qsl(parsed.query))
        expected = "outlook.office.com" if url_type == "office365" else "outlook.live.com"
        if expected not in parsed.netloc:
            return False, f"wrong host: {parsed.netloc}"
        if params.get("rru") != "addevent":
            return False, "missing rru=addevent"
        if not params.get("startdt"):
            return False, "missing startdt param"
        return True, None
    except Exception as e:
        return False, str(e)


def validate_ics_url(ics_url):
    """Actually fetches the ICS URL and validates the content. This is the critical test."""
    if not ics_url:
        return False, "ICS URL missing from HTML"
    try:
        status, content_type, body = http_get(ics_url)
        if status != 200:
            return False, f"HTTP {status}"
        if "text/calendar" not in content_type:
            return False, f"wrong Content-Type: {content_type!r}"
        if "BEGIN:VCALENDAR" not in body or "END:VCALENDAR" not in body:
            return False, "invalid ICS: missing BEGIN/END:VCALENDAR"
        if "BEGIN:VEVENT" not in body:
            return False, "invalid ICS: missing VEVENT"
        return True, None
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.reason}"
    except Exception as e:
        return False, str(e)


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------
def run_test(test_case):
    name = test_case["name"]
    settings = test_case["settings"]

    result = {
        "name": name,
        "passed": True,
        "buttons": {
            "Google":     {"ok": False, "error": "not run"},
            "Apple":      {"ok": False, "error": "not run"},
            "Outlook":    {"ok": False, "error": "not run"},
            "Office 365": {"ok": False, "error": "not run"},
        },
        "fatal": None,
    }

    # Step 1: Generate HTML via calendar-block
    try:
        status, body = http_post(f"{BASE_URL}/api/calendar-block", {"settings": settings})
        data = json.loads(body)
        if data.get("code") == 500:
            result["passed"] = False
            result["fatal"] = f"calendar-block error: {data.get('errors', ['unknown'])[0]}"
            for btn in result["buttons"]:
                result["buttons"][btn] = {"ok": False, "error": "calendar-block failed"}
            return result
        html = data.get("html", "")
    except Exception as e:
        result["passed"] = False
        result["fatal"] = f"calendar-block request failed: {e}"
        for btn in result["buttons"]:
            result["buttons"][btn] = {"ok": False, "error": "calendar-block unreachable"}
        return result

    # Step 2: Extract all 4 links
    links = {
        "google":    (re.search(r'href="(https://calendar\.google\.com[^"]+)"', html) or [None, None])[1],
        "apple":     (re.search(r'href="(https?://[^"]+/api/ics[^"]+)"', html) or [None, None])[1],
        "outlook":   (re.search(r'href="(https://outlook\.live\.com[^"]+)"', html) or [None, None])[1],
        "office365": (re.search(r'href="(https://outlook\.office\.com[^"]+)"', html) or [None, None])[1],
    }

    # Step 3: Validate each button
    ok, err = validate_google_url(links["google"])
    result["buttons"]["Google"] = {"ok": ok, "error": err}

    ok, err = validate_ics_url(links["apple"])   # ← actually fetches and reads the ICS file
    result["buttons"]["Apple"] = {"ok": ok, "error": err}

    ok, err = validate_outlook_url(links["outlook"], "outlook")
    result["buttons"]["Outlook"] = {"ok": ok, "error": err}

    ok, err = validate_outlook_url(links["office365"], "office365")
    result["buttons"]["Office 365"] = {"ok": ok, "error": err}

    # Overall pass = all buttons ok
    if any(not v["ok"] for v in result["buttons"].values()):
        result["passed"] = False

    return result


# ---------------------------------------------------------------------------
# Slack notification
# ---------------------------------------------------------------------------
def get_slack_webhook():
    try:
        with open(SLACK_WEBHOOK_FILE) as f:
            return f.read().strip()
    except OSError:
        return os.environ.get("SLACK_WEBHOOK_URL")


def build_slack_payload(results, total_ms):
    passed = sum(1 for r in results if r["passed"])
    failed = len(results) - passed
    all_ok = failed == 0

    # Header line
    if all_ok:
        header = f"✅ *Kit Calendar — All buttons working* ({passed}/{len(results)} scenarios)"
    else:
        header = f"🚨 *Kit Calendar — {failed} scenario{'s' if failed > 1 else ''} FAILING*"

    # Per-scenario lines
    lines = []
    for r in results:
        icon = "✅" if r["passed"] else "❌"
        if r["passed"]:
            lines.append(f"  {icon} {r['name']}")
        elif r.get("fatal"):
            lines.append(f"  {icon} {r['name']} — {r['fatal']}")
        else:
            broken = [(btn, v["error"]) for btn, v in r["buttons"].items() if not v["ok"]]
            for btn, err in broken:
                lines.append(f"  {icon} {r['name']} / {btn}: {err}")

    body = header + "\n" + "\n".join(lines)

    blocks = [
        {"type": "section", "text": {"type": "mrkdwn", "text": body}},
    ]

    # Coverage note — only shown when fully passing, so "working" means genuinely tested
    if all_ok:
        blocks.append({
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": "Google ✓  Apple (ICS fetched) ✓  Outlook ✓  Office 365 ✓  ·  6 scenarios (v1+v2)  ·  end-to-end HTTP"}]
        })

    blocks.append({
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": f"Ran {total_ms}ms · {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"}]
    })

    return {"blocks": blocks}


def send_slack(payload):
    webhook_url = get_slack_webhook()
    if not webhook_url:
        print("ERROR: No Slack webhook URL found", file=sys.stderr)
        return False
    try:
        _, _ = http_post(webhook_url, payload, timeout=10)
        return True
    except Exception as e:
        print(f"ERROR: Slack notification failed: {e}", file=sys.stderr)
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Kit Calendar health check starting...")

    t0 = time.time()
    results = []
    for tc in TEST_CASES:
        print(f"  Testing: {tc['name']}...", end=" ", flush=True)
        r = run_test(tc)
        results.append(r)
        status = "PASS" if r["passed"] else "FAIL"
        print(status)
        if not r["passed"]:
            if r.get("fatal"):
                print(f"    FATAL: {r['fatal']}")
            for btn, v in r["buttons"].items():
                if not v["ok"]:
                    print(f"    {btn}: {v['error']}")

    total_ms = int((time.time() - t0) * 1000)
    passed = sum(1 for r in results if r["passed"])
    print(f"\nResults: {passed}/{len(results)} passed ({total_ms}ms)")

    payload = build_slack_payload(results, total_ms)
    ok = send_slack(payload)
    print("Slack notification sent." if ok else "Slack notification FAILED.")

    # Exit non-zero if any tests failed (so cron logs show the failure)
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
