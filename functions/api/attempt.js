function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function normalizeName(name) {
  // Normalize to match users across different sites/domains
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json();

    const incomingUserId = String(body.userId || "").trim();
    const displayNameRaw = String(body.displayName || "").trim();

    // Require a non-empty name (anonymous disabled)
    if (!displayNameRaw) {
      return jsonResponse({ ok: false, error: "name_required" }, 400);
    }

    const displayName = displayNameRaw.slice(0, 24);

    const modeKey = String(body.modeKey || "").trim().slice(0, 64);
    const score10 = Number(body.score10);
    const seconds = Number(body.seconds);
    const aboveAvg = Number(body.aboveAvg) === 1 ? 1 : 0;

    if (!modeKey || !Number.isFinite(score10)) {
      return jsonResponse({ ok: false, error: "bad_request" }, 400);
    }

    // If client didn't send an id, generate one.
    const fallbackUserId = (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Date.now() + "-" + Math.random().toString(16).slice(2));

    // 1) DEDUP BY NAME (shared leaderboard across multiple websites)
    // If a user already exists with the same display_name (case-insensitive),
    // use that existing user_id so all sites aggregate into 1 profile.
    const norm = normalizeName(displayName);
    let resolvedUserId = incomingUserId || fallbackUserId;

    try {
      const find = await env.DB.prepare(
        "SELECT id FROM users WHERE lower(display_name) = ?1 LIMIT 1;"
      ).bind(norm).first();

      if (find && find.id) {
        resolvedUserId = String(find.id);
      }
    } catch (_) {
      // If lookup fails for any reason, just fall back to incomingUserId
    }

    const now = new Date().toISOString();
    const attemptId = crypto.randomUUID();

    // Upsert user by id (but id was already resolved by name)
    const upsertUser = env.DB.prepare(`
      INSERT INTO users (id, display_name, created_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name;
    `).bind(resolvedUserId, displayName, now);

    const insertAttempt = env.DB.prepare(`
      INSERT INTO attempts (id, user_id, mode_key, score10, seconds, above_avg, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);
    `).bind(
      attemptId,
      resolvedUserId,
      modeKey,
      score10,
      Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0,
      aboveAvg,
      now
    );

    const upsertStats = env.DB.prepare(`
      INSERT INTO user_stats (user_id, attempts, above_avg_count, avg_score10, last_attempt_at)
      VALUES (?1, 1, ?2, ?3, ?4)
      ON CONFLICT(user_id) DO UPDATE SET
        attempts = attempts + 1,
        above_avg_count = above_avg_count + excluded.above_avg_count,
        avg_score10 = ((avg_score10 * attempts) + excluded.avg_score10) / (attempts + 1),
        last_attempt_at = excluded.last_attempt_at;
    `).bind(resolvedUserId, aboveAvg, score10, now);

    await env.DB.batch([upsertUser, insertAttempt, upsertStats]);

    return jsonResponse({ ok: true, userId: resolvedUserId, displayName });
  } catch (err) {
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}
