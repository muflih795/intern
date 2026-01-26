"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = supabaseBrowser;
const PHONE_LOGIN_ENABLED = false;

const RETURN_TO_KEY = "ybg_return_to_after_login";

function isEmail(v) {
  return /\S+@\S+\.\S+/.test(v);
}

function isPhone(v) {
  return /^\+?\d{8,15}$/.test((v || "").replace(/[\s-]/g, ""));
}

function normalizePhone(v) {
  let x = (v || "").replace(/[^\d+]/g, "");
  if (x.startsWith("+62")) return x;
  if (x.startsWith("62")) return "+" + x;
  if (x.startsWith("0")) return "+62" + x.slice(1);
  if (x.startsWith("+")) return x;
  return "+" + x;
}

function openCenteredPopup(url, title = "Login Google") {
  const w = 520;
  const h = 650;
  const y = window.top.outerHeight / 2 + window.top.screenY - h / 2;
  const x = window.top.outerWidth / 2 + window.top.screenX - w / 2;
  return window.open(
    url,
    title,
    `toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes,copyhistory=no,width=${w},height=${h},top=${y},left=${x}`
  );
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // menentukan "returnTo" (halaman tujuan setelah login)
  const returnTo = useMemo(() => {
    // prioritas: query ?next=
    const nextFromQuery = sp?.get("next");
    if (nextFromQuery && nextFromQuery.startsWith("/")) return nextFromQuery;

    // fallback: localStorage
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(RETURN_TO_KEY);
      if (saved && saved.startsWith("/")) return saved;
    }

    // default
    return "/"; // balik ke halaman awal
  }, [sp]);

  useEffect(() => {
    // simpan returnTo (biar konsisten meski reload)
    try {
      localStorage.setItem(RETURN_TO_KEY, returnTo);
    } catch {}

    // prefill email setelah reset password
    const qs = new URLSearchParams(window.location.search);
    const qEmail = qs.get("email");
    const qReset = qs.get("reset") === "1";
    const mem = localStorage.getItem("reset_email") || "";
    const prefill = qEmail || mem;
    if (prefill) setIdentifier(prefill);
    localStorage.removeItem("reset_email");

    if (qReset) {
      setMsg("Password telah diubah. Silakan login dengan password baru.");
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (prefill ? `?email=${encodeURIComponent(prefill)}` : "")
      );
    }
  }, [returnTo]);

  useEffect(() => {
    // menerima pesan dari popup callback
    const onMessage = async (event) => {
      // security: hanya terima dari origin yang sama
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (!data || data.type !== "supabase-oauth") return;

      if (data.success) {
        try {
          await supabase.auth.getSession();
        } catch {}

        // pakai next dari callback, kalau tidak ada pakai returnTo yang tersimpan
        const next = (data.next && data.next.startsWith("/")) ? data.next : returnTo;
        router.replace(next);
      } else {
        setMsg(data.error || "Login Google gagal.");
        setGoogleLoading(false);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router, returnTo]);

  const typingPhoneWhileDisabled =
    !PHONE_LOGIN_ENABLED && !isEmail(identifier) && isPhone(identifier);

  async function onGoogleLogin() {
    if (googleLoading || loading) return;
    setMsg("");
    setGoogleLoading(true);

    try {
      // target setelah login: ambil dari returnTo (bisa / atau halaman sebelumnya)
      const next = returnTo;

      // callback di domain yang sama dengan origin saat ini
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        next
      )}&popup=1`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("URL OAuth tidak tersedia.");

      const win = openCenteredPopup(data.url, "Login Google");
      if (!win) {
        setGoogleLoading(false);
        setMsg("Popup diblokir browser. Izinkan pop-up lalu coba lagi.");
        return;
      }

      // fallback: kalau user nutup popup manual
      const timer = setInterval(() => {
        if (win.closed) {
          clearInterval(timer);
          setGoogleLoading(false);
        }
      }, 400);
    } catch (e) {
      setGoogleLoading(false);
      setMsg(e?.message || "Gagal memulai login Google.");
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (loading || googleLoading) return;
    setMsg("");

    const id = identifier.trim();
    if (!id || !password) return setMsg("Masukkan email/nomor HP dan password.");

    const isIdEmail = isEmail(id);
    const isIdPhone = !isIdEmail && isPhone(id);

    if (!isIdEmail && !isIdPhone) {
      return setMsg("Format tidak valid. Gunakan email yang benar atau nomor HP (mis. +62812xxxx).");
    }

    if (isIdPhone && !PHONE_LOGIN_ENABLED) {
      return setMsg("Login via nomor HP belum diaktifkan. Gunakan email.");
    }

    setLoading(true);
    try {
      const payload = isIdEmail
        ? { email: id, password }
        : { phone: normalizePhone(id), password };

      const { error } = await supabase.auth.signInWithPassword(payload);
      if (error) throw error;

      await supabase.auth.refreshSession();

      // setelah login email/password: balik ke returnTo
      router.replace(returnTo);
    } catch (err) {
      const t = (err?.message || "").toLowerCase();
      if (t.includes("invalid_grant") || t.includes("invalid login credentials")) {
        setMsg("Email/nomor HP atau password salah.");
      } else if (t.includes("422")) {
        setMsg("Login via nomor HP belum diaktifkan.");
      } else {
        setMsg(err?.message || "Gagal masuk.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleForgot() {
    const email = identifier.trim();
    const url = isEmail(email) ? `/forgot?email=${encodeURIComponent(email)}` : `/forgot`;
    router.push(url);
  }

  return (
    <div className="min-h-[100dvh] bg-neutral-100">
      <main className="mx-auto w-full max-w-[430px] min-h-[100dvh] bg-white shadow md:border flex flex-col px-6 pt-10 pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-col items-center">
          <img src="/logo_ybg.png" alt="YBG" className="w-28 h-28" />
          <h1 className="text-black text-[22px] font-bold">Masuk ke Akun YBG</h1>
          <p className="text-sm text-gray-600 mt-1 text-center">
            Gunakan <b>email</b> dan <b>password</b>, atau masuk dengan Google.
          </p>
        </div>

        {/* Google Popup Login */}
        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={googleLoading || loading}
          className="mt-6 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-semibold text-black hover:bg-gray-50 disabled:opacity-60"
        >
          {googleLoading ? "Membuka Google..." : "Masuk dengan Google"}
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-500">atau</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Email atau Nomor HP"
            placeholder="you@example.com atau +62812xxxx"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />

          {typingPhoneWhileDisabled && (
            <p className="text-xs text-rose-600 -mt-2">
              Phone logins are disabled — gunakan email.
            </p>
          )}

          <label className="block text-sm">
            <span className="block text-black mb-1 font-medium">Password</span>
            <div className="flex items-stretch gap-2">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-[#D1D5DB] rounded-lg px-3 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="px-3 rounded-lg border border-[#D1D5DB] text-sm text-[#D6336C]"
              >
                {showPw ? "Sembunyi" : "Lihat"}
              </button>
            </div>
          </label>

          {msg && <p className="text-sm text-center text-rose-600">{msg}</p>}

          <div className="text-left text-sm mt-1">
            <button type="button" onClick={handleForgot} className="text-[#D6336C] hover:underline">
              Lupa password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading || typingPhoneWhileDisabled}
            className="w-full bg-[#D6336C] text-white font-semibold rounded-lg py-3 disabled:opacity-60"
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>

          <div className="text-center text-sm text-gray-600 mt-4">
            Belum punya akun?{" "}
            <button
              type="button"
              onClick={() => router.push("/regist")}
              className="text-[#D6336C] font-semibold"
            >
              Daftar
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="block text-black mb-1 font-medium">{label}</span>}
      <input
        {...props}
        className="w-full border border-[#D1D5DB] rounded-lg px-3 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
      />
    </label>
  );
}
