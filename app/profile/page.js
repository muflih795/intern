"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import BottomNavigation from "../components/bottomnav";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
const supabase = supabaseBrowser;

const DEFAULT_PROFILE = {
  nama: "",
  phone: "",
  email: "",
  gender: "",
  birth: "", // yyyy-mm-dd (date input)
};

export default function ProfilePage() {
  const [form, setForm] = useState(DEFAULT_PROFILE);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔹 helper: ambil / buat row public.users
  async function ensurePublicUserRow(authUser) {
    const uid = authUser?.id;
    if (!uid) return null;

    // 1) coba select
    let { data: row, error } = await supabase
      .from("users")
      .select("id, name, email, phone, gender, birth")
      .eq("id", uid)
      .maybeSingle();

    if (error) throw error;
    if (row) return row;

    // 2) kalau belum ada: insert (butuh policy users_insert_own)
    const fallbackName =
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      "";

    const fallbackPhone = authUser.user_metadata?.phone || null;

    const { data: inserted, error: iErr } = await supabase
      .from("users")
      .insert([
        {
          id: uid,
          email: authUser.email || null,
          name: fallbackName || "",
          phone: fallbackPhone,
          gender: null,
          birth: null,
        },
      ])
      .select("id, name, email, phone, gender, birth")
      .maybeSingle();

    if (iErr) throw iErr;
    return inserted || null;
  }

  // 🔹 Load data profile dari public.users
  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        setUserId(null);
        setForm(DEFAULT_PROFILE);
        setLoading(false);
        return;
      }

      const u = data.user;
      setUserId(u.id);

      try {
        const row = await ensurePublicUserRow(u);

        // birth bisa date/string, normalize untuk input type="date"
        const birth =
          row?.birth
            ? String(row.birth).slice(0, 10) // "YYYY-MM-DD..."
            : "";

        setForm({
          nama: row?.name || "",
          phone: row?.phone || "",
          email: row?.email || u.email || "",
          gender: row?.gender || "",
          birth,
        });
      } catch (e) {
        console.error("load profile error:", e);
        // fallback minimal dari auth
        setForm((prev) => ({
          ...prev,
          nama: u.user_metadata?.full_name || u.user_metadata?.name || "",
          phone: u.user_metadata?.phone || "",
          email: u.email || "",
        }));
        setMsg(e?.message || "Gagal memuat profil.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function onGenderChange(val) {
    setForm((f) => ({ ...f, gender: val }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!userId) return;

    setSaving(true);
    setMsg("");

    try {
      // 1) update public.users (utama)
      const payload = {
        name: form.nama || "",
        phone: form.phone || "",
        gender: form.gender || null,
        birth: form.birth ? form.birth : null, // date
        email: form.email || null,
      };

      const { error: uErr } = await supabase
        .from("users")
        .update(payload)
        .eq("id", userId);

      if (uErr) throw uErr;

      // 2) update auth hanya jika perlu (minimal)
      // email/password memang harus lewat auth
      const authUpdates = {};
      if (form.email) authUpdates.email = form.email;
      if (password) authUpdates.password = password;

      if (Object.keys(authUpdates).length > 0) {
        const { error: aErr } = await supabase.auth.updateUser(authUpdates);
        if (aErr) throw aErr;
      }

      setPassword("");
      setShowPassword(false);
      setMsg("Perubahan berhasil disimpan ✅");
    } catch (err) {
      console.error("update profile error:", err);
      setMsg(err?.message || "Gagal menyimpan. Coba lagi.");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  async function onLogout() {
    try {
      await supabase.auth.signOut();
      setMsg("Kamu sudah logout 👋");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1000);
    } catch (e) {
      console.error("logout error:", e);
      setMsg("Gagal logout.");
    }
  }

  return (
    <div className="min-h-[100dvh] bg-neutral-100 flex justify-center">
      <main className="w-full min-h-[100dvh] bg-white flex flex-col md:max-w-[430px] md:shadow md:border">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white text-[#D6336C] px-4 py-3 font-semibold shadow">
          Profile
        </div>

        {/* Loading */}
        {loading ? (
          <div className="p-6 text-sm text-gray-600">Memuat profile…</div>
        ) : (
          <form onSubmit={onSubmit} className="flex-1 pb-24">
            <div className="px-4 mt-3">
              <div className="rounded-xl border border-pink-100 bg-white p-3 flex items-center gap-3 shadow-sm">
                <div className="relative w-12 h-12 overflow-hidden rounded-full bg-pink-50">
                  <Image src="/avatar.png" alt="avatar" fill className="object-cover" />
                </div>
                <div className="leading-tight">
                  <p className="text-[15px] font-semibold text-black">
                    {form.nama || "Pengguna"}
                  </p>
                  <p className="text-[12px] text-gray-500">
                    {form.phone || "+62…"}
                  </p>
                </div>
              </div>
            </div>

            <SectionTitle title="Edit Profile" />

            <div className="px-4 space-y-3">
              <Input
                label="Nama Lengkap"
                name="nama"
                value={form.nama}
                onChange={onChange}
                placeholder="Nama Lengkap"
              />

              <Input
                type="date"
                label="Tanggal Lahir"
                name="birth"
                value={form.birth}
                onChange={onChange}
              />

              <div>
                <p className="text-[13px] text-black mb-2">Jenis Kelamin</p>
                <div className="flex items-center gap-8">
                  <Radio
                    checked={form.gender === "male"}
                    onChange={() => onGenderChange("male")}
                    label="Laki - Laki"
                  />
                  <Radio
                    checked={form.gender === "female"}
                    onChange={() => onGenderChange("female")}
                    label="Perempuan"
                  />
                </div>
              </div>

              {/* Password */}
              <label className="block">
                <span className="block text-[13px] text-black mb-2">
                  Ubah Password (opsional)
                </span>

                <div className="flex items-stretch gap-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Isi jika ingin mengubah password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 rounded-lg border border-[#E5E7EB] px-3 py-3 text-[14px] text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="min-w-[72px] rounded-lg border border-[#E5E7EB] px-4 text-[14px] font-semibold text-[#D6336C] hover:bg-pink-50 transition"
                  >
                    {showPassword ? "Tutup" : "Lihat"}
                  </button>
                </div>
              </label>
            </div>

            <SectionTitle title="Informasi Kontak" />

            <div className="px-4 space-y-3">
              <Input
                type="tel"
                label="Nomor Telepon"
                placeholder="Masukkan nomor telepon"
                name="phone"
                value={form.phone}
                onChange={onChange}
              />
              <Input
                type="email"
                label="Email"
                placeholder="Masukkan email"
                name="email"
                value={form.email}
                onChange={onChange}
              />
            </div>

            <div className="px-4 mt-5 space-y-3">
              {msg && (
                <div className="mb-3 text-[12px] text-center text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-2">
                  {msg}
                </div>
              )}
              <button
                type="submit"
                disabled={saving}
                className="w-full h-[44px] rounded-lg bg-[#D6336C] text-white font-semibold disabled:opacity-60"
              >
                {saving ? "Menyimpan…" : "Simpan Perubahan"}
              </button>

              {userId && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full h-[44px] rounded-lg border border-pink-200 text-[#D6336C] font-semibold hover:bg-pink-50 transition"
                >
                  Logout
                </button>
              )}
            </div>
          </form>
        )}

        <BottomNavigation />
      </main>
    </div>
  );
}

function SectionTitle({ title }) {
  return (
    <div className="px-4 mt-5 mb-3">
      <div className="flex items-center gap-2">
        <div className="h-[10px] w-1.5 rounded bg-[#F8B6C9]" />
        <p className="text-[13px] font-semibold text-black">{title}</p>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[13px] text-black mb-2">{label}</span>
      )}
      <input
        {...props}
        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-3 text-[14px] text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
      />
    </label>
  );
}

function Radio({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="radio"
        className="appearance-none w-4 h-4 rounded-full border border-gray-400 checked:border-[#D6336C] checked:bg-[#D6336C]"
        checked={checked}
        onChange={onChange}
      />
      <span className="text-[13px] text-gray-800">{label}</span>
    </label>
  );
}
