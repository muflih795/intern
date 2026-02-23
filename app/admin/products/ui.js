"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toPublicUrl, safeSlug } from "@/lib/storage";
import { checkIsAdmin } from "@/lib/adminClientGuard";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = supabaseBrowser;

export default function ProductsClient() {
  const router = useRouter();

  const [rows, setRows] = useState([]);
  const [brands, setBrands] = useState([]);
  const [cats, setCats] = useState([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // mode edit
  const [editingId, setEditingId] = useState(null);

  // form
  const [nama, setNama] = useState("");
  const slugNama = useMemo(() => safeSlug(nama), [nama]);
  const [brandSlug, setBrandSlug] = useState("");
  const [kategori, setKategori] = useState("");
  const [price, setPrice] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [status, setStatus] = useState("published");
  const [isActive, setIsActive] = useState(true);
  const [stock, setStock] = useState(0);
  const [condition, setCondition] = useState("new");
  const [file, setFile] = useState(null);

  // preview gambar (file)
  const [filePreview, setFilePreview] = useState(""); // blob url
  const [editImageUrl, setEditImageUrl] = useState(""); // image_url dari row saat edit

  // search & filter
  const [q, setQ] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterCat, setFilterCat] = useState("");

  async function authHeaders() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  async function guard(nextPath = "/admin/products") {
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
    try {
      if (url) URL.revokeObjectURL(url);
    } catch {}
  }

  function resetForm() {
    setEditingId(null);
    setNama("");
    setBrandSlug("");
    setKategori("");
    setPrice("");
    setDeskripsi("");
    setStatus("published");
    setIsActive(true);
    setStock(0);
    setCondition("new");

    setFile(null);
    cleanupPreview(filePreview);
    setFilePreview("");
    setEditImageUrl("");
  }

  function startEdit(row) {
    setMsg("");
    setEditingId(row.id);
    setNama(row.nama || "");
    setBrandSlug(row.brand_slug || "");
    setKategori(row.kategori || "");
    setPrice(row.price == null ? "" : String(row.price));
    setDeskripsi(row.deskripsi || "");
    setStatus(row.status || "published");
    setIsActive(!!row.is_active);
    setStock(Number(row.stock || 0));
    setCondition(row.condition === "used" ? "used" : "new");

    // preview dari image_url existing
    const existing = toPublicUrl("Public", row.image_url);
    setEditImageUrl(existing || "");

    setFile(null);
    cleanupPreview(filePreview);
    setFilePreview("");

    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    resetForm();
    setMsg("Edit dibatalkan.");
  }

  async function loadAll() {
    setLoading(true);
    setMsg("");

    try {
      const ok = await guard("/admin/products");
      if (!ok) return;

      const headers = await authHeaders();

      let pJson = null;
      let bJson = null;
      let cJson = null;

      try {
        const pRes = await fetch("/api/admin/products", { cache: "no-store", headers });
        pJson = await pRes.json().catch(() => null);
        if (!pJson?.ok) throw new Error(pJson?.error || pJson?.reason || `products ${pRes.status}`);
      } catch (e) {
        setMsg((m) => (m ? m + " | " : "") + `Products: ${e?.message || "gagal"}`);
        pJson = { ok: true, rows: [] };
      }

      try {
        const bRes = await fetch("/api/admin/brands", { cache: "no-store", headers });
        bJson = await bRes.json().catch(() => null);
        if (!bJson?.ok) throw new Error(bJson?.error || bJson?.reason || `brands ${bRes.status}`);
      } catch (e) {
        setMsg((m) => (m ? m + " | " : "") + `Brands: ${e?.message || "gagal"}`);
        bJson = { ok: true, rows: [] };
      }

      try {
        const cRes = await fetch("/api/admin/category", { cache: "no-store", headers });
        cJson = await cRes.json().catch(() => null);
        if (!cJson?.ok) throw new Error(cJson?.error || cJson?.reason || `category ${cRes.status}`);
      } catch (e) {
        setMsg((m) => (m ? m + " | " : "") + `Category: ${e?.message || "gagal"}`);
        cJson = { ok: true, rows: [] };
      }

      setRows(Array.isArray(pJson.rows) ? pJson.rows : []);
      setBrands(Array.isArray(bJson.rows) ? bJson.rows : []);
      setCats(Array.isArray(cJson.rows) ? cJson.rows : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line
  }, []);

  // choose file + preview
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

  async function onCreate(e) {
    e.preventDefault();
    setMsg("");

    try {
      const ok = await guard("/admin/products");
      if (!ok) return;

      const fd = new FormData();
      fd.append("nama", nama);
      fd.append("brand_slug", brandSlug);
      fd.append("kategori", kategori);
      fd.append("price", price ? String(price) : "");
      fd.append("deskripsi", deskripsi || "");
      fd.append("status", status);
      fd.append("is_active", String(isActive));
      fd.append("stock", String(stock || 0));
      fd.append("condition", condition);
      if (file) fd.append("file", file);

      const headers = await authHeaders();
      const res = await fetch("/api/admin/products", { method: "POST", body: fd, headers });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal membuat produk");

      resetForm();
      await loadAll();
      setMsg("✅ Produk dibuat.");
    } catch (e) {
      setMsg(e?.message || "Gagal membuat");
    }
  }

  async function onUpdate(e) {
    e.preventDefault();
    setMsg("");

    try {
      if (!editingId) return;

      const ok = await guard("/admin/products");
      if (!ok) return;

      const fd = new FormData();
      fd.append("nama", nama);
      fd.append("brand_slug", brandSlug);
      fd.append("kategori", kategori);
      fd.append("price", price ? String(price) : "");
      fd.append("deskripsi", deskripsi || "");
      fd.append("status", status);
      fd.append("is_active", String(isActive));
      fd.append("stock", String(stock || 0));
      fd.append("condition", condition);
      if (file) fd.append("file", file);

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/products?id=${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        body: fd,
        headers,
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal update produk");

      resetForm();
      await loadAll();
      setMsg("✅ Produk diupdate.");
    } catch (e) {
      setMsg(e?.message || "Gagal update");
    }
  }

  // ✅ tombol Disable/Enable sekarang AKTIF
  async function onToggle(id, nextActive) {
    setMsg("");
    try {
      const ok = await guard("/admin/products");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ is_active: !!nextActive }),
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal update produk");

      await loadAll();
      setMsg("✅ Status produk diupdate.");
    } catch (e) {
      setMsg(e?.message || "Gagal update");
    }
  }

  async function onDelete(id) {
    if (!confirm("Hapus produk ini?")) return;
    setMsg("");
    try {
      const ok = await guard("/admin/products");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || "Gagal hapus produk");

      if (editingId === id) resetForm();

      await loadAll();
      setMsg("🗑️ Produk dihapus.");
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
        const bs = (r?.brand_slug || "").toLowerCase();
        const ks = (r?.kategori || "").toLowerCase();
        const st = (r?.status || "").toLowerCase();
        const cd = (r?.condition || "").toLowerCase();
        return n.includes(qq) || bs.includes(qq) || ks.includes(qq) || st.includes(qq) || cd.includes(qq);
      });
    }

    if (filterBrand) list = list.filter((r) => String(r?.brand_slug || "") === String(filterBrand));
    if (filterCat) list = list.filter((r) => String(r?.kategori || "") === String(filterCat));

    list.sort((a, b) => {
      const an = (a?.nama || "").toLowerCase();
      const bn = (b?.nama || "").toLowerCase();
      return sortDir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
    });

    return list;
  }, [rows, q, filterBrand, filterCat, sortDir]);

  const inputBase =
    "w-full border rounded-xl px-3 py-2 bg-white text-gray-900 placeholder:text-gray-400 " +
    "focus:outline-none focus:ring-2 focus:ring-pink-200";

  // tombol
  const btnBase =
    "rounded-xl px-3 py-2 text-sm font-semibold border transition " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const btnEdit = `${btnBase} border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100`;
  const btnDelete = `${btnBase} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`;

  // ✅ Reset: outline putih
  const btnReset = `${btnBase} border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200`;

  // ✅ Disable: beda warna & bisa diklik (aktif/inaktif)
  const btnDisableActive = `${btnBase} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`;
  const btnEnable = `${btnBase} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`;

  // preview (prioritas: file baru > image lama)
  const previewSrc = filePreview || editImageUrl || "";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#FFF1F5] via-white to-[#F6F7FF]">
      {/* TOP BAR */}
      <div className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Admin • Products</h1>
            <p className="text-xs text-gray-600 mt-1">Kelola produk + upload gambar</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAll}
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
            <div className="text-lg font-bold text-gray-900">{editingId ? "Edit Produk" : "Tambah Produk"}</div>
            <div className="text-xs text-gray-600 mt-1">
              {editingId ? "Ubah data produk lalu klik Simpan Perubahan." : "Isi data produk, pilih brand & kategori, lalu upload gambar (opsional)."}
            </div>
          </div>

          <form onSubmit={editingId ? onUpdate : onCreate} className="p-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Nama</div>
                <input value={nama} onChange={(e) => setNama(e.target.value)} className={inputBase} required />
                <div className="text-[11px] text-gray-500 mt-1">
                  slug: <span className="font-semibold">{slugNama}</span>
                </div>
              </label>

              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Brand</div>
                <select value={brandSlug} onChange={(e) => setBrandSlug(e.target.value)} className={inputBase} required>
                  <option value="">Pilih brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.slug}>
                      {b.nama} ({b.slug})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-sm font-semibold text-gray-800 mb-1">Kategori</div>
                <select value={kategori} onChange={(e) => setKategori(e.target.value)} className={inputBase} required>
                  <option value="">Pilih kategori</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.nama} ({c.slug})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Price</div>
                  <input value={price} onChange={(e) => setPrice(e.target.value)} className={inputBase} />
                </label>

                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Stock</div>
                  <input type="number" value={stock} onChange={(e) => setStock(Number(e.target.value || 0))} className={inputBase} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Condition</div>
                  <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputBase}>
                    <option value="new">new</option>
                    <option value="used">used</option>
                  </select>
                </label>

                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Status</div>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputBase}>
                    <option value="published">published</option>
                    <option value="draft">draft</option>
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span className="text-gray-800 font-medium">Active</span>
              </label>

              <label className="block md:col-span-2">
                <div className="text-sm font-semibold text-gray-800 mb-1">Deskripsi</div>
                <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} className={`${inputBase} min-h-[110px]`} />
              </label>

              <div className="md:col-span-2 grid gap-3 md:grid-cols-[1fr_220px] items-start">
                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Gambar (file)</div>
                  <input type="file" accept="image/*" onChange={(e) => onPickFile(e.target.files?.[0] || null)} className="text-sm" />
                  <div className="text-xs text-gray-500 mt-1">
                    Preview di kanan. Saat edit, tampil gambar lama sampai kamu pilih file baru.
                  </div>
                </label>

                <div className="rounded-2xl border bg-white p-3">
                  <div className="text-xs font-semibold text-gray-600 mb-2">Preview</div>
                  {previewSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewSrc} alt="Preview" className="w-full h-[160px] object-cover rounded-xl border bg-gray-50" />
                  ) : (
                    <div className="w-full h-[160px] rounded-xl border bg-gray-50 flex items-center justify-center text-xs text-gray-500">
                      Belum ada gambar
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full md:w-auto rounded-xl px-5 py-2 text-sm font-semibold text-white bg-[#D6336C] hover:bg-[#bf2b5f] disabled:opacity-60"
              >
                {loading ? "Memproses..." : editingId ? "Simpan Perubahan" : "Tambah Produk"}
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

        {/* LIST */}
        <div className="mt-6 rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b bg-gradient-to-br from-[#E6FBFF] to-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-gray-900">Daftar Products</div>
                <div className="text-xs text-gray-600 mt-1">{loading ? "Memuat..." : `${viewRows.length} item`}</div>
              </div>
              <div className="text-xs text-gray-600">Cari / filter / sort, klik Edit untuk ubah data.</div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_200px_200px_140px]">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / brand / kategori / status..." className={inputBase} />
              <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className={inputBase}>
                <option value="">Semua brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.slug}>
                    {b.nama}
                  </option>
                ))}
              </select>
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className={inputBase}>
                <option value="">Semua kategori</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.nama}
                  </option>
                ))}
              </select>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} className={inputBase}>
                <option value="asc">A–Z</option>
                <option value="desc">Z–A</option>
              </select>
            </div>
          </div>

          <div className="hidden md:grid grid-cols-[72px_1fr_240px_260px] gap-3 px-5 py-3 text-xs font-semibold text-gray-600 border-b bg-gray-50">
            <div>Gambar</div>
            <div>Produk</div>
            <div>Info</div>
            <div className="text-right">Aksi</div>
          </div>

          <div className="divide-y">
            {viewRows.length === 0 ? (
              <div className="p-6 text-sm text-gray-600">{loading ? "Memuat..." : "Tidak ada data produk."}</div>
            ) : (
              viewRows.map((r) => {
                const img = toPublicUrl("Public", r.image_url);
                const active = !!r.is_active;
                const isEditingRow = editingId === r.id;

                return (
                  <div
                    key={r.id}
                    className={[
                      "p-5 md:grid md:grid-cols-[72px_1fr_240px_260px] md:items-center md:gap-3",
                      isEditingRow ? "bg-pink-50/40" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt={r.nama} className="w-14 h-14 rounded-xl object-cover border bg-white" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gray-100 border" />
                      )}
                    </div>

                    <div className="mt-3 md:mt-0">
                      <div className="font-semibold text-gray-900">{r.nama}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        <span className="font-medium">{r.brand_slug}</span> • <span className="font-medium">{r.kategori}</span>
                      </div>
                    </div>

                    <div className="mt-3 md:mt-0 text-xs text-gray-600">
                      <div>
                        <span className="font-semibold text-gray-800">Rp</span> {r.price ? String(r.price) : "-"}
                      </div>
                      <div className="mt-1">
                        {r.condition} • stock {r.stock ?? 0} • {r.status}
                      </div>
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
                      <button className={btnEdit} onClick={() => (isEditingRow ? cancelEdit() : startEdit(r))} disabled={loading}>
                        {isEditingRow ? "Sedang Edit" : "Edit"}
                      </button>

                      {/* ✅ sekarang tombol ini berfungsi */}
                      <button
                        className={active ? btnDisableActive : btnEnable}
                        onClick={() => onToggle(r.id, !active)}
                        disabled={loading}
                        title={active ? "Nonaktifkan produk" : "Aktifkan produk"}
                      >
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

        <div className="mt-6 text-xs text-gray-500">
          Pastikan bucket Storage: <span className="font-semibold">Public</span> dan path gambar sesuai.
        </div>
      </div>
    </div>
  );
}
