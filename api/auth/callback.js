import {
  clearStateCookie,
  createSessionCookie,
  getBaseUrl,
  getExpectedState,
  getRedirectUri
} from "../../lib/auth.js";
import { redirect, sendHtml } from "../../lib/http.js";

const DISCORD_API = "https://discord.com/api";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const baseUrl = getBaseUrl(req);
  const url = new URL(req.url, baseUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getExpectedState(req);

  if (!code || !state || !expectedState || state !== expectedState) {
    sendHtml(res, 400, "Discord Login Expired", "The OAuth session expired or the state cookie was blocked. Start the Discord login again.", "/api/auth/discord", "Try Login Again");
    return;
  }

  try {
    const token = await exchangeCode(req, code);
    const discordUser = await getDiscordUser(token.access_token);
    redirect(res, "/?view=ticket&auth=discord", 302, [
      clearStateCookie(req),
      createSessionCookie(req, discordUser)
    ]);
  } catch (error) {
    res.setHeader("Set-Cookie", clearStateCookie(req));
    sendHtml(res, 502, "Discord Login Failed", error.message || "Discord did not complete the login request.", "/", "Return Home");
  }
}

async function exchangeCode(req, code) {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    throw new Error("Discord OAuth environment variables are missing");
  }

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(req)
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error("Discord token exchange failed");
  }

  return response.json();
}

async function getDiscordUser(accessToken) {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error("Discord profile lookup failed");
  }

  return response.json();
}
