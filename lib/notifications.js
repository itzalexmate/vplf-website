import { loadLocalEnv } from "./env.js";

loadLocalEnv();

const DISCORD_API = "https://discord.com/api/v10";

export async function notifyTicketDecision(ticket, decision, reviewer) {
  const results = [];
  const message = buildDecisionMessage(ticket, decision, reviewer);

  if (ticket.notifyEmail && ticket.notificationEmail) {
    results.push(await safeNotify("email", () => sendEmailNotice(ticket.notificationEmail, ticket, decision, message)));
  }

  if (ticket.notifyDiscord && ticket.requesterDiscordId) {
    results.push(await safeNotify("discord", () => sendDiscordDm(ticket.requesterDiscordId, message)));
  }

  return results;
}

export function getNotificationHealth() {
  return {
    emailConfigured: Boolean(getSmtpConfig()),
    discordDmConfigured: Boolean(process.env.DISCORD_BOT_TOKEN)
  };
}

async function safeNotify(type, task) {
  try {
    await task();
    return { type, ok: true };
  } catch (error) {
    console.warn(`[notification:${type}] ${error.message}`);
    return { type, ok: false, error: error.message };
  }
}

async function sendEmailNotice(to, ticket, decision, text) {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("Email notifications are not configured");
  }

  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport(config.transport);

  await transporter.sendMail({
    from: config.from,
    to,
    subject: `VPLF claim ${decision}: ${ticket.ticketCode}`,
    text,
    html: htmlEmail(ticket, decision, text)
  });
}

async function sendDiscordDm(discordId, content) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("Discord DM notifications are not configured");
  }

  const channelResponse = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ recipient_id: discordId })
  });

  if (!channelResponse.ok) {
    throw new Error(`Discord DM channel failed (${channelResponse.status})`);
  }

  const channel = await channelResponse.json();
  const messageResponse = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: content.slice(0, 1900),
      allowed_mentions: { parse: [] }
    })
  });

  if (!messageResponse.ok) {
    throw new Error(`Discord DM send failed (${messageResponse.status})`);
  }
}

function getSmtpConfig() {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false";

  return {
    from: process.env.SMTP_FROM || process.env.MAIL_FROM || `VPLF Ticket System <${user}>`,
    transport: {
      host,
      port,
      secure,
      auth: { user, pass }
    }
  };
}

function buildDecisionMessage(ticket, decision, reviewer) {
  const statusLines = {
    approved: "Your VPLF claim was approved.",
    denied: "Your VPLF claim was denied.",
    rejected: "Your VPLF claim was rejected."
  };

  const lines = [
    statusLines[decision] || "Your VPLF claim was reviewed.",
    "",
    `Ticket: ${ticket.ticketCode}`,
    `Batch: ${ticket.batchCode || "Unassigned"}`,
    `Item: ${ticket.itemWon}`,
    `Username: ${ticket.username}`,
    `In-game ID: ${ticket.gameId}`,
    `Reviewed by: ${reviewer.globalName || reviewer.username || "VPLF Staff"}`
  ];

  if (ticket.decisionReason) {
    lines.push(`Reason: ${ticket.decisionReason}`);
  }

  return [
    ...lines,
    "",
    "You received this because you opted into notifications for this claim."
  ].join("\n");
}

function htmlEmail(ticket, decision, text) {
  const color = decision === "approved" ? "#2ee87b" : decision === "rejected" ? "#f9c85c" : "#ff4b5e";
  return `
    <div style="background:#050814;color:#f8f9ff;font-family:Calibri,Arial,sans-serif;padding:28px">
      <div style="max-width:560px;margin:auto;border:1px solid rgba(255,61,165,.35);border-radius:8px;padding:22px;background:#0c1121">
        <p style="margin:0 0 8px;color:#ff9bd1;font-weight:700;text-transform:uppercase">VPLF Ticket System</p>
        <h1 style="margin:0 0 14px;color:${color};font-size:24px">Claim ${escapeHtml(decision)}</h1>
        <pre style="white-space:pre-wrap;color:#f8f9ff;font-family:Calibri,Arial,sans-serif;line-height:1.45">${escapeHtml(text)}</pre>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
