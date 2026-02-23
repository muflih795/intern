"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import BottomNavigation from "../components/bottomnav";
import BannerCarousel from "../components/bannerCarousel";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { toPublicUrl } from "@/lib/storage";
import { fetchCategories } from "@/lib/categories";
import { fetchBrands } from "@/lib/repos";

const supabase = supabaseBrowser;

const formatIDR = (v) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

export default function ProductAllPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [cats, setCats] = useState(null);
  const [brands, setBrands] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select(
            "id,nama,brand_slug,kategori,price,image_url,image_urls,deskripsi,is_active,status,stock,date_created"
          )
          .eq("status", "published")
          .eq("is_active", true)
          .order("date_created", { ascending: false });

        if (error) throw error;
        setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message || "Gagal memuat produk");
        setItems([]);
      }
    })();

    (async () => {
      try {
        const list = await fetchCategories();
        setCats(list);
      } catch {
        setCats([]);
      }
    })();

    (async () => {
      try {
        const list = await fetchBrands();
        setBrands(list);
      } catch {
        setBrands([]);
      }
    })();
  }, []);

  const filtered =
    Array.isArray(items) && q.trim()
      ? items.filter((p) =>
          (p?.nama || "").toLowerCase().includes(q.trim().toLowerCase())
        )
      : items;

  return (
    <div className="min-h-[100dvh] bg-neutral-100 flex justify-center">
      <main className="w-full min-h-[100dvh] bg-white md:max-w-[430px] md:shadow md:border flex flex-col overflow-y-auto pb-[80px]">
        <div className="sticky top-0 bg-white px-4 py-3 shadow flex items-center justify-between gap-3 z-10">
          <h1 className="text-[#D6336C] font-semibold">Produk</h1>
          <Link
            href="/cart"
            aria-label="Keranjang"
            title="Keranjang"
            className="p-2 rounded-full border border-pink-200 text-pink-600 hover:bg-pink-50 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M7 18a2 2 0 1 0 2 2a2 2 0 0 0-2-2m10 0a2 2 0 1 0 2 2a2 2 0 0 0-2-2M7.2 14h9.45a2 2 0 0 0 1.92-1.47L20.8 7H6.21L5.27 4H2v2h2.27z"
              />
            </svg>
          </Link>
        </div>

        <div className="w-full">
          <BannerCarousel />
        </div>

        <div className="px-4 py-3">
          <input
            placeholder="Produk, Jenis Produk..."
            className="w-full rounded-full border border-gray-200 bg-white px-4 py-2 text-sm !text-gray-900 caret-[#D6336C] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#D6336C]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            name="search"
            inputMode="search"
            spellCheck={false}
          />
        </div>

        {/* Brand */}
        <section className="px-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-[#D6336C]">Brand</h2>
            <Link href="/brand" className="text-[#D6336C] text-sm">
              Lihat Semua
            </Link>
          </div>

          {brands === null ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[80px] h-[100px] rounded-2xl bg-gray-100 animate-pulse shrink-0"
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2">
              {brands
                .filter((b) => b?.slug)
                .map((b, i) => {
                  const logo =
                    typeof b?.logoSrc === "string" && b.logoSrc.trim()
                      ? b.logoSrc
                      : "/brand/brand-placeholder.svg";
                  return (
                    <Link
                      key={b.id}
                      href={`/product/${b.slug}`}
                      className="w-[80px] shrink-0 snap-start"
                    >
                      <div className="w-[80px] h-[80px] rounded-2xl border bg-white grid place-items-center overflow-hidden">
                        <Image
                          src={logo}
                          alt={b?.name || "Brand"}
                          width={60}
                          height={60}
                          className="object-contain"
                          priority={i === 0}
                        />
                      </div>
                      <p className="text-center text-[#B6B6B6] text-xs mt-1">
                        {b?.name || "Brand"}
                      </p>
                    </Link>
                  );
                })}
            </div>
          )}
        </section>

        {/* Kategori */}
        <section className="px-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-[#D6336C]">Kategori</h2>
          </div>

          {cats === null ? (
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-2xl bg-gray-100 animate-pulse" />
                  <div className="w-12 h-3 rounded bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {cats.map((c, i) => (
                <Link
                  key={c.id}
                  href={`/product/${c.slug}`}
                  className="flex flex-col items-center justify-start"
                  title={c.name}
                >
                  <div className="w-15 h-15 rounded-2xl border bg-white grid place-items-center overflow-hidden">
                    <Image
                      src={c.iconSrc}
                      alt={c.name}
                      width={30}
                      height={30}
                      className="object-contain"
                      priority={i === 0}
                    />
                  </div>
                  <span className="mt-1 text-[11px] text-[#B6B6B6] text-center leading-tight max-w-[64px] truncate">
                    {c.name}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Grid Produk */}
        {filtered === null ? (
          <div className="px-4 py-6 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[210px] bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="px-4 py-10 text-center text-sm text-rose-600">
            Error: {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-600">
            Belum ada produk.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 px-4 pb-6">
            {filtered.map((p, i) => {
              const img = toPublicUrl("Public", p.image_url) || "/placeholder.png";
              const detailSlug = p.brand_slug || p.kategori || "all";
              const stock = Number.isFinite(p?.stock) ? p.stock : null;
              const soldOut = stock !== null && stock <= 0;

              return (
                <Link
                  key={p.id}
                  href={`/product/${detailSlug}/${p.id}`}
                  className="block bg-white rounded-xl shadow-sm border overflow-hidden"
                >
                  <div className="relative w-full h-[160px]">
                    <Image
                      src={img}
                      alt={p.nama}
                      fill
                      sizes="(max-width: 430px) 50vw, 200px"
                      className="object-cover"
                      priority={i === 0}
                    />
                    {soldOut && (
                      <div className="absolute inset-0 bg-black/40 grid place-items-center">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white text-gray-800">
                          Habis
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-2">
                    <p className="text-[13px] text-black line-clamp-2">{p.nama}</p>
                    {typeof p.price === "number" && (
                      <p className="text-[12px] text-[#D6336C] font-semibold mt-1">
                        {formatIDR(p.price)}
                      </p>
                    )}
                    {stock !== null && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        Stok: {stock > 0 ? stock : "Habis"}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <BottomNavigation />
      </main>
    </div>
  );
}