function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json();

    const userId = String(body.userId || "").trim();
    const displayNameRaw = String(body.displayName || "").trim();
    const displayName = displayNameRaw.length ? displayNameRaw.slice(0, 24) : "Ẩn danh";

    const modeKey = String(body.modeKey || "").trim().slice(0, 64);
    const score10 = Number(body.score10);
    const seconds = Number(body.seconds);
    const aboveAvg = Number(body.aboveAvg) === 1 ? 1 : 0;

    if (!userId || !modeKey || !Number.isFinite(score10)) {
      return jsonResponse({ ok: false, error: "bad_request" }, 400);
    }

    const now = new Date().toISOString();
    const attemptId = crypto.randomUUID();

    const insertUser = env.DB.prepare(`
      INSERT INTO users (id, display_name, created_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name;
    `).bind(userId, displayName, now);

    const insertAttempt = env.DB.prepare(`
      INSERT INTO attempts (id, user_id, mode_key, score10, seconds, above_avg, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);
    `).bind(attemptId, userId, modeKey, score10, Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0, aboveAvg, now);

    const upsertStats = env.DB.prepare(`
      INSERT INTO user_stats (user_id, attempts, above_avg_count, avg_score10, last_attempt_at)
      VALUES (?1, 1, ?2, ?3, ?4)
      ON CONFLICT(user_id) DO UPDATE SET
        attempts = attempts + 1,
        above_avg_count = above_avg_count + excluded.above_avg_count,
        avg_score10 = ((avg_score10 * attempts) + excluded.avg_score10) / (attempts + 1),
        last_attempt_at = excluded.last_attempt_at;
    `).bind(userId, aboveAvg, score10, now);

    await env.DB.batch([insertUser, insertAttempt, upsertStats]);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}
