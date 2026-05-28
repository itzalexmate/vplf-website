import { getBaseUrl, requireStaff } from "../../lib/auth.js";
import { methodNotAllowed, readJson, sendJson } from "../../lib/http.js";
import { deleteTicket, updateTicketStatus } from "../../lib/storage.js";

export default async function handler(req, res) {
  try {
    const user = requireStaff(req);
    const ticketId = getTicketId(req);

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const ticket = await updateTicketStatus(ticketId, String(body.status || ""), user);

      if (!ticket) {
        sendJson(res, 404, { error: "Ticket not found" });
        return;
      }

      sendJson(res, 200, { ticket });
      return;
    }

    if (req.method === "DELETE") {
      const deleted = await deleteTicket(ticketId);

      if (!deleted) {
        sendJson(res, 404, { error: "Ticket not found" });
        return;
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ["PATCH", "DELETE"]);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Ticket update failed" });
  }
}

function getTicketId(req) {
  if (req.query?.id) {
    return String(req.query.id);
  }

  const url = new URL(req.url, getBaseUrl(req));
  return decodeURIComponent(url.pathname.split("/").pop() || "");
}
