import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const USERS_TABLE = "users";

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
  if (uerr || !ures?.user) {
    return { ok: false, status: 401, reason: "invalid_token", error: uerr?.message };
  }

  const userId = ures.user.id;

  // cek profile + role
  const { data: profile, error: perr } = await supabase
    .from(USERS_TABLE)
    .select("id, role, email, name, label, points")
    .eq("id", userId)
    .maybeSingle();

  if (perr) return { ok: false, status: 500, reason: "role_check_failed", error: perr.message };
  if (!profile) return { ok: false, status: 403, reason: "no_profile" };
  if (profile.role !== "admin") return { ok: false, status: 403, reason: "not_admin" };

  return { ok: true, supabase, user: ures.user, profile };
}

export async function GET(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return fail(g.reason, g.status, { reason: g.reason, detail: g.error });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    // kalau q kosong -> tetap balikin user (limit 50 biar aman)
    let query = g.supabase
      .from(USERS_TABLE)
      .select("id,email,name,label,points,role")
      .order("email", { ascending: true })
      .limit(50);

    // kalau ada q -> filter
    if (q) {
      // ilike only works for text columns
      query = query.or(
        `email.ilike.%${q}%,name.ilike.%${q}%,label.ilike.%${q}%`
      );
    }

    const { data: rows, error } = await query;
    if (error) return fail(error.message, 500);

    return ok({ rows: rows || [] });
  } catch (e) {
    return fail(e?.message || "Server error", 500);
  }
}
