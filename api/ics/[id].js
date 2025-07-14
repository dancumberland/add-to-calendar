// /api/ics/[id].js
// Serves the previously generated ICS text stored in memory.
// Note: For production-grade persistence you'd store in KV or S3.
// For demo purposes this relies on the in-memory global map populated by html.js.

export default async function handler(req, res) {
  const { id } = req.query;
  const store = globalThis.ICS_STORE;
  if (!store || !store.has(id)) {
    return res.status(404).send("ICS not found");
  }
  const icsText = store.get(id);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="invite-${id}.ics"`
  );
  return res.status(200).send(icsText);
}
