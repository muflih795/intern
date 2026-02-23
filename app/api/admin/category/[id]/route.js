import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseServiceClient } from "@/lib/supabaseService";
import { assertAdmin } from "@/lib/adminClientGuard";

export async function PATCH(req, { params }) {
  const supabase = createSupabaseServerClient();
  const service = createSupabaseServiceClient();
  const guard = await assertAdmin(supabase, service);

  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });

  const body = await req.json().catch(() => ({}));

  const { data, error } = await service
    .from("category")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req, { params }) {
  const supabase = createSupabaseServerClient();
  const service = createSupabaseServiceClient();
  const guard = await assertAdmin(supabase, service);

  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });

  const { error } = await service.from("category").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
