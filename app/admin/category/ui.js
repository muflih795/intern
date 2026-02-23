"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toPublicUrl, safeSlug } from "@/lib/storage";
import { checkIsAdmin } from "@/lib/adminClientGuard";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = supabaseBrowser;

export default function CategoryClient() {
  const router = useRouter();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // ✅ mode edit
  const [editingId, setEditingId] = useState(null);

  // form
  const [nama, setNama] = useState("");
  const slug = useMemo(() => safeSlug(nama), [nama]);
  const [sort, setSort] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState(null);

  // preview icon (local)
  const [previewUrl, setPreviewUrl] = useState("");

  // ✅ icon existing saat edit (kalau route kamu belum support upload file)
  const [editIconUrl, setEditIconUrl] = useState("");

  // search/filter/sort
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState(""); // "" | "active" | "disabled"
  const [sortDir, setSortDir] = useState("asc"); // asc|desc

  async function authHeaders() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  async function guard(nextPath = "/admin/category") {
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
    setSort(1);
    setIsActive(true);
    setFile(null);

    cleanupPreview(previewUrl);
    setPreviewUrl("");
    setEditIconUrl("");
  }

  function cancelEdit() {
    resetForm();
    setMsg("Edit dibatalkan.");
  }

  // ✅ IMPORTANT: resolver URL untuk icon SVG / PNG, support:
  // - full URL
  // - path Next public (/icons/a.svg)
  // - hanya filename (bag_cat.svg) -> coba beberapa fallback
  function buildIconCandidates(icon_path) {
    const p = String(icon_path || "").trim();
    if (!p) return [];

    // full url
    if (/^https?:\/\//i.test(p)) return [p];

    // already absolute path for Next public
    if (p.startsWith("/")) return [p];

    // storage-ish path without bucket prefix
    const encoded = p
      .split("/")
      .map((x) => encodeURIComponent(x))
      .join("/");

    // Try common options:
    return [
      // 1) Next public root: /bag_cat.svg
      `/${encoded}`,

      // 2) Next public folder: /icons/bag_cat.svg (kalau kamu taruh di /public/icons)
      `/icons/${encoded}`,

      // 3) Supabase Storage variants (bucket Public)
      toPublicUrl("Public", encoded),
      toPublicUrl("Public", `category/${encoded}`),
      toPublicUrl("Public", `categories/${encoded}`),
      toPublicUrl("Public", `Public/${encoded}`),
    ].filter(Boolean);
  }

  // component icon dengan fallback otomatis (untuk LIST)
  function IconImg({ icon_path, alt }) {
    const candidates = useMemo(() => buildIconCandidates(icon_path), [icon_path]);
    const [idx, setIdx] = useState(0);

    const src = candidates[idx] || "";

    if (!src) {
      return <div className="w-14 h-14 rounded-xl bg-gray-100 border" />;
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="w-14 h-14 rounded-xl object-contain border bg-white p-2"
        onError={() => {
          if (idx < candidates.length - 1) setIdx((v) => v + 1);
        }}
      />
    );
  }

  function startEdit(row) {
    setMsg("");
    setEditingId(row.id);

    setNama(row.nama || "");
    setSort(Number(row.sort || 1));
    setIsActive(!!row.is_active);

    // simpan URL icon lama untuk preview saat edit
    const candidates = buildIconCandidates(row.icon_path);
    setEditIconUrl(candidates[0] || "");

    // reset file + preview baru
    setFile(null);
    cleanupPreview(previewUrl);
    setPreviewUrl("");

    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const ok = await guard("/admin/category");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch("/api/admin/category", { cache: "no-store", headers });
      const j = await res.json().catch(() => null);

      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal memuat category");
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

  // preview file handler
  function onPickFile(f) {
    setFile(f || null);

    cleanupPreview(previewUrl);
    setPreviewUrl("");

    if (!f) return;

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  // cleanup object url
  useEffect(() => {
    return () => {
      cleanupPreview(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    setMsg("");
    try {
      const ok = await guard("/admin/category");
      if (!ok) return;

      const fd = new FormData();
      fd.append("nama", nama);
      fd.append("slug", slug);
      fd.append("sort", String(sort));
      fd.append("is_active", String(isActive));

      // NOTE: upload icon ke storage belum di-handle di route.
      // if (file) fd.append("file", file);

      const headers = await authHeaders();
      const res = await fetch("/api/admin/category", { method: "POST", body: fd, headers });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal membuat kategori");

      resetForm();
      await load();
      setMsg("✅ Kategori dibuat.");
    } catch (e) {
      setMsg(e?.message || "Gagal membuat");
    }
  }

  async function onUpdate(e) {
    e.preventDefault();
    setMsg("");
    try {
      if (!editingId) return;

      const ok = await guard("/admin/category");
      if (!ok) return;

      // ✅ update fields (tanpa upload file, sesuai route kamu saat ini)
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/category?id=${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          nama,
          slug,
          sort: Number(sort || 0),
          is_active: !!isActive,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal update kategori");

      resetForm();
      await load();
      setMsg("✅ Kategori diupdate.");
    } catch (e) {
      setMsg(e?.message || "Gagal update");
    }
  }

  async function onToggle(id, nextActive) {
    setMsg("");
    try {
      const ok = await guard("/admin/category");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/category?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ is_active: !!nextActive }),
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal update kategori");

      await load();
      setMsg("✅ Status kategori diupdate.");
    } catch (e) {
      setMsg(e?.message || "Gagal update");
    }
  }

  async function onDelete(id) {
    if (!confirm("Hapus kategori ini?")) return;
    setMsg("");
    try {
      const ok = await guard("/admin/category");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/category?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal hapus kategori");

      if (editingId === id) resetForm();

      await load();
      setMsg("🗑️ Kategori dihapus.");
    } catch (e) {
      setMsg(e?.message || "Gagal hapus");
    }
  }

  const viewRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = Array.isArray(rows) ? [...rows] : [];

    if (qq) {
      list = list.filter((r) => {
        const n = (r?.nama || "").toLowerCase();
        const s = (r?.slug || "").toLowerCase();
        return n.includes(qq) || s.includes(qq);
      });
    }

    if (filterStatus === "active") list = list.filter((r) => !!r.is_active);
    if (filterStatus === "disabled") list = list.filter((r) => !r.is_active);

    list.sort((a, b) => {
      const an = (a?.nama || "").toLowerCase();
      const bn = (b?.nama || "").toLowerCase();
      return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
    });

    return list;
  }, [rows, q, filterStatus, sortDir]);

  const inputBase =
    "w-full border rounded-xl px-3 py-2 bg-white text-gray-900 placeholder:text-gray-400 " +
    "focus:outline-none focus:ring-2 focus:ring-pink-200";

  // ✅ tombol (SAMA seperti Brand/Product)
  const btnBase =
    "rounded-xl px-3 py-2 text-sm font-semibold border transition " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const btnPrimary = "text-white bg-[#D6336C] hover:bg-[#bf2b5f] border-[#D6336C]";
  const btnReset =
    "border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200";

  const btnEdit = "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100";
  const btnDisable = "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100";
  const btnEnable = "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  const btnDanger = "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100";

  // preview untuk form (prioritas: file baru > icon lama)
  const previewSrc = previewUrl || editIconUrl || "";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#FFF1F5] via-white to-[#F6F7FF]">
      {/* TOP BAR */}
      <div className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Admin • Category</h1>
            <p className="text-xs text-gray-600 mt-1">Kelola kategori + upload icon</p>
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

        {/* FORM */}
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b bg-gradient-to-br from-[#FFE0EA] to-white">
            <div className="text-lg font-bold text-gray-900">{editingId ? "Edit Kategori" : "Tambah Kategori"}</div>
            <div className="text-xs text-gray-600 mt-1">
              {editingId ? "Ubah data kategori lalu klik Simpan." : "Isi nama kategori, icon (opsional), sort, dan status aktif."}
            </div>
          </div>

          <form onSubmit={editingId ? onUpdate : onCreate} className="p-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_280px]">
              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Nama</div>
                <input value={nama} onChange={(e) => setNama(e.target.value)} className={inputBase} required />
              </label>

              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Slug (auto)</div>
                <input value={slug} readOnly className={`${inputBase} bg-gray-50`} />
              </label>

              {/* PREVIEW */}
              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-800">Preview</div>
                <div className="text-xs text-gray-500 mt-1">Icon akan tampil di sini</div>
                <div className="mt-3 w-20 h-20 rounded-2xl border bg-white flex items-center justify-center overflow-hidden">
                  {previewSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewSrc} alt="preview" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="text-xs text-gray-400">No icon</div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_160px_160px] items-end">
              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Icon (file)</div>
                <input
                  type="file"
                  accept="image/*,.svg"
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />
                <div className="text-xs text-gray-500 mt-1">
                  SVG juga bisa. (Catatan: route kamu saat ini belum upload file, jadi ini hanya preview.)
                </div>
              </label>

              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Sort</div>
                <input type="number" value={sort} onChange={(e) => setSort(Number(e.target.value || 0))} className={inputBase} />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span className="text-gray-800 font-medium">Active</span>
              </label>
            </div>

            <div className="flex flex-col md:flex-row gap-2">
              <button type="submit" disabled={loading} className={`${btnBase} ${btnPrimary}`}>
                {loading ? "Memproses..." : editingId ? "Simpan Perubahan" : "Tambah Kategori"}
              </button>

              {!editingId ? (
                <button type="button" onClick={resetForm} disabled={loading} className={`${btnBase} ${btnReset}`}>
                  Reset
                </button>
              ) : (
                <button type="button" onClick={cancelEdit} disabled={loading} className={`${btnBase} ${btnReset}`}>
                  Batal
                </button>
              )}
            </div>
          </form>
        </div>

        {/* LIST */}
        <div className="mt-6 rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b bg-gradient-to-br from-[#E6FBFF] to-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-gray-900">Daftar Kategori</div>
                <div className="text-xs text-gray-600 mt-1">{loading ? "Memuat..." : `${viewRows.length} item`}</div>
              </div>
              <div className="text-xs text-gray-600">Cari / sort / filter, lalu Enable/Disable.</div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px_140px]">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / slug..." className={inputBase} />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputBase}>
                <option value="">Semua status</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} className={inputBase}>
                <option value="asc">A–Z</option>
                <option value="desc">Z–A</option>
              </select>
            </div>
          </div>

          <div className="hidden md:grid grid-cols-[72px_1fr_220px_320px] gap-3 px-5 py-3 text-xs font-semibold text-gray-600 border-b bg-gray-50">
            <div>Icon</div>
            <div>Kategori</div>
            <div>Info</div>
            <div className="text-right">Aksi</div>
          </div>

          <div className="divide-y">
            {viewRows.length === 0 ? (
              <div className="p-6 text-sm text-gray-600">{loading ? "Memuat..." : "Tidak ada data kategori."}</div>
            ) : (
              viewRows.map((r) => {
                const active = !!r.is_active;
                const isEditingRow = editingId === r.id;

                return (
                  <div
                    key={r.id}
                    className={[
                      "p-5 md:grid md:grid-cols-[72px_1fr_220px_320px] md:items-center md:gap-3",
                      isEditingRow ? "bg-pink-50/40" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center">
                      <IconImg icon_path={r.icon_path} alt={r.nama} />
                    </div>

                    <div className="mt-3 md:mt-0">
                      <div className="font-semibold text-gray-900">{r.nama}</div>
                      <div className="text-xs text-gray-500 mt-1">{r.slug}</div>
                    </div>

                    <div className="mt-3 md:mt-0 text-xs text-gray-600">
                      <div>sort: {r.sort ?? "-"}</div>
                      <div className="mt-2">
                        <span
                          className={[
                            "inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border",
                            active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200",
                          ].join(" ")}
                        >
                          {active ? "Active" : "Disabled"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 md:mt-0 flex md:justify-end gap-2 flex-wrap">
                      {/* ✅ EDIT */}
                      <button
                        className={`${btnBase} ${btnEdit}`}
                        onClick={() => (isEditingRow ? cancelEdit() : startEdit(r))}
                        disabled={loading}
                        title="Edit kategori"
                      >
                        {isEditingRow ? "Sedang Edit" : "Edit"}
                      </button>

                      {/* ✅ ENABLE/DISABLE (warna sama seperti brand) */}
                      <button
                        className={`${btnBase} ${active ? btnDisable : btnEnable}`}
                        onClick={() => onToggle(r.id, !active)}
                        disabled={loading}
                        title={active ? "Nonaktifkan" : "Aktifkan"}
                      >
                        {active ? "Disable" : "Enable"}
                      </button>

                      {/* ✅ HAPUS */}
                      <button className={`${btnBase} ${btnDanger}`} onClick={() => onDelete(r.id)} disabled={loading} title="Hapus kategori">
                        Hapus
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-gray-500">
          Jika icon_path kamu cuma <span className="font-semibold">bag_cat.svg</span>, pastikan file-nya benar-benar ada:
          <span className="font-semibold"> /public/bag_cat.svg</span> atau <span className="font-semibold">/public/icons/bag_cat.svg</span>,
          atau simpan icon_path sebagai path storage yang benar seperti <span className="font-semibold">category/bag_cat.svg</span>.
        </div>
      </div>
    </div>
  );
}
