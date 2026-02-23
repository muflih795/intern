// lib/storage.js

// NOTE:
// - File ini aman dipakai di client & server.
// - Kita tidak pakai supabaseClient di sini supaya tidak crash kalau ke-import di server component.
// - Karena bucket kamu "Public" bersifat public, public URL bisa dibentuk manual.

function encodePath(p) {
  return String(p)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export function publicUrl(bucket, path) {
  if (!bucket || !path) return null;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;

  const clean = String(path)
    .trim()
    .replace(/[\r\n\t]+/g, "")
    .replace(/^\/+/, "")
    .replace(new RegExp(`^${bucket}/`, "i"), ""); // kalau kepanggil dengan "Public/brand/x.png"

  const encoded = encodePath(clean);

  // format supabase storage public url:
  // {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}

export function toPublicUrl(bucket, value) {
  if (!value) return null;

  const s = String(value).trim();

  // kalau sudah full url, return 그대로
  if (/^https?:\/\//i.test(s)) return s;

  // path biasa: "brand/LV.png"
  const clean = s.replace(/[\r\n\t]+/g, "").replace(/^\/+/, "");

  return publicUrl(bucket, clean);
}

// Dipakai untuk auto slug
export function safeSlug(s = "") {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Dipakai untuk nama file upload yang aman
export function safeFileName(s = "") {
  return String(s)
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
