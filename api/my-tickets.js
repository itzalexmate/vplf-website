import { requireUser } from "../lib/auth.js";
import { sendJson, methodNotAllowed } from "../lib/http.js";
import { listTicketsForUser } from "../lib/storage.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    const user = requireUser(req);
    const tickets = await listTicketsForUser(user.id);
    sendJson(res, 200, { tickets });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Unable to load tickets" });
  }
}
