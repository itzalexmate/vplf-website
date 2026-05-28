import { clearSessionCookie } from "../../lib/auth.js";
import { redirect, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  const cookie = clearSessionCookie(req);

  if (req.method === "GET") {
    redirect(res, "/", 302, [cookie]);
    return;
  }

  if (req.method === "POST") {
    res.setHeader("Set-Cookie", cookie);
    sendJson(res, 200, { ok: true });
    return;
  }

  res.statusCode = 405;
  res.end("Method not allowed");
}
