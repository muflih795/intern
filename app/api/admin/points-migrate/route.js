import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const USERS_TABLE = "users";
const PHONE_POINTS_TABLE = "phone_points_grants";

function ok(data, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

function fail(error, status = 400, extra = {}) {
  return NextResponse.json({ ok: false, error: String(error || "error"), ...extra }, { status });
}

async function requireAdmin(req) {
  const supabase = createSupabaseAdminClient();

  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, reason: "no_token" };

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) return { ok: false, status: 401, reason: "invalid_token", error: uerr?.message };

  const userId = ures.user.id;

  const { data: profile, error: perr } = await supabase
    .from(USERS_TABLE)
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (perr) return { ok: false, status: 500, reason: "role_check_failed", error: perr.message };
  if (!profile) return { ok: false, status: 403, reason: "no_profile" };
  if (profile.role !== "admin") return { ok: false, status: 403, reason: "not_admin" };

  return { ok: true, supabase };
}

function normalizePhone(input) {
  let p = String(input || "").replace(/[^\d]/g, "");
  if (!p) return "";
  if (p.startsWith("0")) p = "62" + p.slice(1);
  return p;
}

function parseExpiresAt(expires_at_raw) {
  if (!expires_at_raw) return null;
  const s = String(expires_at_raw).trim();
  if (!s) return null;

  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1.toISOString();

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const HH = m[4] != null ? Number(m[4]) : 0;
    const MI = m[5] != null ? Number(m[5]) : 0;
    const d2 = new Date(yyyy, mm - 1, dd, HH, MI, 0);
    if (!Number.isNaN(d2.getTime())) return d2.toISOString();
  }

  return "__INVALID__";
}

export async function POST(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return fail(g.reason, g.status, { reason: g.reason, detail: g.error });

    const body = await req.json().catch(() => null);

    const name = String(body?.name || "").trim() || null;
    const email = String(body?.email || "").trim().toLowerCase() || null;
    const phone = normalizePhone(body?.phone);
    const points = Number(body?.points || 0);
    const reason = String(body?.reason || "").trim() || null;
    const expires_at_raw = body?.expires_at ?? null;

    if (!phone) return fail("phone wajib", 400);
    if (!Number.isFinite(points) || points <= 0) return fail("points harus angka > 0", 400);

    let expires_at = null;
    if (expires_at_raw) {
      const parsed = parseExpiresAt(expires_at_raw);
      if (parsed === "__INVALID__") return fail("expires_at tidak valid", 400, { got: String(expires_at_raw) });
      expires_at = parsed;
    }

    const { error: ierr } = await g.supabase.from(PHONE_POINTS_TABLE).insert([
      { phone, name, email, delta: points, reason, expires_at },
    ]);
    if (ierr) return fail(ierr.message, 500);

    return ok({ phone, points });
  } catch (e) {
    return fail(e?.message || "Server error", 500);
  }
}
