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

  if (getStorageMode() === "postgres") {
    const sql = await getSql();
    await ensureSchema(sql);
    const ticketCode = await makePostgresTicketCode(sql);
    const result = await sql`
      INSERT INTO vplf_tickets (
        id, ticket_code, username, game_id, item_won, message_link, server_link,
        additional_info, requester_discord_id, requester_username, status, created_at
      )
      VALUES (
        ${crypto.randomUUID()}, ${ticketCode}, ${ticket.username}, ${ticket.gameId},
        ${ticket.itemWon}, ${ticket.messageLink}, ${ticket.serverLink}, ${ticket.additionalInfo},
        ${user.id}, ${displayDiscordName(user)}, 'pending', ${new Date().toISOString()}
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
    requesterDiscordId: user.id,
    requesterUsername: displayDiscordName(user),
    status: "pending",
    createdAt: new Date().toISOString(),
    reviewedAt: null
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

export async function updateTicketStatus(ticketId, status, reviewer) {
  if (!["pending", "approved"].includes(status)) {
    const error = new Error("Status is not valid");
    error.statusCode = 400;
    throw error;
  }

  if (getStorageMode() === "postgres") {
    const sql = await getSql();
    await ensureSchema(sql);
    const result = await sql`
      UPDATE vplf_tickets
      SET status = ${status},
          reviewed_at = ${status === "approved" ? new Date().toISOString() : null},
          reviewed_by_discord_id = ${status === "approved" ? reviewer.id : null},
          reviewed_by_username = ${status === "approved" ? displayDiscordName(reviewer) : null}
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
      status,
      reviewedAt: status === "approved" ? new Date().toISOString() : null,
      reviewedByDiscordId: status === "approved" ? reviewer.id : null,
      reviewedByUsername: status === "approved" ? displayDiscordName(reviewer) : null
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
    additionalInfo: clean(data.additionalInfo)
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
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by_discord_id TEXT,
      reviewed_by_username TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_vplf_tickets_status ON vplf_tickets(status)`;
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
  return {
    id: row.id,
    ticketCode: row.ticket_code,
    username: row.username,
    gameId: row.game_id,
    itemWon: row.item_won,
    messageLink: row.message_link,
    serverLink: row.server_link,
    additionalInfo: row.additional_info,
    requesterDiscordId: row.requester_discord_id,
    requesterUsername: row.requester_username,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedByDiscordId: row.reviewed_by_discord_id,
    reviewedByUsername: row.reviewed_by_username
  };
}

async function readLocalTickets() {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    return JSON.parse(raw);
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

function displayDiscordName(user) {
  return user.globalName || user.username || "Discord User";
}
