// /api/ics/index.js
// Stateless ICS generation — builds the .ics file on the fly from query params.
// This replaces the old KV-based approach so Apple calendar links never expire.

import { buildIcs } from "../../utils/buildIcs.js";

export default async function handler(req, res) {
  const { title, start, end, location, description } = req.query;

  if (!title || !start || !end) {
    return res.status(400).send("Missing required params: title, start, end");
  }

  // start/end are UTC timestamps in ISO format (e.g., "2026-03-05T18:00:00.000Z")
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).send("Invalid start or end date");
  }

  const icsText = buildIcs({
    title: decodeURIComponent(title),
    description: description ? decodeURIComponent(description) : "",
    location: location ? decodeURIComponent(location) : "",
    start: startDate,
    end: endDate,
  });

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="invite.ics"`
  );
  return res.status(200).send(icsText);
}
