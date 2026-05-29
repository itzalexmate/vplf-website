import crypto from "node:crypto";
import { loadLocalEnv } from "./env.js";

loadLocalEnv();

const SESSION_COOKIE = "vplf_session";
const STATE_COOKIE = "vplf_oauth_state";
const SESSION_DAYS = 7;

export function getBaseUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host && process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }

  if (!host && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  const resolvedHost = host || "localhost:3000";
  const protocol = req.headers["x-forwarded-proto"] || (String(host).includes("localhost") ? "http" : "https");
  return `${protocol}://${resolvedHost}`;
}

export function getRedirectUri(req) {
  return process.env.DISCORD_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/callback`;
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [
          decodeURIComponent(cookie.slice(0, index)),
          decodeURIComponent(cookie.slice(index + 1))
        ];
      })
  );
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function makeStateCookie(req, state) {
  return serializeCookie(STATE_COOKIE, state, {
    maxAge: 10 * 60,
    secure: isSecureRequest(req)
  });
}

export function clearStateCookie(req) {
  return serializeCookie(STATE_COOKIE, "", {
    maxAge: 0,
    secure: isSecureRequest(req)
  });
}

export function clearSessionCookie(req) {
  return serializeCookie(SESSION_COOKIE, "", {
    maxAge: 0,
    secure: isSecureRequest(req)
  });
}

export function getExpectedState(req) {
  return parseCookies(req)[STATE_COOKIE] || "";
}

export function getStaffIds() {
  return new Set(
    String(process.env.DISCORD_STAFF_IDS || "")
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function isStaff(discordId) {
  return getStaffIds().has(String(discordId));
}

export function createSessionCookie(req, discordUser) {
  const session = {
    id: discordUser.id,
    username: discordUser.username,
    globalName: discordUser.global_name || discordUser.globalName || "",
    avatar: discordUser.avatar || "",
    avatarUrl: getAvatarUrl(discordUser),
    staff: isStaff(discordUser.id),
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  };

  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(body);
  return serializeCookie(SESSION_COOKIE, `${body}.${signature}`, {
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: isSecureRequest(req)
  });
}

export function getSession(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) {
    return null;
  }

  const [body, signature] = raw.split(".");
  if (!body || !signature || !safeEqual(signature, sign(body))) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!session.exp || session.exp < Date.now()) {
      return null;
    }

    return {
      ...session,
      staff: isStaff(session.id)
    };
  } catch {
    return null;
  }
}

export function requireUser(req) {
  const user = getSession(req);
  if (!user) {
    const error = new Error("Discord login required");
    error.statusCode = 401;
    throw error;
  }

  return user;
}

export function requireStaff(req) {
  const user = requireUser(req);
  if (!user.staff) {
    const error = new Error("Staff Discord ID required");
    error.statusCode = 403;
    throw error;
  }

  return user;
}

function sign(value) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (process.env.VERCEL) {
    throw new Error("SESSION_SECRET is required");
  }

  return "local-development-session-secret";
}

function getAvatarUrl(user) {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  }

  const fallback = Number(user.discriminator || 0) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${fallback}.png`;
}

function isSecureRequest(req) {
  const protocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0];
  if (protocol) {
    return protocol === "https";
  }

  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  return !host.includes("localhost") && !host.startsWith("127.0.0.1");
}
