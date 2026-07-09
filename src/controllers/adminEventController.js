import eventStreamService from "../services/eventStreamService.js";

/**
 * GET /api/v1/admin/events
 * Historical, filterable view of the system-wide event log — the "CCTV
 * footage" backing the System Inspector page. Supports:
 *   ?type=admin.*        prefix match (any admin.* event)
 *   ?type=auth.login     exact match
 *   ?userId=<id>         events for one user
 *   ?limit=100           max 500 per page
 *   ?before=<ISO date>   cursor for "load older" pagination
 */
export async function listEvents(req, res) {
  try {
    const { type, userId, limit, before } = req.query;

    const events = await eventStreamService.getEvents({
      type,
      userId,
      limit: limit ? parseInt(limit, 10) : 100,
      before,
    });

    res.json({ success: true, count: events.length, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
