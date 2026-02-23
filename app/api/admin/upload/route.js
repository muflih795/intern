import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseServiceClient } from "@/lib/supabaseService";
import { assertAdmin } from "@/lib/adminClientGuard";
import { safeFileName } from "@/lib/storage";

export async function POST(req) {
  try {
    const supabase = createSupabaseServerClient();
    const service = createSupabaseServiceClient();
    const guard = await assertAdmin(supabase, service);

    if (!guard.ok) {
      return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
    }

    const form = await req.formData();
    const file = form.get("file");
    const folder = safeFileName(form.get("folder") || "");
    const filename = form.get("filename");

    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (!folder) {
      return NextResponse.json({ ok: false, error: "folder is required" }, { status: 400 });
    }

    const ext = (file.name || "").split(".").pop() || "png";
    const base =
      safeFileName(filename || file.name || `upload-${Date.now()}.${ext}`) ||
      `upload-${Date.now()}.${ext}`;

    const finalName = base.includes(".") ? base : `${base}.${ext}`;
    const path = `${folder}/${finalName}`;

    const arrayBuffer = await file.arrayBuffer();
    const contentType = file.type || "application/octet-stream";

    const { error: upErr } = await service.storage.from("Public").upload(path, arrayBuffer, {
      contentType,
      upsert: true,
    });

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    const { data: pub } = service.storage.from("Public").getPublicUrl(path);

    return NextResponse.json({
      ok: true,
      bucket: "Public",
      path, // simpan ke DB: "brand/xxx.png" dll
      publicUrl: pub?.publicUrl ?? null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
