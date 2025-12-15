import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in Vercel Environment Variables and .env.local"
  );
}

const g = globalThis;

export const supabaseBrowser =
  g.__supabaseBrowser ??
  createClient(url, anon, {
    auth: {
      persistSession: true,
      storageKey: "ybg-auth",
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

if (process.env.NODE_ENV !== "production") {
  g.__supabaseBrowser = supabaseBrowser;
}
