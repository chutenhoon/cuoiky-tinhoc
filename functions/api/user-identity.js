const DEVICE_COOKIE = "device_id";

function json(body, status = 200, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  };
  return new Response(JSON.stringify(body), { status, headers });
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach(part => {
    const [k, v] = part.split("=");
    if (!k) return;
    out[k.trim()] = (v || "").trim();
  });
  return out;
}

function buildDeviceCookie(deviceId) {
  const maxAge = 60 * 60 * 24 * 365; // 1 năm
  return `${DEVICE_COOKIE}=${deviceId}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
}

export async function onRequestGet({ env, request }) {
  try {
    const cookies = parseCookies(request.headers.get("Cookie") || "");
    const deviceId = cookies[DEVICE_COOKIE];

    if (!deviceId) {
      return json({ ok: false, error: "no_device" }, 404);
    }

    const row = await env.DB.prepare(
      `SELECT u.id, u.display_name
       FROM user_devices d
       JOIN users u ON u.id = d.user_id
       WHERE d.device_id = ?1
       LIMIT 1;`
    ).bind(deviceId).first();

    if (!row) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    return json({
      ok: true,
      userId: String(row.id),
      displayName: row.display_name
    });
  } catch (e) {
    return json({ ok: false, error: "server_error" }, 500);
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawName = String(body.displayName || "").trim();

    if (!rawName) {
      return json({ ok: false, error: "name_required" }, 400);
    }

    const displayName = rawName.slice(0, 24);
    const norm = normalizeName(displayName);
    const now = new Date().toISOString();

    const cookies = parseCookies(request.headers.get("Cookie") || "");
    let deviceId = cookies[DEVICE_COOKIE];
    if (!deviceId) {
      deviceId = (crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Date.now() + "-" + Math.random().toString(16).slice(2));
    }

    let userId = null;

    try {
      const existing = await env.DB.prepare(
        "SELECT id FROM users WHERE lower(display_name) = ?1 LIMIT 1;"
      ).bind(norm).first();
      if (existing && existing.id) {
        userId = String(existing.id);
      }
    } catch (_) {}

    if (!userId) {
      userId = (crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Date.now() + "-" + Math.random().toString(16).slice(2));
    }

    const upsertUser = env.DB.prepare(`
      INSERT INTO users (id, display_name, created_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name;
    `).bind(userId, displayName, now);

    const upsertDevice = env.DB.prepare(`
      INSERT INTO user_devices (device_id, user_id, created_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(device_id) DO UPDATE SET
        user_id = excluded.user_id;
    `).bind(deviceId, userId, now);

    await env.DB.batch([upsertUser, upsertDevice]);

    const cookieHeader = buildDeviceCookie(deviceId);

    return json(
      { ok: true, userId, deviceId, displayName },
      200,
      { "Set-Cookie": cookieHeader }
    );
  } catch (e) {
    return json({ ok: false, error: "server_error" }, 500);
  }
}
