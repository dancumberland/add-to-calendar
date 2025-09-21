// /api/ics/[id].js
// Serves the previously generated ICS text stored in Vercel KV.

import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  const { id } = req.query;
  
  const icsText = await kv.get(id);
  
  if (!icsText) {
    return res.status(404).send("ICS not found");
  }

  // Don't delete the key - let it expire naturally after 24 hours
  // This allows multiple accesses for testing and actual use

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="invite.ics"`
  );
  return res.status(200).send(icsText);
}
