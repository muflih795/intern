import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const USERS_TABLE = "users";
const USER_POINTS_TABLE = "user_points";

function ok(data, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

function fail(error, status = 400, extra = {}) {
  return NextResponse.json(
    { ok: false, error: String(error || "error"), ...extra },
    { status }
  );
}

async function requireAdmin(req) {
  const supabase = createSupabaseAdminClient();

  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  if (!token) return { ok: false, status: 401, reason: "no_token" };

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) {
    return { ok: false, status: 401, reason: "invalid_token", error: uerr?.message };
  }

  const userId = ures.user.id;

  const { data: profile, error: perr } = await supabase
    .from(USERS_TABLE)
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (perr) return { ok: false, status: 500, reason: "role_check_failed", error: perr.message };
  if (!profile) return { ok: false, status: 403, reason: "no_profile" };
  if (profile.role !== "admin") return { ok: false, status: 403, reason: "not_admin" };

  return { ok: true, supabase, user: ures.user, profile };
}

// ✅ parse expires_at yang fleksibel
function parseExpiresAt(expires_at_raw) {
  if (!expires_at_raw) return null;

  const s = String(expires_at_raw).trim();
  if (!s) return null;

  // 1) Coba parse langsung (ISO / datetime-local)
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1.toISOString();

  // 2) Support "dd/mm/yyyy hh:mm" atau "dd/mm/yyyy"
  // contoh: 20/02/2026 09:17
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const HH = m[4] != null ? Number(m[4]) : 0;
    const MI = m[5] != null ? Number(m[5]) : 0;

    // bikin date LOCAL, lalu convert ke ISO
    const d2 = new Date(yyyy, mm - 1, dd, HH, MI, 0);
    if (!Number.isNaN(d2.getTime())) return d2.toISOString();
  }

  return "__INVALID__";
}

// ✅ GET summary points
export async function GET(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return fail(g.reason, g.status, { reason: g.reason, detail: g.error });

    const { searchParams } = new URL(req.url);
    const user_id = String(searchParams.get("user_id") || "").trim();
    if (!user_id) return fail("user_id wajib", 400);

    const { data: u, error: uerr } = await g.supabase
      .from(USERS_TABLE)
      .select("id,email,name,label,points,role")
      .eq("id", user_id)
      .maybeSingle();

    if (uerr) return fail(uerr.message, 500);
    if (!u) return fail("User tidak ditemukan", 404);

    const nowIso = new Date().toISOString();

    const { data: grants, error: gerr } = await g.supabase
      .from(USER_POINTS_TABLE)
      .select("delta, expires_at")
      .eq("user_id", user_id)
      .gt("delta", 0)
      .not("expires_at", "is", null)
      .gt("expires_at", nowIso);

    if (gerr) return fail(gerr.message, 500);

    const map = new Map();
    for (const row of grants || []) {
      const k = row.expires_at;
      const v = Number(row.delta || 0);
      map.set(k, (map.get(k) || 0) + v);
    }

    const expiring_by_date = Array.from(map.entries())
      .map(([expires_at, points]) => ({ expires_at, points }))
      .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());

    const next_expiring = expiring_by_date.length
      ? { expires_at: expiring_by_date[0].expires_at, points: expiring_by_date[0].points }
      : null;

    return ok({ user: u, expiring_by_date, next_expiring });
  } catch (e) {
    return fail(e?.message || "Server error", 500);
  }
}

// ✅ POST add / deduct points + optional expiry
export async function POST(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return fail(g.reason, g.status, { reason: g.reason, detail: g.error });

    const body = await req.json().catch(() => null);

    const user_id = String(body?.user_id || "").trim();
    const delta = Number(body?.delta || 0);
    const reason = String(body?.reason || "").trim();
    const expires_at_raw = body?.expires_at ?? null;

    if (!user_id) return fail("user_id wajib", 400);
    if (!Number.isFinite(delta) || delta === 0) return fail("delta harus angka dan tidak boleh 0", 400);

    // ✅ normalize expires_at (fleksibel)
    let expires_at = null;
    if (expires_at_raw) {
      const parsed = parseExpiresAt(expires_at_raw);
      if (parsed === "__INVALID__") return fail("expires_at tidak valid", 400, { got: String(expires_at_raw) });
      expires_at = parsed;
    }

    const { data: u, error: uerr } = await g.supabase
      .from(USERS_TABLE)
      .select("id, points")
      .eq("id", user_id)
      .maybeSingle();

    if (uerr) return fail(uerr.message, 500);
    if (!u) return fail("User tidak ditemukan", 404);

    // 1) insert log
    const { error: ierr } = await g.supabase.from(USER_POINTS_TABLE).insert([
      { user_id, delta, reason: reason || null, expires_at },
    ]);
    if (ierr) return fail(ierr.message, 500);

    // 2) update saldo
    const current = Number(u.points || 0);
    const next = current + delta;

    const { data: updated, error: perr } = await g.supabase
      .from(USERS_TABLE)
      .update({ points: next })
      .eq("id", user_id)
      .select("id, points")
      .maybeSingle();

    if (perr) return fail(perr.message, 500);

    return ok({ user_id, points: updated?.points ?? next });
  } catch (e) {
    return fail(e?.message || "Server error", 500);
  }
}
