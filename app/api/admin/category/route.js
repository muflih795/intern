import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const CATEGORY_TABLE = "category";
const USERS_TABLE = "users";

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
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, reason: "no_token" };

  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user) {
    return { ok: false, status: 401, reason: "invalid_token", error: uerr?.message };
  }

  const userId = ures.user.id;

  const { data: profile, error: perr } = await supabase
    .from(USERS_TABLE)
    .select("id, role, email, name")
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

    const { data: rows, error } = await g.supabase
      .from(CATEGORY_TABLE)
      .select("id,nama,slug,icon_path,is_active,sort,created_at")
      .order("created_at", { ascending: false });

    if (error) return fail(error.message, 500);

    return ok({ rows: rows || [] });
  } catch (e) {
    return fail(e?.message || "Server error", 500);
  }
}

export async function POST(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return fail(g.reason, g.status, { reason: g.reason, detail: g.error });

    const fd = await req.formData();

    const nama = String(fd.get("nama") || "").trim();
    const slug = String(fd.get("slug") || "").trim();
    const sort = Number(fd.get("sort") || 1);
    const is_active = String(fd.get("is_active") || "true") === "true";

    // optional file (kalau kamu upload icon via storage di route ini, handle di sini)
    // Untuk sekarang: kalau kamu simpan string path, bisa kirim icon_path dari formData juga.
    const icon_path = String(fd.get("icon_path") || "").trim() || null;

    if (!nama) return fail("nama wajib");
    if (!slug) return fail("slug wajib");

    const payload = {
      nama,
      slug,
      sort: Number.isFinite(sort) ? sort : 1,
      is_active,
      icon_path,
      // created_at biasanya default di DB
    };

    const { data, error } = await g.supabase
      .from(CATEGORY_TABLE)
      .insert(payload)
      .select("id,nama,slug,icon_path,is_active,sort,created_at")
      .single();

    if (error) return fail(error.message, 500);

    return ok({ row: data }, 201);
  } catch (e) {
    return fail(e?.message || "Server error", 500);
  }
}

export async function PATCH(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return fail(g.reason, g.status, { reason: g.reason, detail: g.error });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return fail("id wajib");

    const contentType = req.headers.get("content-type") || "";

    let patch = {};

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (!body) return fail("body json invalid");

      if (typeof body.nama !== "undefined") patch.nama = String(body.nama || "").trim();
      if (typeof body.slug !== "undefined") patch.slug = String(body.slug || "").trim();
      if (typeof body.sort !== "undefined") patch.sort = Number(body.sort || 1);
      if (typeof body.is_active !== "undefined") patch.is_active = !!body.is_active;
      if (typeof body.icon_path !== "undefined") patch.icon_path = body.icon_path ? String(body.icon_path) : null;
    } else {
      // formData
      const fd = await req.formData();
      if (fd.has("nama")) patch.nama = String(fd.get("nama") || "").trim();
      if (fd.has("slug")) patch.slug = String(fd.get("slug") || "").trim();
      if (fd.has("sort")) patch.sort = Number(fd.get("sort") || 1);
      if (fd.has("is_active")) patch.is_active = String(fd.get("is_active") || "true") === "true";
      if (fd.has("icon_path")) patch.icon_path = String(fd.get("icon_path") || "").trim() || null;
    }

    const { data, error } = await g.supabase
      .from(CATEGORY_TABLE)
      .update(patch)
      .eq("id", id)
      .select("id,nama,slug,icon_path,is_active,sort,created_at")
      .single();

    if (error) return fail(error.message, 500);

    return ok({ row: data });
  } catch (e) {
    return fail(e?.message || "Server error", 500);
  }
}

export async function DELETE(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return fail(g.reason, g.status, { reason: g.reason, detail: g.error });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return fail("id wajib");

    const { error } = await g.supabase.from(CATEGORY_TABLE).delete().eq("id", id);
    if (error) return fail(error.message, 500);

    return ok({ deleted: true });
  } catch (e) {
    return fail(e?.message || "Server error", 500);
  }
}
