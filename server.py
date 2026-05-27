from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "tickets.sqlite3"
ADMIN_PASSWORD = os.environ.get("VPLF_ADMIN_PASSWORD", "VPLF2026")
DEFAULT_PORT = int(os.environ.get("PORT", "5500"))

ITEMS = {
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
    "VPLF Boots Pink",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                ticket_code TEXT NOT NULL UNIQUE,
                username TEXT NOT NULL,
                game_id TEXT NOT NULL,
                item_won TEXT NOT NULL,
                message_link TEXT NOT NULL,
                server_link TEXT NOT NULL,
                additional_info TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                reviewed_at TEXT
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at)")


def row_to_ticket(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "ticketCode": row["ticket_code"],
        "username": row["username"],
        "gameId": row["game_id"],
        "itemWon": row["item_won"],
        "messageLink": row["message_link"],
        "serverLink": row["server_link"],
        "additionalInfo": row["additional_info"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "reviewedAt": row["reviewed_at"],
    }


def make_ticket_code(db: sqlite3.Connection) -> str:
    while True:
        code = f"VPLF-{uuid.uuid4().hex[:6].upper()}"
        exists = db.execute("SELECT 1 FROM tickets WHERE ticket_code = ?", (code,)).fetchone()
        if not exists:
            return code


def validate_ticket(data: dict) -> dict:
    fields = {
        "username": "Username",
        "gameId": "In-game ID",
        "itemWon": "Item won",
        "messageLink": "Discord message link",
        "serverLink": "Server link",
    }
    cleaned = {}

    for key, label in fields.items():
        value = str(data.get(key, "")).strip()
        if not value:
            raise ValueError(f"{label} is required")
        cleaned[key] = value

    if cleaned["itemWon"] not in ITEMS:
        raise ValueError("Selected item is not valid")

    for key in ("messageLink", "serverLink"):
        if not cleaned[key].startswith(("http://", "https://")):
            raise ValueError("Links must start with http:// or https://")

    cleaned["additionalInfo"] = str(data.get("additionalInfo", "")).strip()
    return cleaned


def create_ticket(data: dict) -> dict:
    ticket = validate_ticket(data)

    with connect() as db:
        ticket_id = uuid.uuid4().hex
        ticket_code = make_ticket_code(db)
        created_at = now_iso()
        db.execute(
            """
            INSERT INTO tickets (
                id, ticket_code, username, game_id, item_won, message_link,
                server_link, additional_info, status, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
            (
                ticket_id,
                ticket_code,
                ticket["username"],
                ticket["gameId"],
                ticket["itemWon"],
                ticket["messageLink"],
                ticket["serverLink"],
                ticket["additionalInfo"],
                created_at,
            ),
        )
        row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        return row_to_ticket(row)


def list_tickets() -> list[dict]:
    with connect() as db:
        rows = db.execute("SELECT * FROM tickets ORDER BY created_at DESC").fetchall()
        return [row_to_ticket(row) for row in rows]


def update_ticket(ticket_id: str, status: str) -> dict | None:
    if status not in {"pending", "approved"}:
        raise ValueError("Status is not valid")

    with connect() as db:
        db.execute(
            "UPDATE tickets SET status = ?, reviewed_at = ? WHERE id = ?",
            (status, now_iso() if status == "approved" else None, ticket_id),
        )
        row = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
        return row_to_ticket(row) if row else None


def delete_ticket(ticket_id: str) -> bool:
    with connect() as db:
        result = db.execute("DELETE FROM tickets WHERE id = ?", (ticket_id,))
        return result.rowcount > 0


class VPLFHandler(SimpleHTTPRequestHandler):
    server_version = "VPLFTicketServer/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/health":
            self.send_json({"ok": True, "database": "sqlite", "path": str(DB_PATH.name)})
            return

        if path == "/api/tickets":
            if not self.is_admin():
                self.send_json({"error": "Incorrect password"}, status=401)
                return
            self.send_json({"tickets": list_tickets()})
            return

        if path.startswith("/data/"):
            self.send_error(404)
            return

        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/tickets":
            try:
                ticket = create_ticket(self.read_json())
                self.send_json({"ticket": ticket}, status=201)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
            return

        self.send_error(404)

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path

        if path.startswith("/api/tickets/"):
            if not self.is_admin():
                self.send_json({"error": "Incorrect password"}, status=401)
                return

            ticket_id = path.rsplit("/", 1)[-1]
            try:
                ticket = update_ticket(ticket_id, str(self.read_json().get("status", "")).strip())
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return

            if not ticket:
                self.send_json({"error": "Ticket not found"}, status=404)
                return

            self.send_json({"ticket": ticket})
            return

        self.send_error(404)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path

        if path.startswith("/api/tickets/"):
            if not self.is_admin():
                self.send_json({"error": "Incorrect password"}, status=401)
                return

            ticket_id = path.rsplit("/", 1)[-1]
            if not delete_ticket(ticket_id):
                self.send_json({"error": "Ticket not found"}, status=404)
                return

            self.send_json({"ok": True})
            return

        self.send_error(404)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 65536:
            raise ValueError("Request is too large")
        if not length:
            return {}
        raw_body = self.rfile.read(length)
        return json.loads(raw_body.decode("utf-8"))

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def is_admin(self) -> bool:
        return self.headers.get("X-Admin-Password") == ADMIN_PASSWORD

    def log_message(self, format: str, *args) -> None:
        print(f"[VPLF] {self.address_string()} - {format % args}")


def serve() -> None:
    init_db()

    for port in range(DEFAULT_PORT, DEFAULT_PORT + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), VPLFHandler)
            break
        except OSError:
            continue
    else:
        raise SystemExit("No open port found.")

    print("VPLF Ticket System")
    print(f"Admin password: {ADMIN_PASSWORD}")
    print(f"SQLite database: {DB_PATH}")
    print(f"Open: http://127.0.0.1:{server.server_port}/")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    serve()
