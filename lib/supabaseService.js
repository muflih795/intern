// lib/supabaseService.js
import { createClient } from "@supabase/supabase-js";

export function createSupabaseServiceClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Supabase env missing at build/prerender — returning null client.");
    }
    return null;
  }

  return createClient(url, anon);
}
