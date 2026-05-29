export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

export function sendHtml(res, status, title, message, actionHref = "/", actionText = "Return Home") {
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050814;color:#f8f9ff;font-family:Calibri,Arial,sans-serif}
    main{width:min(92vw,520px);border:1px solid rgba(255,61,165,.35);border-radius:8px;padding:28px;background:#0c1121;box-shadow:0 28px 90px rgba(0,0,0,.58)}
    h1{margin:0 0 10px;font-size:28px}
    p{color:#b8c2d8;line-height:1.45}
    a{display:inline-flex;margin-top:12px;min-height:40px;align-items:center;padding:0 14px;border-radius:8px;color:#fff;background:linear-gradient(135deg,#ff174f,#ff3da5 60%,#5d76ff);text-decoration:none;font-weight:700}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <a href="${escapeAttribute(actionHref)}">${escapeHtml(actionText)}</a>
  </main>
</body>
</html>`;
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

export function redirect(res, location, status = 302, cookies = []) {
  res.statusCode = status;
  res.setHeader("Location", location);
  if (cookies.length) {
    res.setHeader("Set-Cookie", cookies);
  }
  res.end();
}

export async function readJson(req) {
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString("utf8") || "{}");
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  sendJson(res, 405, { error: "Method not allowed" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
