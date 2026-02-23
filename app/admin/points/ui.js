"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkIsAdmin } from "@/lib/adminClientGuard";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const supabase = supabaseBrowser;

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
function fmtNum(n) {
  const x = Number(n || 0);
  return new Intl.NumberFormat("id-ID").format(x);
}

function normalizeDeltaInput(raw) {
  let v = String(raw ?? "").trim();
  if (!v) return "";
  if (v === "-") return "-";

  const m = v.match(/^-?\d+$/);
  if (!m) {
    const isNeg = v.startsWith("-");
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return isNeg ? "-" : "";
    v = (isNeg ? "-" : "") + digits;
  }

  const isNeg = v.startsWith("-");
  const digits = isNeg ? v.slice(1) : v;
  if (/^0+$/.test(digits)) return "0";
  const cleanDigits = digits.replace(/^0+/, "");
  return (isNeg ? "-" : "") + cleanDigits;
}

function normalizePhone(raw) {
  let p = String(raw || "").replace(/[^\d]/g, "");
  if (!p) return "";
  if (p.startsWith("0")) p = "62" + p.slice(1);
  return p;
}

export default function PointsClient() {
  const router = useRouter();

  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [userId, setUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  const [deltaStr, setDeltaStr] = useState("0");
  const [reason, setReason] = useState("");
  const [expiresAtLocal, setExpiresAtLocal] = useState(""); // datetime-local

  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // ✅ MODAL MIGRASI
  const [openMigrasi, setOpenMigrasi] = useState(false);
  const [mName, setMName] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mPhone, setMPhone] = useState("");
  const [mPointsStr, setMPointsStr] = useState("0");
  const [mReason, setMReason] = useState("migrasi");
  const [mExpiresAtLocal, setMExpiresAtLocal] = useState("");
  const [mLoading, setMLoading] = useState(false);

  async function authHeaders() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  async function guard(nextPath = "/admin/points") {
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

  async function search() {
    setMsg("");
    setLoading(true);
    try {
      const ok = await guard("/admin/points");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q || "")}`, {
        cache: "no-store",
        headers,
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || `Gagal mencari users (${res.status})`);

      setUsers(Array.isArray(j.rows) ? j.rows : []);
    } catch (e) {
      setMsg(e?.message || "Gagal mencari");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary(uid) {
    if (!uid) {
      setSummary(null);
      return;
    }

    setLoadingSummary(true);
    try {
      const ok = await guard("/admin/points");
      if (!ok) return;

      const headers = await authHeaders();
      const res = await fetch(`/api/admin/points?user_id=${encodeURIComponent(uid)}`, {
        cache: "no-store",
        headers,
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || `Gagal memuat summary (${res.status})`);

      setSummary(j);
    } catch (e) {
      setMsg(e?.message || "Gagal memuat summary");
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    loadSummary(userId);
    // eslint-disable-next-line
  }, [userId]);

  async function addPoints(e) {
    e.preventDefault();
    setMsg("");

    try {
      const ok = await guard("/admin/points");
      if (!ok) return;

      const headers = await authHeaders();
      const expires_at = expiresAtLocal ? new Date(expiresAtLocal).toISOString() : null;

      const delta = Number(deltaStr || 0);
      if (!Number.isFinite(delta) || delta === 0) throw new Error("Delta harus angka dan tidak boleh 0");

      const res = await fetch("/api/admin/points", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          user_id: userId,
          delta,
          reason: reason || "",
          expires_at,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || `Gagal update points (${res.status})`);

      setMsg("✅ Points berhasil diupdate.");
      setDeltaStr("0");
      setReason("");
      setExpiresAtLocal("");

      await loadSummary(userId);
      await search();
    } catch (e) {
      setMsg(e?.message || "Gagal update points");
    }
  }

  // ✅ submit migrasi (pending by phone)
  async function submitMigrasi(e) {
    e.preventDefault();
    setMsg("");

    try {
      const ok = await guard("/admin/points");
      if (!ok) return;

      const headers = await authHeaders();

      const phone = normalizePhone(mPhone);
      if (!phone) throw new Error("Nomor telepon wajib");

      const points = Number(mPointsStr || 0);
      if (!Number.isFinite(points) || points <= 0) throw new Error("Points harus angka > 0");

      const expires_at = mExpiresAtLocal ? new Date(mExpiresAtLocal).toISOString() : null;

      setMLoading(true);
      const res = await fetch("/api/admin/points-migrate", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          name: mName || "",
          email: mEmail || "",
          phone,
          points,
          reason: mReason || "migrasi",
          expires_at,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || j?.reason || `Gagal simpan migrasi (${res.status})`);

      setMsg(`✅ Migrasi points tersimpan untuk ${phone} (+${fmtNum(points)}).`);
      setOpenMigrasi(false);

      // reset
      setMName("");
      setMEmail("");
      setMPhone("");
      setMPointsStr("0");
      setMReason("migrasi");
      setMExpiresAtLocal("");
    } catch (e) {
      setMsg(e?.message || "Gagal simpan migrasi");
    } finally {
      setMLoading(false);
    }
  }

  const inputBase =
    "w-full border rounded-xl px-3 py-2 bg-white text-gray-900 placeholder:text-gray-400 " +
    "focus:outline-none focus:ring-2 focus:ring-pink-200";

  const btnBase =
    "rounded-xl px-4 py-2 text-sm font-semibold border transition disabled:opacity-50 disabled:cursor-not-allowed";
  const btnPrimary = "text-white bg-[#D6336C] hover:bg-[#bf2b5f] border-[#D6336C]";
  const btnSoft = "bg-white hover:bg-gray-50";
  const btnDanger = "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100";

  const expiringBlocks = useMemo(() => {
    const blocks = summary?.expiring_by_date || [];
    return Array.isArray(blocks) ? blocks : [];
  }, [summary]);

  const pointsAvailable = summary?.user?.points ?? selectedUser?.points ?? 0;
  const nextExpiring = summary?.next_expiring || null;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#FFF1F5] via-white to-[#F6F7FF]">
      {/* TOP BAR */}
      <div className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Admin • Points</h1>
            <p className="text-xs text-gray-600 mt-1">Input points user + migrasi berdasarkan nomor telepon.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpenMigrasi(true)}
              className={`${btnBase} ${btnSoft}`}
            >
              + Tambah Akun / No Telepon
            </button>

            <button
              onClick={search}
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
        {/* ALERT */}
        {msg ? (
          <div className="mb-5 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm">
            {msg}
          </div>
        ) : null}

        {/* MAIN GRID */}
        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
          {/* LEFT */}
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5 border-b bg-gradient-to-br from-[#FFE0EA] to-white">
              <div className="text-lg font-bold text-gray-900">Cari User</div>
              <div className="text-xs text-gray-600 mt-1">Cari berdasarkan email / nama.</div>
            </div>

            <div className="p-5">
              <div className="flex gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="email atau name..."
                  className={inputBase}
                />
                <button className={`${btnBase} ${btnSoft}`} onClick={search} disabled={loading}>
                  {loading ? "..." : "Cari"}
                </button>
              </div>

              <div className="text-xs text-gray-600 mt-3">{loading ? "Memuat..." : `${users.length} user ditemukan`}</div>

              <div className="mt-3 space-y-2">
                {users.length === 0 ? (
                  <div className="rounded-2xl border bg-gray-50 p-4 text-sm text-gray-600">
                    {loading ? "Memuat..." : "Tidak ada user yang cocok."}
                  </div>
                ) : (
                  users.map((u) => {
                    const active = userId === u.id;
                    const label = u.email || u.name || u.label || u.id;

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setUserId(u.id);
                          setSelectedUser(u);
                        }}
                        className={[
                          "w-full text-left border rounded-2xl px-4 py-3 text-sm transition",
                          active ? "bg-pink-50/40 border-pink-200" : "bg-white hover:bg-gray-50",
                        ].join(" ")}
                      >
                        <div className="font-semibold text-gray-900">{label}</div>
                        <div className="text-xs text-gray-600 mt-1">id: {u.id}</div>
                        {"points" in u ? (
                          <div className="text-xs text-gray-600 mt-1">
                            points: <span className="font-semibold">{fmtNum(u.points)}</span>
                          </div>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-5 border-b bg-gradient-to-br from-[#E6FBFF] to-white">
              <div className="text-lg font-bold text-gray-900">Tambah / Kurangi Points</div>
              <div className="text-xs text-gray-600 mt-1">Pilih user di kiri, isi delta (+/-), optional expiry, lalu simpan.</div>
            </div>

            <form onSubmit={addPoints} className="p-5 space-y-4">
              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">User terpilih</div>
                <div className="text-sm mt-1 text-gray-800">
                  {selectedUser?.email || selectedUser?.name || selectedUser?.label || (userId ? "User" : "Belum memilih user")}
                </div>
                <div className="text-xs text-gray-600 mt-1">id: {userId || "-"}</div>

                <div className="mt-3 text-sm">
                  <span className="text-gray-700">Points tersedia:</span>{" "}
                  <span className="font-bold text-gray-900">{loadingSummary ? "..." : fmtNum(pointsAvailable)}</span>
                </div>

                <div className="mt-2">
                  <div className="text-xs font-semibold text-gray-700">Points yang akan hangus</div>

                  {loadingSummary ? (
                    <div className="text-xs text-gray-600 mt-1">Memuat...</div>
                  ) : !userId ? (
                    <div className="text-xs text-gray-600 mt-1">Pilih user untuk melihat detail expiry.</div>
                  ) : expiringBlocks.length === 0 ? (
                    <div className="text-xs text-gray-600 mt-1">Tidak ada points ber-expired.</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {nextExpiring ? (
                        <div className="rounded-xl border bg-white px-3 py-2 text-xs">
                          Terdekat:{" "}
                          <span className="font-semibold text-gray-900">{fmtNum(nextExpiring.points)}</span>{" "}
                          hangus{" "}
                          <span className="font-semibold text-gray-900">{fmtDate(nextExpiring.expires_at)}</span>
                        </div>
                      ) : null}

                      <div className="rounded-xl border bg-white">
                        <div className="px-3 py-2 text-[11px] font-semibold text-gray-600 border-b bg-gray-50 rounded-t-xl">
                          Rincian per tanggal
                        </div>
                        <div className="p-3 space-y-1">
                          {expiringBlocks.map((x, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="text-gray-700">{fmtDate(x.expires_at)}</span>
                              <span className="font-semibold text-gray-900">{fmtNum(x.points)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Delta (+ / -)</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={deltaStr}
                    onFocus={() => {
                      if (deltaStr === "0") setDeltaStr("");
                    }}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") return setDeltaStr("");
                      if (raw === "-") return setDeltaStr("-");
                      setDeltaStr(normalizeDeltaInput(raw));
                    }}
                    onBlur={() => {
                      if (deltaStr === "" || deltaStr === "-") setDeltaStr("0");
                      else setDeltaStr((v) => normalizeDeltaInput(v));
                    }}
                    className={inputBase}
                    placeholder="contoh: 5 atau -5"
                  />
                  <div className="text-xs text-gray-500 mt-1">Positif menambah points, negatif mengurangi.</div>
                </label>

                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Reason</div>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className={inputBase}
                    placeholder="welcome / adjustment / dll"
                  />
                </label>

                <label className="block md:col-span-2">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Expires At (opsional)</div>
                  <input
                    type="datetime-local"
                    value={expiresAtLocal}
                    onChange={(e) => setExpiresAtLocal(e.target.value)}
                    className={inputBase}
                  />
                  <div className="text-xs text-gray-500 mt-1">Isi jika points ini punya masa berlaku.</div>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button type="submit" className={`${btnBase} ${btnPrimary}`} disabled={!userId}>
                  Simpan
                </button>
                <button
                  type="button"
                  className={`${btnBase} ${btnSoft}`}
                  onClick={() => {
                    setDeltaStr("0");
                    setReason("");
                    setExpiresAtLocal("");
                  }}
                  disabled={!userId}
                >
                  Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ✅ MODAL MIGRASI */}
      {openMigrasi ? (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border bg-white shadow-xl overflow-hidden">
            <div className="p-5 border-b bg-gradient-to-br from-[#E6FBFF] to-white flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">Tambah Akun / No Telepon (Migrasi)</div>
                <div className="text-xs text-gray-600 mt-1">
                  Simpan points untuk pelanggan yang belum registrasi. Patokan utama: <span className="font-semibold">nomor telepon</span>.
                </div>
              </div>
              <button className={`${btnBase} ${btnSoft}`} onClick={() => setOpenMigrasi(false)}>
                Tutup
              </button>
            </div>

            <form onSubmit={submitMigrasi} className="p-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Nama (opsional)</div>
                  <input value={mName} onChange={(e) => setMName(e.target.value)} className={inputBase} placeholder="Nama pelanggan" />
                </label>

                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Email (opsional)</div>
                  <input value={mEmail} onChange={(e) => setMEmail(e.target.value)} className={inputBase} placeholder="email@contoh.com" />
                </label>

                <label className="block md:col-span-2">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Nomor Telepon (wajib)</div>
                  <input value={mPhone} onChange={(e) => setMPhone(e.target.value)} className={inputBase} placeholder="0812xxxx / +62812xxxx" />
                  <div className="text-[11px] text-gray-500 mt-1">
                    tersimpan sebagai: <span className="font-semibold">{normalizePhone(mPhone) || "-"}</span>
                  </div>
                </label>

                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Tambah Points (+)</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mPointsStr}
                    onFocus={() => {
                      if (mPointsStr === "0") setMPointsStr("");
                    }}
                    onChange={(e) => setMPointsStr(normalizeDeltaInput(e.target.value))}
                    onBlur={() => {
                      if (!mPointsStr) setMPointsStr("0");
                      else setMPointsStr((v) => normalizeDeltaInput(v));
                    }}
                    className={inputBase}
                    placeholder="contoh: 100"
                  />
                  <div className="text-xs text-gray-500 mt-1">Khusus migrasi biasanya input angka positif.</div>
                </label>

                <label className="block">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Reason</div>
                  <input value={mReason} onChange={(e) => setMReason(e.target.value)} className={inputBase} placeholder="migrasi / welcome / dll" />
                </label>

                <label className="block md:col-span-2">
                  <div className="text-sm font-semibold text-gray-800 mb-1">Expires At (opsional)</div>
                  <input type="datetime-local" value={mExpiresAtLocal} onChange={(e) => setMExpiresAtLocal(e.target.value)} className={inputBase} />
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button type="submit" className={`${btnBase} ${btnPrimary}`} disabled={mLoading}>
                  {mLoading ? "Menyimpan..." : "Simpan Migrasi"}
                </button>
                <button
                  type="button"
                  className={`${btnBase} ${btnDanger}`}
                  onClick={() => {
                    setMName("");
                    setMEmail("");
                    setMPhone("");
                    setMPointsStr("0");
                    setMReason("migrasi");
                    setMExpiresAtLocal("");
                  }}
                  disabled={mLoading}
                >
                  Reset
                </button>
              </div>

              <div className="text-xs text-gray-500">
                Points migrasi ini <span className="font-semibold">belum masuk saldo user</span> sampai user registrasi dan mengisi nomor telepon yang sama.
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
