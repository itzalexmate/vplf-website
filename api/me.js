import { getSession } from "../lib/auth.js";
import { sendJson, methodNotAllowed } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  sendJson(res, 200, {
    user: getSession(req)
  });
}
