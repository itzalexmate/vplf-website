import crypto from "node:crypto";
import { getRedirectUri, makeStateCookie } from "../../lib/auth.js";
import { redirect, sendHtml } from "../../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  if (!process.env.DISCORD_CLIENT_ID) {
    sendHtml(res, 500, "Discord Login Not Configured", "DISCORD_CLIENT_ID is missing in the running environment. Add it in Vercel Environment Variables and redeploy.");
    return;
  }

  if (!process.env.DISCORD_CLIENT_SECRET) {
    sendHtml(res, 500, "Discord Login Not Configured", "DISCORD_CLIENT_SECRET is missing in the running environment. Add it in Vercel Environment Variables and redeploy.");
    return;
  }

  if (process.env.VERCEL && !process.env.SESSION_SECRET) {
    sendHtml(res, 500, "Session Secret Missing", "SESSION_SECRET is required on Vercel so Discord sessions can be signed.");
    return;
  }

  const redirectUri = getRedirectUri(req);
  if (!redirectUri.endsWith("/api/auth/callback")) {
    sendHtml(res, 500, "Discord Redirect Is Wrong", "DISCORD_REDIRECT_URI must end with /api/auth/callback. The /api/auth/discord route only starts login.");
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

  res.setHeader("Cache-Control", "no-store");
  redirect(res, `https://discord.com/oauth2/authorize?${params.toString()}`, 302, [
    makeStateCookie(req, state)
  ]);
}
