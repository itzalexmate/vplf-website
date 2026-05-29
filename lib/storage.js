import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { loadLocalEnv } from "./env.js";

loadLocalEnv();

export const ITEMS = [
  "VPLF Boots Blue (Old)",
  "VPLF Hat Blue (Old)",
  "VPLF Boots Red",
  "VPLF Goggles Red",
  "VPLF Hat Red",
  "VPLF Mask Red",
  "VPLF Gloves Red",
  "VPLF Injury Mask Red",
  "VPLF Glasses Golden",
  "VPLF Hood Golden",
  "VPLF Boots Pink"
];

const LOCAL_DIR = path.join(process.cwd(), ".local-data");
const LOCAL_FILE = path.join(LOCAL_DIR, "tickets.json");
const VALID_TICKET_STATUSES = ["pending", "approved", "denied", "rejected"];
const DECISION_STATUSES = ["approved", "denied", "rejected"];

let schemaReady = false;

export function getStorageMode() {
  if (getPostgresUrl()) {
    return "postgres";
  }

  if (process.env.VERCEL) {
    return "missing-postgres";
  }

  return "local-file";
}

export function isStorageReady() {
  return getStorageMode() !== "missing-postgres";
}

export async function createTicket(data, user) {
  const ticket = validateTicket(data, user);
  const now = new Date().toISOString();
  const batchCode = makeAutomaticBatchCode(now);

  if (getStorageMode() === "postgres") {
    const sql = await getSql();
    await ensureSchema(sql);
    const ticketCode = await makePostgresTicketCode(sql);
    const result = await sql`
      INSERT INTO vplf_tickets (
        id, ticket_code, username, game_id, item_won, message_link, server_link,
        additional_info, requester_discord_id, requester_username, notification_email,
        notify_email, notify_discord, status, created_at, decision_reason,
        batch_code, batch_mode, batch_assigned_at, batch_assigned_by_discord_id,
        batch_assigned_by_username
      )
      VALUES (
        ${crypto.randomUUID()}, ${ticketCode}, ${ticket.username}, ${ticket.gameId},
        ${ticket.itemWon}, ${ticket.messageLink}, ${ticket.serverLink}, ${ticket.additionalInfo},
        ${user.id}, ${displayDiscordName(user)}, ${ticket.notificationEmail},
        ${ticket.notifyEmail}, ${ticket.notifyDiscord}, 'pending', ${now}, '',
        ${batchCode}, 'auto', ${now}, null, 'System'
      )
      RETURNING *
    `;
    return rowToTicket(result.rows[0]);
  }

  assertLocalStorage();
  const tickets = await readLocalTickets();
  const ticketCode = makeLocalTicketCode(tickets);
  const record = {
    id: crypto.randomUUID(),
    ticketCode,
    username: ticket.username,
    gameId: ticket.gameId,
    itemWon: ticket.itemWon,
    messageLink: ticket.messageLink,
    serverLink: ticket.serverLink,
    additionalInfo: ticket.additionalInfo,
    notificationEmail: ticket.notificationEmail,
    notifyEmail: ticket.notifyEmail,
    notifyDiscord: ticket.notifyDiscord,
    requesterDiscordId: user.id,
    requesterUsername: displayDiscordName(user),
    status: "pending",
    decisionReason: "",
    createdAt: now,
    reviewedAt: null,
    reviewedByDiscordId: null,
    reviewedByUsername: null,
    batchCode,
    batchMode: "auto",
    batchAssignedAt: now,
    batchAssignedByDiscordId: null,
    batchAssignedByUsername: "System"
  };
  tickets.unshift(record);
  await writeLocalTickets(tickets);
  return record;
}

export async function listTickets() {
  if (getStorageMode() === "postgres") {
    const sql = await getSql();
    await ensureSchema(sql);
    const result = await sql`SELECT * FROM vplf_tickets ORDER BY created_at DESC`;
    return result.rows.map(rowToTicket);
  }

  assertLocalStorage();
  return readLocalTickets();
}

export async function listTicketsForUser(discordId) {
  if (getStorageMode() === "postgres") {
    const sql = await getSql();
    await ensureSchema(sql);
    const result = await sql`
      SELECT * FROM vplf_tickets
      WHERE requester_discord_id = ${discordId}
      ORDER BY created_at DESC
    `;
    return result.rows.map(rowToTicket);
  }

  assertLocalStorage();
  const tickets = await readLocalTickets();
  return tickets.filter((ticket) => ticket.requesterDiscordId === discordId);
}

export async function getTicketById(ticketId) {
  if (getStorageMode() === "postgres") {
    const sql = await getSql();
    await ensureSchema(sql);
    const result = await sql`SELECT * FROM vplf_tickets WHERE id = ${ticketId}`;
    return result.rows[0] ? rowToTicket(result.rows[0]) : null;
  }

  assertLocalStorage();
  const tickets = await readLocalTickets();
  return tickets.find((ticket) => ticket.id === ticketId) || null;
}

export async function updateTicketStatus(ticketId, status, reviewer, options = {}) {
  const nextStatus = clean(status).toLowerCase();
  if (!VALID_TICKET_STATUSES.includes(nextStatus)) {
    const error = new Error("Status is not valid");
    error.statusCode = 400;
    throw error;
  }

  const reviewed = DECISION_STATUSES.includes(nextStatus);
  const reviewedAt = reviewed ? new Date().toISOString() : null;
  const reviewedByDiscordId = reviewed ? reviewer.id : null;
  const reviewedByUsername = reviewed ? displayDiscordName(reviewer) : null;
  const decisionReason = reviewed ? normalizeDecisionReason(options.decisionReason) : "";

  if (getStorageMode() === "postgres") {
    const sql = await getSql();
    await ensureSchema(sql);
    const result = await sql`
      UPDATE vplf_tickets
      SET status = ${nextStatus},
          reviewed_at = ${reviewedAt},
          reviewed_by_discord_id = ${reviewedByDiscordId},
          reviewed_by_username = ${reviewedByUsername},
          decision_reason = ${decisionReason}
      WHERE id = ${ticketId}
      RETURNING *
    `;
    return result.rows[0] ? rowToTicket(result.rows[0]) : null;
  }

  assertLocalStorage();
  const tickets = await readLocalTickets();
  let updated = null;
  const nextTickets = tickets.map((ticket) => {
    if (ticket.id !== ticketId) {
      return ticket;
    }

    updated = {
      ...ticket,
      status: nextStatus,
      reviewedAt,
      reviewedByDiscordId,
      reviewedByUsername,
      decisionReason
    };
    return updated;
  });

  await writeLocalTickets(nextTickets);
  return updated;
}

export async function updateTicketBatch(ticketId, data, reviewer) {
  const existingTicket = await getTicketById(ticketId);
  if (!existingTicket) {
    return null;
  }

  const assignment = makeBatchAssignment(existingTicket, data, reviewer);

  if (getStorageMode() === "postgres") {
    const sql = await getSql();
    await ensureSchema(sql);
    const result = await sql`
      UPDATE vplf_tickets
      SET batch_code = ${assignment.batchCode},
          batch_mode = ${assignment.batchMode},
          batch_assigned_at = ${assignment.batchAssignedAt},
          batch_assigned_by_discord_id = ${assignment.batchAssignedByDiscordId},
          batch_assigned_by_username = ${assignment.batchAssignedByUsername}
      WHERE id = ${ticketId}
      RETURNING *
    `;
    return result.rows[0] ? rowToTicket(result.rows[0]) : null;
  }

  assertLocalStorage();
  const tickets = await readLocalTickets();
  let updated = null;
  const nextTickets = tickets.map((ticket) => {
    if (ticket.id !== ticketId) {
      return ticket;
    }

    updated = {
      ...ticket,
      ...assignment
    };
    return updated;
  });

  await writeLocalTickets(nextTickets);
  return updated;
}

export async function deleteTicket(ticketId) {
  if (getStorageMode() === "postgres") {
    const sql = await getSql();
    await ensureSchema(sql);
    const result = await sql`DELETE FROM vplf_tickets WHERE id = ${ticketId}`;
    return result.rowCount > 0;
  }

  assertLocalStorage();
  const tickets = await readLocalTickets();
  const nextTickets = tickets.filter((ticket) => ticket.id !== ticketId);
  await writeLocalTickets(nextTickets);
  return nextTickets.length !== tickets.length;
}

function validateTicket(data, user) {
  if (!user?.id) {
    const error = new Error("Discord login required");
    error.statusCode = 401;
    throw error;
  }

  const ticket = {
    username: clean(data.username),
    gameId: clean(data.gameId),
    itemWon: clean(data.itemWon),
    messageLink: clean(data.messageLink),
    serverLink: clean(data.serverLink),
    additionalInfo: clean(data.additionalInfo),
    notifyEmail: data.notifyEmail === true || data.notifyEmail === "true",
    notificationEmail: clean(data.notificationEmail).toLowerCase(),
    notifyDiscord: data.notifyDiscord === true || data.notifyDiscord === "true"
  };

  const required = [
    ["username", "Username"],
    ["gameId", "In-game ID"],
    ["itemWon", "Item won"],
    ["messageLink", "Discord message link"],
    ["serverLink", "Server link"]
  ];

  for (const [key, label] of required) {
    if (!ticket[key]) {
      const error = new Error(`${label} is required`);
      error.statusCode = 400;
      throw error;
    }
  }

  if (!ITEMS.includes(ticket.itemWon)) {
    const error = new Error("Selected item is not valid");
    error.statusCode = 400;
    throw error;
  }

  for (const key of ["messageLink", "serverLink"]) {
    if (!ticket[key].startsWith("http://") && !ticket[key].startsWith("https://")) {
      const error = new Error("Links must start with http:// or https://");
      error.statusCode = 400;
      throw error;
    }
  }

  if (ticket.notifyEmail && !isValidEmail(ticket.notificationEmail)) {
    const error = new Error("A valid email address is required for email notifications");
    error.statusCode = 400;
    throw error;
  }

  if (!ticket.notifyEmail) {
    ticket.notificationEmail = "";
  }

  return ticket;
}

async function getSql() {
  if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
    process.env.POSTGRES_URL = process.env.DATABASE_URL;
  }

  const { sql } = await import("@vercel/postgres");
  return sql;
}

function getPostgresUrl() {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
}

async function ensureSchema(sql) {
  if (schemaReady) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS vplf_tickets (
      id TEXT PRIMARY KEY,
      ticket_code TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      game_id TEXT NOT NULL,
      item_won TEXT NOT NULL,
      message_link TEXT NOT NULL,
      server_link TEXT NOT NULL,
      additional_info TEXT NOT NULL DEFAULT '',
      requester_discord_id TEXT NOT NULL,
      requester_username TEXT NOT NULL,
      notification_email TEXT NOT NULL DEFAULT '',
      notify_email BOOLEAN NOT NULL DEFAULT FALSE,
      notify_discord BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'pending',
      decision_reason TEXT NOT NULL DEFAULT '',
      batch_code TEXT NOT NULL DEFAULT '',
      batch_mode TEXT NOT NULL DEFAULT 'auto',
      batch_assigned_at TEXT,
      batch_assigned_by_discord_id TEXT,
      batch_assigned_by_username TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by_discord_id TEXT,
      reviewed_by_username TEXT
    )
  `;
  await sql`ALTER TABLE vplf_tickets ADD COLUMN IF NOT EXISTS notification_email TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE vplf_tickets ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE vplf_tickets ADD COLUMN IF NOT EXISTS notify_discord BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE vplf_tickets ADD COLUMN IF NOT EXISTS decision_reason TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE vplf_tickets ADD COLUMN IF NOT EXISTS batch_code TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE vplf_tickets ADD COLUMN IF NOT EXISTS batch_mode TEXT NOT NULL DEFAULT 'auto'`;
  await sql`ALTER TABLE vplf_tickets ADD COLUMN IF NOT EXISTS batch_assigned_at TEXT`;
  await sql`ALTER TABLE vplf_tickets ADD COLUMN IF NOT EXISTS batch_assigned_by_discord_id TEXT`;
  await sql`ALTER TABLE vplf_tickets ADD COLUMN IF NOT EXISTS batch_assigned_by_username TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vplf_tickets_status ON vplf_tickets(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vplf_tickets_batch ON vplf_tickets(batch_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vplf_tickets_requester ON vplf_tickets(requester_discord_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vplf_tickets_created_at ON vplf_tickets(created_at)`;
  schemaReady = true;
}

async function makePostgresTicketCode(sql) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeTicketCode();
    const result = await sql`SELECT id FROM vplf_tickets WHERE ticket_code = ${code}`;
    if (!result.rows.length) {
      return code;
    }
  }

  return makeTicketCode(10);
}

function makeLocalTicketCode(tickets) {
  const existing = new Set(tickets.map((ticket) => ticket.ticketCode));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeTicketCode();
    if (!existing.has(code)) {
      return code;
    }
  }

  return makeTicketCode(10);
}

function makeTicketCode(size = 6) {
  return `VPLF-${crypto.randomBytes(size).toString("hex").slice(0, size).toUpperCase()}`;
}

function rowToTicket(row) {
  const createdAt = row.created_at || new Date().toISOString();
  return {
    id: row.id,
    ticketCode: row.ticket_code,
    username: row.username,
    gameId: row.game_id,
    itemWon: row.item_won,
    messageLink: row.message_link,
    serverLink: row.server_link,
    additionalInfo: row.additional_info,
    notificationEmail: row.notification_email || "",
    notifyEmail: Boolean(row.notify_email),
    notifyDiscord: Boolean(row.notify_discord),
    requesterDiscordId: row.requester_discord_id,
    requesterUsername: row.requester_username,
    status: row.status,
    decisionReason: row.decision_reason || "",
    createdAt,
    reviewedAt: row.reviewed_at,
    reviewedByDiscordId: row.reviewed_by_discord_id,
    reviewedByUsername: row.reviewed_by_username,
    batchCode: row.batch_code || makeAutomaticBatchCode(createdAt),
    batchMode: row.batch_mode || "auto",
    batchAssignedAt: row.batch_assigned_at || createdAt,
    batchAssignedByDiscordId: row.batch_assigned_by_discord_id,
    batchAssignedByUsername: row.batch_assigned_by_username || "System"
  };
}

async function readLocalTickets() {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const tickets = JSON.parse(raw);
    return Array.isArray(tickets) ? tickets.map(normalizeLocalTicket) : [];
  } catch {
    return [];
  }
}

async function writeLocalTickets(tickets) {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(tickets, null, 2));
}

function assertLocalStorage() {
  if (getStorageMode() === "missing-postgres") {
    const error = new Error("POSTGRES_URL is required on Vercel");
    error.statusCode = 500;
    throw error;
  }
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeDecisionReason(value) {
  return clean(value).slice(0, 280);
}

function makeBatchAssignment(ticket, data, reviewer) {
  const mode = clean(data?.batchMode || (data?.batchCode ? "manual" : "auto")).toLowerCase();
  if (!["auto", "manual"].includes(mode)) {
    const error = new Error("Batch mode must be auto or manual");
    error.statusCode = 400;
    throw error;
  }

  const batchCode = mode === "auto"
    ? makeAutomaticBatchCode(ticket.createdAt)
    : normalizeBatchCode(data.batchCode);

  return {
    batchCode,
    batchMode: mode,
    batchAssignedAt: new Date().toISOString(),
    batchAssignedByDiscordId: reviewer.id,
    batchAssignedByUsername: displayDiscordName(reviewer)
  };
}

function normalizeBatchCode(value) {
  const batchCode = clean(value).toUpperCase().replaceAll(/\s+/g, "-").slice(0, 40);
  if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(batchCode)) {
    const error = new Error("Manual batch code must be 2-40 letters, numbers, dots, dashes, or underscores");
    error.statusCode = 400;
    throw error;
  }

  return batchCode;
}

function makeAutomaticBatchCode(value) {
  const source = Number.isNaN(new Date(value).getTime()) ? new Date() : new Date(value);
  return `AUTO-${source.toISOString().slice(0, 10).replaceAll("-", "")}`;
}

function normalizeLocalTicket(ticket) {
  const createdAt = ticket.createdAt || new Date().toISOString();
  const batchCode = ticket.batchCode || makeAutomaticBatchCode(createdAt);

  return {
    ...ticket,
    notificationEmail: ticket.notificationEmail || "",
    notifyEmail: Boolean(ticket.notifyEmail),
    notifyDiscord: Boolean(ticket.notifyDiscord),
    status: VALID_TICKET_STATUSES.includes(ticket.status) ? ticket.status : "pending",
    decisionReason: ticket.decisionReason || "",
    createdAt,
    reviewedAt: ticket.reviewedAt || null,
    reviewedByDiscordId: ticket.reviewedByDiscordId || null,
    reviewedByUsername: ticket.reviewedByUsername || null,
    batchCode,
    batchMode: ticket.batchMode || (ticket.batchCode ? "manual" : "auto"),
    batchAssignedAt: ticket.batchAssignedAt || createdAt,
    batchAssignedByDiscordId: ticket.batchAssignedByDiscordId || null,
    batchAssignedByUsername: ticket.batchAssignedByUsername || "System"
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function displayDiscordName(user) {
  return user.globalName || user.username || "Discord User";
}
