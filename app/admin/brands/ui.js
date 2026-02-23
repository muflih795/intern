"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toPublicUrl, safeSlug } from "@/lib/storage";
import { checkIsAdmin } from "@/lib/adminClientGuard";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = supabaseBrowser;

export default function BrandsClient() {
  const router = useRouter();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // ✅ mode edit
  const [editingId, setEditingId] = useState(null);

  // form
  const [nama, setNama] = useState("");
  const slug = useMemo(() => safeSlug(nama), [nama]);
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState(null);

  // ✅ preview logo (file)
  const [filePreview, setFilePreview] = useState(""); // blob url
  const [editLogoUrl, setEditLogoUrl] = useState(""); // logo_url existing saat edit

  // ✅ Search + Sort
  const [q, setQ] = useState("");
  const [sortDir, setSortDir] = useState("asc"); // asc | desc

  async function authHeaders() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  async function guard(nextPath = "/admin/brands") {
    const r = await checkIsAdmin();

    if (!r.ok && (r.reason === "no_session" || r.reason === "no_user")) {
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      return false;
    }
    if (!r.ok && r.reason === "not_admin") {
      router.replace("/home");
      return false;
    }
    if (!r.ok) {
      setMsg(`Admin guard error: ${r.reason}${r.error ? " - " + r.error : ""}`);
      return false;
    }
    return true;
  }

  function cleanupPreview(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function resetForm() {
    setEditingId(null);
    setNama("");
    setIsActive(true);

    setFile(null);
    cleanupPreview(filePreview);
    setFilePreview("");
    setEditLogoUrl("");
  }

  function startEdit(row) {
    setMsg("");
    setEditingId(row.id);
    setNama(row.nama || "");
    setIsActive(!!row.is_active);

    const existing = toPublicUrl("Public", row.logo_url);
    setEditLogoUrl(existing || "");

    setFile(null);
    cleanupPreview(filePreview);
    setFilePreview("");

    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    resetForm();
    setMsg("Edit dibatalkan.");
  }

  // ✅ handle choose file + preview
  function onPickFile(f) {
    setFile(f || null);

    cleanupPreview(filePreview);
    setFilePreview("");

    if (f) {
      const url = URL.createObjectURL(f);
      setFilePreview(url);
    }
  }

  useEffect(() => {
    return () => cleanupPreview(filePreview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const ok = await guard("/admin/brands");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch("/api/admin/brands", { cache: "no-store", headers });
      const j = await res.json().catch(() => null);

      if (!j?.ok) throw new Error(j?.error || j?.reason || `Gagal memuat brands (${res.status})`);
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e) {
      setMsg(e?.message || "Gagal memuat");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    setMsg("");
    try {
      const ok = await guard("/admin/brands");
      if (!ok) return;

      const fd = new FormData();
      fd.append("nama", nama);
      fd.append("slug", slug);
      fd.append("is_active", String(isActive));
      if (file) fd.append("file", file);

      const headers = await authHeaders();
      const res = await fetch("/api/admin/brands", { method: "POST", body: fd, headers });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal membuat brand");

      resetForm();
      await load();
      setMsg("✅ Brand dibuat.");
    } catch (e) {
      setMsg(e?.message || "Gagal membuat");
    }
  }

  // ✅ UPDATE (PATCH + FormData) — pastikan route /api/admin/brands support FormData untuk PATCH
  async function onUpdate(e) {
    e.preventDefault();
    setMsg("");
    try {
      if (!editingId) return;

      const ok = await guard("/admin/brands");
      if (!ok) return;

      const fd = new FormData();
      fd.append("nama", nama);
      fd.append("slug", safeSlug(nama));
      fd.append("is_active", String(isActive));
      if (file) fd.append("file", file);

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/brands?id=${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        body: fd,
        headers,
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal update brand");

      resetForm();
      await load();
      setMsg("✅ Brand diupdate.");
    } catch (e) {
      setMsg(e?.message || "Gagal update");
    }
  }

  async function onToggle(id, nextActive) {
    setMsg("");
    try {
      const ok = await guard("/admin/brands");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/brands?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ is_active: !!nextActive }),
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal update brand");

      await load();
      setMsg("✅ Status brand diupdate.");
    } catch (e) {
      setMsg(e?.message || "Gagal update");
    }
  }

  async function onDelete(id) {
    if (!confirm("Hapus brand ini?")) return;
    setMsg("");
    try {
      const ok = await guard("/admin/brands");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/brands?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal hapus brand");

      if (editingId === id) resetForm();

      await load();
      setMsg("🗑️ Brand dihapus.");
    } catch (e) {
      setMsg(e?.message || "Gagal hapus");
    }
  }

  const viewRows = useMemo(() => {
    const list = Array.isArray(rows) ? [...rows] : [];
    const qq = (q || "").trim().toLowerCase();

    const filtered = !qq
      ? list
      : list.filter((r) => {
          const nm = (r?.nama || "").toLowerCase();
          const sg = (r?.slug || "").toLowerCase();
          return nm.includes(qq) || sg.includes(qq);
        });

    filtered.sort((a, b) => {
      const an = (a?.nama || "").toLowerCase();
      const bn = (b?.nama || "").toLowerCase();
      return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
    });

    return filtered;
  }, [rows, q, sortDir]);

  const inputBase =
    "w-full border rounded-xl px-3 py-2 bg-white text-gray-900 placeholder:text-gray-400 " +
    "focus:outline-none focus:ring-2 focus:ring-pink-200";

  const btnBase =
    "rounded-xl px-3 py-2 text-sm font-semibold border transition " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const btnEdit = `${btnBase} border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100`;
  const btnDelete = `${btnBase} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`;
  const btnReset =
    `${btnBase} border-gray-300 bg-white text-gray-800 hover:bg-gray-50 ` +
    `focus:outline-none focus:ring-2 focus:ring-gray-200`;

  const btnDisable = `${btnBase} border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`;
  const btnEnable = `${btnBase} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`;

  // ✅ preview (file baru > logo lama)
  const previewSrc = filePreview || editLogoUrl || "";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#FFF1F5] via-white to-[#F6F7FF]">
      {/* TOP BAR */}
      <div className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Admin • Brands</h1>
            <p className="text-xs text-gray-600 mt-1">Kelola brand + upload logo (Supabase Storage Public)</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="rounded-xl px-4 py-2 text-sm font-semibold border bg-white hover:bg-gray-50 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Memuat..." : "Reload"}
            </button>

            <Link
              href="/admin"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-[#D6336C] hover:bg-[#bf2b5f]"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        {msg ? (
          <div className="mb-5 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm">
            {msg}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
          {/* FORM CARD */}
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5 border-b bg-gradient-to-br from-[#FFE0EA] to-white">
              <div className="text-lg font-bold text-gray-900">{editingId ? "Edit Brand" : "Tambah Brand"}</div>
              <div className="text-xs text-gray-600 mt-1">
                {editingId
                  ? "Ubah data brand lalu klik Simpan Perubahan."
                  : "Nama → slug otomatis, lalu upload logo (opsional)."}
              </div>
            </div>

            <form onSubmit={editingId ? onUpdate : onCreate} className="p-5 space-y-4">
              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Nama</div>
                <input value={nama} onChange={(e) => setNama(e.target.value)} className={inputBase} placeholder="LV" required />
              </label>

              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Slug (auto)</div>
                <input value={slug} readOnly className="w-full border rounded-xl px-3 py-2 bg-gray-50 text-gray-900" />
              </label>

              {/* ✅ Upload + Preview DI BAWAH (bukan samping) */}
              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Logo (image)</div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                  className="text-sm text-gray-900"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Preview muncul di bawah. Saat edit, logo lama tampil sampai kamu pilih file baru.
                </div>

                <div className="mt-3 rounded-2xl border bg-white p-3">
                  <div className="text-xs font-semibold text-gray-600 mb-2">Preview</div>
                  {previewSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewSrc}
                      alt="Preview logo"
                      className="w-full h-[160px] object-contain rounded-xl border bg-gray-50 p-2"
                    />
                  ) : (
                    <div className="w-full h-[160px] rounded-xl border bg-gray-50 flex items-center justify-center text-xs text-gray-500">
                      Belum ada logo
                    </div>
                  )}
                </div>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span className="text-gray-800 font-medium">Active</span>
              </label>

              <div className="flex flex-col md:flex-row gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full md:w-auto rounded-xl px-5 py-2 text-sm font-semibold text-white bg-[#D6336C] hover:bg-[#bf2b5f] disabled:opacity-60"
                >
                  {loading ? "Memproses..." : editingId ? "Simpan Perubahan" : "Tambah Brand"}
                </button>

                {!editingId ? (
                  <button type="button" onClick={resetForm} disabled={loading} className={`${btnReset} w-full md:w-auto px-5`}>
                    Reset
                  </button>
                ) : (
                  <button type="button" onClick={cancelEdit} disabled={loading} className={`${btnReset} w-full md:w-auto px-5`}>
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* LIST CARD */}
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5 border-b bg-gradient-to-br from-[#E6FBFF] to-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-gray-900">Daftar Brands</div>
                  <div className="text-xs text-gray-600 mt-1">{loading ? "Memuat..." : `${viewRows.length} item`}</div>
                </div>
                <div className="text-xs text-gray-600">Cari / sort, klik Edit untuk ubah data.</div>
              </div>

              <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari brand (nama / slug)..." className={inputBase} />
                </div>

                <div className="shrink-0">
                  <select
                    value={sortDir}
                    onChange={(e) => setSortDir(e.target.value)}
                    className="border rounded-xl px-3 py-2 bg-white text-gray-900 text-sm font-semibold"
                  >
                    <option value="asc">A → Z</option>
                    <option value="desc">Z → A</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="hidden md:grid grid-cols-[64px_1fr_130px_260px] gap-3 px-5 py-3 text-xs font-semibold text-gray-600 border-b bg-gray-50">
              <div>Logo</div>
              <div>Brand</div>
              <div>Status</div>
              <div className="text-right">Aksi</div>
            </div>

            <div className="divide-y">
              {viewRows.length === 0 ? (
                <div className="p-6 text-sm text-gray-600">{loading ? "Memuat..." : "Tidak ada brand / data kosong."}</div>
              ) : (
                viewRows.map((r) => {
                  const logo = toPublicUrl("Public", r.logo_url);
                  const active = !!r.is_active;
                  const isEditingRow = editingId === r.id;

                  return (
                    <div
                      key={r.id}
                      className={[
                        "p-5 md:grid md:grid-cols-[64px_1fr_130px_260px] md:items-center md:gap-3",
                        isEditingRow ? "bg-pink-50/40" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt={r.nama} className="w-12 h-12 rounded-xl object-contain border bg-white p-1" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gray-100 border" />
                        )}
                      </div>

                      <div className="mt-3 md:mt-0">
                        <div className="font-semibold text-gray-900">{r.nama}</div>
                        <div className="text-xs text-gray-500">{r.slug}</div>
                      </div>

                      <div className="mt-3 md:mt-0">
                        <span
                          className={[
                            "inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border",
                            active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200",
                          ].join(" ")}
                        >
                          {active ? "Active" : "Disabled"}
                        </span>
                      </div>

                      <div className="mt-4 md:mt-0 flex md:justify-end gap-2 flex-wrap">
                        <button className={btnEdit} onClick={() => (isEditingRow ? cancelEdit() : startEdit(r))} disabled={loading}>
                          {isEditingRow ? "Sedang Edit" : "Edit"}
                        </button>

                        <button className={active ? btnDisable : btnEnable} onClick={() => onToggle(r.id, !active)} disabled={loading}>
                          {active ? "Disable" : "Enable"}
                        </button>

                        <button className={btnDelete} onClick={() => onDelete(r.id)} disabled={loading}>
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-gray-500">
          Pastikan bucket Storage: <span className="font-semibold">Public</span> dan path logo sesuai.
        </div>
      </div>
    </div>
  );
}
