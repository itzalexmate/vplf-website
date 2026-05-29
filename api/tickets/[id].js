import { getBaseUrl, requireStaff } from "../../lib/auth.js";
import { methodNotAllowed, readJson, sendJson } from "../../lib/http.js";
import { getTicketById, updateTicketBatch, updateTicketStatus } from "../../lib/storage.js";
import { notifyTicketDecision } from "../../lib/notifications.js";

const DECISION_STATUSES = ["approved", "denied", "rejected"];

export default async function handler(req, res) {
  try {
    const user = requireStaff(req);
    const ticketId = getTicketId(req);

    if (req.method === "PATCH") {
      const body = await readJson(req);
      let ticket = await getTicketById(ticketId);

      if (!ticket) {
        sendJson(res, 404, { error: "Ticket not found" });
        return;
      }

      const previousStatus = ticket.status;
      const statusRequested = Object.hasOwn(body, "status");
      const batchRequested = Object.hasOwn(body, "batchCode") || Object.hasOwn(body, "batchMode");
      const notifications = [];

      if (statusRequested) {
        ticket = await updateTicketStatus(ticketId, String(body.status || ""), user, {
          decisionReason: body.decisionReason
        });
      }

      if (batchRequested) {
        ticket = await updateTicketBatch(ticketId, {
          batchCode: body.batchCode,
          batchMode: body.batchMode
        }, user);
      }

      if (!ticket) {
        sendJson(res, 404, { error: "Ticket not found" });
        return;
      }

      if (statusRequested && ticket.status !== previousStatus && DECISION_STATUSES.includes(ticket.status)) {
        notifications.push(...await notifyTicketDecision(ticket, ticket.status, user));
      }

      sendJson(res, 200, { ticket, notifications });
      return;
    }

    if (req.method === "DELETE") {
      const ticket = await updateTicketStatus(ticketId, "denied", user, {
        decisionReason: "Denied from legacy delete action"
      });

      if (!ticket) {
        sendJson(res, 404, { error: "Ticket not found" });
        return;
      }

      const notifications = await notifyTicketDecision(ticket, "denied", user);
      sendJson(res, 200, { ok: true, ticket, notifications });
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
