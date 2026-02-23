"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
const supabase = supabaseBrowser;

function normPhoneToE164(idPhone = "") {
  let p = (idPhone || "").trim().replace(/\s+/g, "");
  if (!p) return "";
  if (p.startsWith("+")) return p;
  if (p.startsWith("0")) return "+62" + p.slice(1);
  return p; // kalau user sudah input 62xxxx tanpa +
}
const isEmail = (v = "") => /\S+@\S+\.\S+/.test(String(v).trim());

function Input({ label, type = "text", ...props }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="block text-sm">
      {label && <span className="block text-black mb-1 font-medium">{label}</span>}
      {isPassword ? (
        <div className="flex items-stretch gap-2">
          <input
            {...props}
            type={show ? "text" : "password"}
            className="w-full border border-[#D1D5DB] rounded-lg px-3 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="px-3 rounded-lg border border-[#D1D5DB] text-sm text-[#D6336C]"
          >
            {show ? "Sembunyi" : "Lihat"}
          </button>
        </div>
      ) : (
        <input
          {...props}
          type={type}
          className="w-full border border-[#D1D5DB] rounded-lg px-3 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      )}
    </label>
  );
}

export default function RegistPage() {
  const router = useRouter();
  const emailRef = useRef("");
  const phoneRef = useRef("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });

  const [step, setStep] = useState("fill");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const onChange = (e) => setForm((s) => ({ ...s, [e.target.name]: e.target.value }));

  async function handleSendOtp(e) {
    e.preventDefault();
    setMsg("");

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phoneE164 = normPhoneToE164(form.phone);
    const pwd = form.password;
    const confirm = form.confirm;

    if (!name) return setMsg("Nama wajib diisi.");
    if (!email || !isEmail(email)) return setMsg("Email tidak valid.");
    if (!pwd || pwd.length < 8) return setMsg("Password minimal 8 karakter.");
    if (pwd !== confirm) return setMsg("Konfirmasi password tidak sama.");

    setLoading(true);
    try {
      emailRef.current = email;
      phoneRef.current = phoneE164;

      // NOTE:
      // Ini flow passwordless OTP. Pastikan Supabase Email OTP aktif.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: {
            full_name: name,
            phone: phoneE164 || null,
            phone_verified: false,
          },
        },
      });
      if (error) throw error;

      setStep("otp");
      setMsg("Kode OTP sudah dikirim ke email kamu. Cek inbox/spam.");
    } catch (err) {
      console.error("sendOtp error:", err);
      const status = String(err?.status || "");
      if (status === "429") {
        setMsg("Terlalu sering mengirim OTP. Coba lagi beberapa menit lagi.");
      } else {
        setMsg(err?.message || "Gagal mengirim OTP. Pastikan Supabase Email OTP aktif (bukan Magic Link).");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyAndFinish(e) {
    e.preventDefault();
    setMsg("");

    const code = (otp || "").replace(/\D/g, "");
    if (!code || code.length !== 6) return setMsg("Masukkan kode OTP (6 digit).");

    setLoading(true);
    try {
      // Verifikasi OTP email (butuh Email OTP mode)
      const { data: verData, error: verErr } = await supabase.auth.verifyOtp({
        email: emailRef.current,
        token: code,
        type: "email",
      });
      if (verErr) throw verErr;

      // Pastikan sudah ada session setelah verify
      if (!verData?.session) {
        // Kadang tergantung setting, session tidak langsung balik.
        // Minimal kita cek apakah user sudah ada.
        const { data: s } = await supabase.auth.getSession();
        if (!s?.session) throw new Error("Session tidak terbentuk setelah verifikasi OTP. Cek setting Auth Email OTP.");
      }

      // Set password + metadata (phone tetap optional, verified false)
      const { error: updErr } = await supabase.auth.updateUser({
        password: form.password,
        data: {
          full_name: form.name.trim(),
          phone: phoneRef.current || null,
          phone_verified: false,
        },
      });
      if (updErr) throw updErr;

      setStep("done");
      setMsg("Registrasi berhasil! Mengalihkan ke halaman login…");
      router.replace("/login");
    } catch (err) {
      console.error("verify error:", err);
      setMsg(
        err?.message ||
          "Verifikasi gagal. Jika email yang masuk berupa link (bukan kode), berarti Supabase kamu masih Magic Link, bukan Email OTP."
      );
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (loading) return;
    setMsg("");

    const email = emailRef.current || form.email.trim().toLowerCase();
    if (!isEmail(email)) return setMsg("Email tidak valid.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: {
            full_name: form.name.trim(),
            phone: phoneRef.current || normPhoneToE164(form.phone) || null,
            phone_verified: false,
          },
        },
      });
      if (error) throw error;
      setMsg("Kode OTP dikirim ulang. Cek inbox/spam.");
    } catch (err) {
      console.error("resend error:", err);
      const status = String(err?.status || "");
      if (status === "429") setMsg("Terlalu sering mengirim OTP. Coba sebentar lagi.");
      else setMsg(err?.message || "Gagal mengirim ulang OTP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-neutral-100 flex justify-center">
      <main className="mx-auto w-full max-w-[430px] bg-white shadow md:border px-6 pt-10 pb-12 rounded-t-2xl">
        <div className="flex flex-col items-center">
          <img src="/logo_ybg.png" alt="YBG" className="w-28 h-28" />
          <h1 className="text-black text-[22px] font-semibold">Daftar Akun YBG</h1>
          <p className="text-sm text-gray-600 mt-1 text-center">
            Verifikasi akun via <b>OTP Email</b>.
          </p>
        </div>

        {step === "fill" && (
          <form onSubmit={handleSendOtp} className="mt-6 space-y-4 pb-6">
            <Input label="Nama Lengkap" name="name" placeholder="Masukkan Nama Lengkap" value={form.name} onChange={onChange} />
            <Input label="Email" type="email" name="email" placeholder="Masukkan Email" value={form.email} onChange={onChange} />
            <Input label="Nomor Handphone (opsional)" type="tel" name="phone" placeholder="08xxx atau +62xxx" value={form.phone} onChange={onChange} />
            <Input label="Password" type="password" name="password" placeholder="Masukkan Password" value={form.password} onChange={onChange} />
            <Input label="Konfirmasi Password" type="password" name="confirm" placeholder="Masukkan Konfirmasi Password" value={form.confirm} onChange={onChange} />

            {msg && <p className="text-sm text-center text-rose-600">{msg}</p>}

            <div className="pt-2">
              <button disabled={loading} className="w-full bg-[#D6336C] text-white font-semibold rounded-lg py-3 disabled:opacity-60 shadow-sm">
                {loading ? "Mengirim OTP..." : "Kirim OTP ke Email"}
              </button>
            </div>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyAndFinish} className="mt-6 space-y-4 pb-10">
            <Input
              label="Kode OTP (6 digit)"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />

            {msg && <p className="text-sm text-center text-rose-600">{msg}</p>}

            <button disabled={loading} className="w-full bg-[#D6336C] text-white font-semibold rounded-lg py-3 disabled:opacity-60">
              {loading ? "Memverifikasi..." : "Verifikasi & Buat Akun"}
            </button>

            <button
              type="button"
              onClick={resendOtp}
              disabled={loading}
              className="w-full border border-[#D6336C] text-[#D6336C] font-semibold rounded-lg py-3 disabled:opacity-60"
            >
              Kirim Ulang OTP
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="mt-6 mb-12">
            <p className="text-center text-emerald-600 font-medium">Registrasi berhasil! Silakan login.</p>
          </div>
        )}
      </main>
    </div>
  );
}
