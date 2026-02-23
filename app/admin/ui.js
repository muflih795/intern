"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { checkIsAdmin } from "@/lib/adminClientGuard";

const supabase = supabaseBrowser;

export default function AdminHomeClient() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      setChecking(true);
      setMsg("");

      const r = await checkIsAdmin();

      if (!r.ok && (r.reason === "no_session" || r.reason === "no_user")) {
        router.replace("/login?next=/admin");
        return;
      }
      if (!r.ok && r.reason === "not_admin") {
        router.replace("/home");
        return;
      }
      if (!r.ok) {
        setMsg(`Admin guard error: ${r.reason}${r.error ? " - " + r.error : ""}`);
        setChecking(false);
        return;
      }

      setMe({ user: r.user, profile: r.profile });
      setChecking(false);
    })();
  }, [router]);

  const email = me?.user?.email || "";
  const initials = useMemo(() => {
    const s = (email || "A").trim();
    return s.slice(0, 2).toUpperCase();
  }, [email]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#FFF1F5] via-white to-[#F6F7FF]">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#D6336C] to-[#FF7AA2] text-white flex items-center justify-center font-bold shadow-sm">
              {initials}
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900 leading-tight">Admin Panel</div>
              <div className="text-xs text-gray-600">
                {email ? `Login sebagai: ${email}` : "Memuat akun..."}
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            disabled={checking}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-[#D6336C] hover:bg-[#bf2b5f] disabled:opacity-50 shadow-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        {/* Alert */}
        {msg ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {msg}
          </div>
        ) : null}

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <StatCard
            title="Akses"
            value={checking ? "Checking..." : "Admin"}
            hint="Role berhasil terverifikasi"
            tone="pink"
          />
          <StatCard
            title="Panel"
            value="YBG"
            hint="Kelola produk, brand, kategori"
            tone="purple"
          />
          <StatCard
            title="Points"
            value="Users"
            hint="Tambah / kurangi point pengguna"
            tone="blue"
          />
        </div>

        {/* Menu Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <MenuCard
            disabled={checking}
            href="/admin/brands"
            title="Brands"
            desc="Tambah / edit brand + upload logo"
            icon="🏷️"
            accent="from-[#FFE0EA] to-white"
            border="border-[#FFC1D2]"
          />
          <MenuCard
            disabled={checking}
            href="/admin/category"
            title="Kategori"
            desc="Tambah / edit kategori + upload icon"
            icon="🧩"
            accent="from-[#E9E6FF] to-white"
            border="border-[#C8C2FF]"
          />
          <MenuCard
            disabled={checking}
            href="/admin/products"
            title="Products"
            desc="Tambah / edit produk + upload gambar"
            icon="👜"
            accent="from-[#E6FBFF] to-white"
            border="border-[#BFEFFF]"
          />
          <MenuCard
            disabled={checking}
            href="/admin/points"
            title="User Points"
            desc="Tambah / kurangi point pengguna"
            icon="💎"
            accent="from-[#FFF7E6] to-white"
            border="border-[#FFE2A8]"
          />
        </div>

        {/* Footer hint */}
        <div className="mt-8 text-xs text-gray-500">
          Tips: gunakan <span className="font-semibold">/login?next=/admin</span> untuk masuk admin via login utama.
        </div>
      </div>
    </div>
  );
}

function MenuCard({ title, desc, href, disabled, icon, accent, border }) {
  return (
    <Link
      href={disabled ? "#" : href}
      onClick={(e) => disabled && e.preventDefault()}
      className={[
        "group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition",
        border || "border-gray-200",
        disabled ? "opacity-60 pointer-events-none" : "hover:shadow-md",
      ].join(" ")}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-70`} />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-gray-900">{title}</div>
            <div className="text-sm text-gray-600 mt-1">{desc}</div>
          </div>
          <div className="text-2xl">{icon}</div>
        </div>

        <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#D6336C]">
          Buka
          <span className="transition group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Link>
  );
}

function StatCard({ title, value, hint, tone = "pink" }) {
  const toneMap = {
    pink: "from-[#D6336C]/10 to-white border-[#FFC1D2]",
    purple: "from-[#6D5BFF]/10 to-white border-[#C8C2FF]",
    blue: "from-[#00A3FF]/10 to-white border-[#BFEFFF]",
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${toneMap[tone]} p-5 shadow-sm`}>
      <div className="text-xs text-gray-600">{title}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
      <div className="text-xs text-gray-500 mt-2">{hint}</div>
    </div>
  );
}
