import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/home";
  const popup = url.searchParams.get("popup") === "1";

  // penting: origin opener untuk postMessage (kalau gak ada, pakai origin callback)
  const openerOrigin = url.searchParams.get("openerOrigin") || url.origin;

  if (!code) {
    if (popup) {
      const html = `<!doctype html>
<html><body>
<script>
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "supabase-oauth", success: false, error: "Kode OAuth tidak ditemukan." }, ${JSON.stringify(
        openerOrigin
      )});
    }
  } catch (e) {}
  window.close();
</script>
Kode OAuth tidak ditemukan.
</body></html>`;
      return new Response(html, { headers: { "content-type": "text/html" } });
    }

    return NextResponse.redirect(new URL(`/login?error=missing_code`, url.origin));
  }

  const supabase = supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    if (popup) {
      const html = `<!doctype html>
<html><body>
<script>
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "supabase-oauth", success: false, error: ${JSON.stringify(
        error.message
      )} }, ${JSON.stringify(openerOrigin)});
    }
  } catch (e) {}
  window.close();
</script>
Login gagal: ${error.message}
</body></html>`;
      return new Response(html, { headers: { "content-type": "text/html" } });
    }

    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  // sukses → cookie sudah ke-set oleh createServerClient
  if (popup) {
    const html = `<!doctype html>
<html><body>
<script>
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "supabase-oauth", success: true, next: ${JSON.stringify(
        next
      )} }, ${JSON.stringify(openerOrigin)});
    }
  } catch (e) {}
  window.close();
</script>
Sukses. Menutup popup...
</body></html>`;
    return new Response(html, { headers: { "content-type": "text/html" } });
  }

  return NextResponse.redirect(new URL(next, url.origin));
}