import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const admin = createSupabaseAdminClient();

    const { data: ures, error: uerr } = await supabase.auth.getUser();
    if (uerr || !ures?.user) {
      return NextResponse.json({ ok: false, reason: "no_session" }, { status: 401 });
    }

    const userId = ures.user.id;

    const { data: row, error: rerr } = await admin
      .from("users")
      .select("id,email,role,name")
      .eq("id", userId)
      .maybeSingle();

    if (rerr) {
      return NextResponse.json(
        { ok: false, reason: "role_check_failed", error: rerr.message },
        { status: 500 }
      );
    }

    if (!row || row.role !== "admin") {
      return NextResponse.json({ ok: false, reason: "not_admin" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, user: ures.user, profile: row });
  } catch (e) {
    console.error("GET /api/admin/me error:", e);
    return NextResponse.json({ ok: false, reason: "internal_error", error: e?.message }, { status: 500 });
  }
}
