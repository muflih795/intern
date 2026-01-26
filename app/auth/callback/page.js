"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = supabaseBrowser;

function CallbackInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [msg, setMsg] = useState("Memproses login Google...");

  useEffect(() => {
    const run = async () => {
      const next = sp.get("next") || "/home";
      const popup = sp.get("popup") === "1";

      const sendToOpener = (payload) => {
        try {
          if (popup && window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, window.location.origin);
            return true;
          }
        } catch {}
        return false;
      };

      try {
        const errDesc = sp.get("error_description") || sp.get("error");
        if (errDesc) {
          sendToOpener({ type: "supabase-oauth", success: false, error: errDesc });
          setMsg("Login gagal: " + errDesc);
          if (popup) setTimeout(() => window.close(), 400);
          return;
        }

        // ✅ PENTING: pakai URL lengkap, bukan hanya "code"
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) throw error;

        // pastikan session kebaca
        await supabase.auth.getSession();

        const ok = sendToOpener({ type: "supabase-oauth", success: true, next });

        if (popup && ok) {
          setMsg("Berhasil. Menutup popup...");
          setTimeout(() => window.close(), 250);
        } else {
          router.replace(next);
        }
      } catch (e) {
        const message = e?.message || "Terjadi kesalahan saat memproses login.";
        sendToOpener({ type: "supabase-oauth", success: false, error: message });
        setMsg(message);
        if (popup) setTimeout(() => window.close(), 500);
      }
    };

    run();
  }, [sp, router]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow p-6 text-center">
        <div className="text-black font-semibold">OAuth Callback</div>
        <div className="text-sm text-gray-600 mt-2">{msg}</div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-neutral-100" />}>
      <CallbackInner />
    </Suspense>
  );
}
