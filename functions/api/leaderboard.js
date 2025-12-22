export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(10, Number(url.searchParams.get("limit") || 3)));

    const sql = `
      SELECT
        u.display_name AS displayName,
        s.attempts AS attempts,
        s.above_avg_count AS aboveAvgCount,
        s.avg_score10 AS avgScore10,
        s.last_attempt_at AS lastAttemptAt
      FROM user_stats s
      JOIN users u ON u.id = s.user_id
      ORDER BY
        s.attempts DESC,
        (CAST(s.above_avg_count AS REAL) / s.attempts) DESC,
        s.avg_score10 DESC,
        s.last_attempt_at DESC
      LIMIT ?1;
    `;

    const { results } = await env.DB.prepare(sql).bind(limit).all();

    const top = (results || []).map((r, i) => {
      const attempts = Number(r.attempts || 0);
      const aboveAvgCount = Number(r.aboveAvgCount || 0);
      const rate = attempts > 0 ? (aboveAvgCount / attempts) : 0;

      return {
        rank: i + 1,
        displayName: r.displayName || "Ẩn danh",
        attempts,
        aboveAvgRate: rate
      };
    });

    return new Response(JSON.stringify({ top, updatedAt: new Date().toISOString() }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ top: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
