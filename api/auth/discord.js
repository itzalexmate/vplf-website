import crypto from "node:crypto";
import { getRedirectUri, makeStateCookie } from "../../lib/auth.js";
import { redirect } from "../../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  if (!process.env.DISCORD_CLIENT_ID) {
    res.statusCode = 500;
    res.end("DISCORD_CLIENT_ID is missing");
    return;
  }

  const redirectUri = getRedirectUri(req);
  if (!redirectUri.endsWith("/api/auth/callback")) {
    res.statusCode = 500;
    res.end("DISCORD_REDIRECT_URI must end with /api/auth/callback");
    return;
  }

  const state = crypto.randomBytes(24).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "identify",
    state,
    prompt: "consent"
  });

  redirect(res, `https://discord.com/oauth2/authorize?${params.toString()}`, 302, [
    makeStateCookie(req, state)
  ]);
}
