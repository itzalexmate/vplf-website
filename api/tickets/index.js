import { requireStaff, requireUser } from "../../lib/auth.js";
import { methodNotAllowed, readJson, sendJson } from "../../lib/http.js";
import { createTicket, listTickets } from "../../lib/storage.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      requireStaff(req);
      const tickets = await listTickets();
      sendJson(res, 200, { tickets });
      return;
    }

    if (req.method === "POST") {
      const user = requireUser(req);
      const ticket = await createTicket(await readJson(req), user);
      sendJson(res, 201, { ticket });
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Ticket request failed" });
  }
}
