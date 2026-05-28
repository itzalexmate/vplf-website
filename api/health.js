import { getStorageMode, isStorageReady } from "../lib/storage.js";
import { sendJson, methodNotAllowed } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  sendJson(res, 200, {
    ok: true,
    ready: isStorageReady()
      && Boolean(process.env.DISCORD_CLIENT_ID)
      && Boolean(process.env.DISCORD_CLIENT_SECRET)
      && Boolean(process.env.SESSION_SECRET),
    auth: "discord-oauth",
    storage: getStorageMode()
  });
}
