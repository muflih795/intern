import { createClient } from "@supabase/supabase-js";

const g = globalThis;

export const supabaseBrowser =
  g.__supabaseBrowser ??
  (() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // ✅ Jangan bikin build gagal.
    // Kalau ENV kosong, hanya lempar error di browser saat runtime.
    if (!url || !anon) {
      if (typeof window !== "undefined") {
        throw new Error(
          "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
            "Set them in Vercel Environment Variables dan .env.local"
        );
      }

      // ✅ Saat server/build: balikin client "placeholder" supaya tidak crash build.
      // App tetap butuh ENV bener untuk jalan, tapi build tidak gagal.
      return createClient("http://localhost:54321", "anon-key", {
        auth: {
          persistSession: false,
          storageKey: "ybg-auth",
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    }

    return createClient(url, anon, {
      auth: {
        persistSession: true,
        storageKey: "ybg-auth",
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  })();

if (process.env.NODE_ENV !== "production") {
  g.__supabaseBrowser = supabaseBrowser;
}
