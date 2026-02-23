"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = supabaseBrowser;

/**
 * Cek apakah user login dan role-nya admin via table public.users.
 * Return:
 *  - { ok:true, user, profile }
 *  - { ok:false, reason, error? }
 */
export async function checkIsAdmin() {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) return { ok: false, reason: "no_session" };

  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures?.user?.id) return { ok: false, reason: "no_user" };

  const userId = ures.user.id;

  const { data: row, error } = await supabase
    .from("users")
    .select("role, email, name")
    .eq("id", userId)
    .maybeSingle();

  if (error) return { ok: false, reason: "rls_or_select_failed", error: error.message };
  if (row?.role !== "admin") return { ok: false, reason: "not_admin" };

  return { ok: true, user: ures.user, profile: row };
}
