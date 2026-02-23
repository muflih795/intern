import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const PRODUCTS_TABLE = "products";
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
      .from(PRODUCTS_TABLE)
      .select("id,nama,brand_slug,kategori,price,image_url,deskripsi,status,is_active,date_created,image_urls,stock,condition")
      .order("date_created", { ascending: false });

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
    const brand_slug = String(fd.get("brand_slug") || "").trim();
    const kategori = String(fd.get("kategori") || "").trim();
    const priceRaw = String(fd.get("price") || "").trim();
    const deskripsi = String(fd.get("deskripsi") || "").trim();
    const status = String(fd.get("status") || "published").trim();
    const is_active = String(fd.get("is_active") || "true") === "true";
    const stock = Number(fd.get("stock") || 0);
    const condition = String(fd.get("condition") || "new").trim();
    const image_url = String(fd.get("image_url") || "").trim() || null;

    if (!nama) return fail("nama wajib diisi");
    if (!brand_slug) return fail("brand wajib diisi");
    if (!kategori) return fail("kategori wajib diisi");

    const price = priceRaw ? Number(priceRaw) : null;

    const payload = {
      nama,
      brand_slug,
      kategori,
      price,
      image_url,
      deskripsi,
      status,
      is_active,
      stock: Number.isFinite(stock) ? stock : 0,
      condition: condition === "used" ? "used" : "new",
    };

    const { data, error } = await g.supabase
      .from(PRODUCTS_TABLE)
      .insert(payload)
      .select("id,nama,brand_slug,kategori,price,image_url,deskripsi,status,is_active,date_created,image_urls,stock,condition")
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

    const ct = (req.headers.get("content-type") || "").toLowerCase();
    const patch = {};

    // 1) PATCH dari tombol toggle (JSON)
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (!body) return fail("body json invalid");

      if (typeof body.is_active !== "undefined") patch.is_active = !!body.is_active;
    } else {
      // 2) PATCH dari form edit (FormData)
      const fd = await req.formData();

      const nama = String(fd.get("nama") || "").trim();
      const brand_slug = String(fd.get("brand_slug") || "").trim();
      const kategori = String(fd.get("kategori") || "").trim();
      const priceRaw = String(fd.get("price") || "").trim();
      const deskripsi = String(fd.get("deskripsi") || "").trim();
      const status = String(fd.get("status") || "").trim();
      const is_active_raw = fd.get("is_active");
      const stockRaw = String(fd.get("stock") || "").trim();
      const condition = String(fd.get("condition") || "").trim();

      if (nama) patch.nama = nama;
      if (brand_slug) patch.brand_slug = brand_slug;
      if (kategori) patch.kategori = kategori;
      if (deskripsi !== "") patch.deskripsi = deskripsi;

      if (status) patch.status = status === "draft" ? "draft" : "published";
      if (condition) patch.condition = condition === "used" ? "used" : "new";

      if (priceRaw !== "") {
        const p = Number(priceRaw);
        patch.price = Number.isFinite(p) ? p : null;
      }

      if (stockRaw !== "") {
        const s = Number(stockRaw);
        patch.stock = Number.isFinite(s) ? s : 0;
      }

      if (typeof is_active_raw !== "undefined" && is_active_raw !== null) {
        patch.is_active = String(is_active_raw) === "true";
      }

      // NOTE: file upload kamu belum di-handle di server ini.
      // Kalau kamu ingin update gambar juga, biasanya:
      // - upload ke Storage di server, lalu set patch.image_url
      // Saat ini: kalau ada image_url string dikirim, kita update.
      const image_url = String(fd.get("image_url") || "").trim();
      if (image_url) patch.image_url = image_url;
    }

    if (Object.keys(patch).length === 0) return fail("Tidak ada field untuk diupdate");

    const { data, error } = await g.supabase
      .from(PRODUCTS_TABLE)
      .update(patch)
      .eq("id", id)
      .select("id,nama,brand_slug,kategori,price,image_url,deskripsi,status,is_active,date_created,image_urls,stock,condition")
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

    const { error } = await g.supabase.from(PRODUCTS_TABLE).delete().eq("id", id);
    if (error) return fail(error.message, 500);

    return ok({ deleted: true });
  } catch (e) {
    return fail(e?.message || "Server error", 500);
  }
}
