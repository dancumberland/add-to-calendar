# Reply to Molly Winters

---

Hi Molly,

Thanks for the detailed bug report with screenshots—that made all the difference in tracking these down.

**Both issues are now fixed:**

**1. Apple Calendar "ICS not found" error** ✅
The problem was a timezone format mismatch. Kit sends timezones in a format like "Pacific Time (GMT-08:00)" but our backend expected a different format. I've added automatic timezone conversion that handles all the major US and international timezones.

**2. Left alignment not working** ✅  
This one was trickier to find. Turns out Kit sends alignment values as CSS flexbox terms (`flex-start`, `flex-end`) rather than the names shown in the dropdown (`Left`, `Right`). Our code was only looking for the display names, so it kept defaulting to center. Now it handles both formats.

**To see the fixes:**
Just refresh your Kit editor (or remove and re-add the content block if needed). Both the Apple Calendar button and the Left alignment should work correctly now in both the preview and your sent emails.

Let me know if you run into any other issues!

Dan

---

**Technical details (for reference):**
- Deployed: October 13, 2025 @ 2:48 PM MDT
- Production URL: https://kit-app-build.vercel.app
- Timezone mapping: Supports all US timezones + major international cities
- Alignment: Now handles both semantic names (left/right) and flexbox values (flex-start/flex-end)
