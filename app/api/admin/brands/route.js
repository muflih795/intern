// app/api/admin/brands/route.js
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

// ========= helpers =========
function json(ok, payload = {}, status = 200) {
  return NextResponse.json({ ok, ...payload }, { status });
}

function getBearerToken(req) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || "";
}

// slugify kecil (biar server gak tergantung client)
function safeSlug(s = "") {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extFromFile(file) {
  const name = (file?.name || "").toLowerCase();
  const m = name.match(/\.([a-z0-9]+)$/);
  return m?.[1] || "png";
}

async function requireAdmin(req) {
  const supabase = createSupabaseAdminClient();

  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, reason: "no_token" };

  // verifikasi token -> dapet user
  const { data: ures, error: uerr } = await supabase.auth.getUser(token);
  if (uerr || !ures?.user?.id) {
    return { ok: false, status: 401, reason: "invalid_token", error: uerr?.message };
  }

  const userId = ures.user.id;

  // cek role di public.users (pakai service role)
  const { data: profile, error: perr } = await supabase
    .from("users")
    .select("id, email, name, role")
    .eq("id", userId)
    .maybeSingle();

  if (perr) {
    return { ok: false, status: 500, reason: "role_check_failed", error: perr.message };
  }

  if (!profile) {
    return { ok: false, status: 403, reason: "no_profile_row" };
  }

  if (profile.role !== "admin") {
    return { ok: false, status: 403, reason: "not_admin" };
  }

  return { ok: true, supabase, user: ures.user, profile };
}

// ========= GET: list brands =========
export async function GET(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return json(false, { reason: g.reason, error: g.error }, g.status);

    const { data: rows, error } = await g.supabase
      .from("brands")
      .select("id, nama, slug, logo_url, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) return json(false, { reason: "select_failed", error: error.message }, 500);

    return json(true, { rows: rows || [] }, 200);
  } catch (e) {
    return json(false, { reason: "server_error", error: e?.message || String(e) }, 500);
  }
}

// ========= POST: create brand (multipart formdata) =========
// fields: nama, slug(optional), is_active("true/false"), file(optional)
export async function POST(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return json(false, { reason: g.reason, error: g.error }, g.status);

    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return json(false, { reason: "bad_content_type", error: "Use multipart/form-data" }, 415);
    }

    const form = await req.formData();
    const nama = String(form.get("nama") || "").trim();
    const slugIn = String(form.get("slug") || "").trim();
    const isActiveStr = String(form.get("is_active") || "true").trim();
    const file = form.get("file"); // File | null

    if (!nama) return json(false, { reason: "validation", error: "nama wajib diisi" }, 400);

    const slug = safeSlug(slugIn || nama);
    const is_active = isActiveStr === "true" || isActiveStr === "1" || isActiveStr === "on";

    let logo_url = null;

    // upload file kalau ada
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = extFromFile(file);
      const filename = `${slug}-${Date.now()}.${ext}`;
      const path = `brand/${filename}`;

      const up = await g.supabase.storage.from("Public").upload(path, bytes, {
        contentType: file.type || "image/png",
        upsert: true,
      });

      if (up.error) {
        return json(false, { reason: "upload_failed", error: up.error.message }, 500);
      }

      logo_url = path; // simpan path relatif
    }

    const { data, error } = await g.supabase
      .from("brands")
      .insert([{ nama, slug, logo_url, is_active }])
      .select("id, nama, slug, logo_url, is_active, created_at")
      .single();

    if (error) return json(false, { reason: "insert_failed", error: error.message }, 500);

    return json(true, { row: data }, 200);
  } catch (e) {
    return json(false, { reason: "server_error", error: e?.message || String(e) }, 500);
  }
}

// ========= PATCH: update is_active =========
// /api/admin/brands?id=uuid  body: { is_active: true/false }
export async function PATCH(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return json(false, { reason: g.reason, error: g.error }, g.status);

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json(false, { reason: "validation", error: "id wajib" }, 400);

    const body = await req.json().catch(() => null);
    const is_active = !!body?.is_active;

    const { data, error } = await g.supabase
      .from("brands")
      .update({ is_active })
      .eq("id", id)
      .select("id, nama, slug, logo_url, is_active, created_at")
      .maybeSingle();

    if (error) return json(false, { reason: "update_failed", error: error.message }, 500);
    if (!data) return json(false, { reason: "not_found" }, 404);

    return json(true, { row: data }, 200);
  } catch (e) {
    return json(false, { reason: "server_error", error: e?.message || String(e) }, 500);
  }
}

// ========= DELETE: delete brand =========
// /api/admin/brands?id=uuid
export async function DELETE(req) {
  try {
    const g = await requireAdmin(req);
    if (!g.ok) return json(false, { reason: g.reason, error: g.error }, g.status);

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json(false, { reason: "validation", error: "id wajib" }, 400);

    // ambil dulu data untuk hapus file storage
    const { data: row, error: selErr } = await g.supabase
      .from("brands")
      .select("id, logo_url")
      .eq("id", id)
      .maybeSingle();

    if (selErr) return json(false, { reason: "select_failed", error: selErr.message }, 500);
    if (!row) return json(false, { reason: "not_found" }, 404);

    // delete db
    const { error: delErr } = await g.supabase.from("brands").delete().eq("id", id);
    if (delErr) return json(false, { reason: "delete_failed", error: delErr.message }, 500);

    // delete storage (kalau ada)
    if (row.logo_url) {
      await g.supabase.storage.from("Public").remove([row.logo_url]).catch(() => {});
    }

    return json(true, { id }, 200);
  } catch (e) {
    return json(false, { reason: "server_error", error: e?.message || String(e) }, 500);
  }
}
