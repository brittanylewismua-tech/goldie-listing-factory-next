import type { NextConfig } from "next";

/* The development editor fixture lives in a `page.dev.tsx` file. That extension
   is only treated as a route outside production, so in a production build the
   directory contains no page at all and the route does not exist - rather than
   existing and refusing, which still shipped its code in the client bundle. */
const devOnlyRoutes = process.env.NODE_ENV !== "production";

/*
  D1715 · THE DEPLOYED SITE SENT NO SECURITY HEADERS AT ALL.

  Measured on production: no CSP, no frame protection, no referrer policy, no
  nosniff, no HSTS. That matters more here than it would elsewhere, because
  @supabase/ssr writes the session to a cookie its browser client has to read,
  so the session is readable by any script that runs on the page. Without a
  CSP the only thing standing between an injected script and the session is
  that no injection exists — which is a fact about today.

  The headers below are the ones that cannot break a working page.

  frame-ancestors 'none' is the one with immediate teeth: until now any site
  could put this app in an iframe and sit an invisible layer over it, and
  every destructive control here is one click.

  script-src is deliberately NOT set yet. The root layout ships an inline
  error beacon, and Next ships inline bootstrap, so a real script-src needs a
  nonce threaded through both. Shipping 'unsafe-inline' instead would be a
  header that looks like a CSP and defends nothing. That work is named in
  PROGRESS.md rather than faked here.
*/
const SECURITY_HEADERS = [
  /* Nobody may frame this. */
  { key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; "
      + "form-action 'self'" },
  /* The older header, for anything that does not read the directive above. */
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  /* A path can carry a listing id or a shop name; neither should travel to
     another site in a Referer. */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
      + "interest-cohort=()" },
  { key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains" },
  /* An isolated browsing context, so a window this app opens cannot reach
     back into it. */
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  pageExtensions: devOnlyRoutes
    ? ["dev.tsx", "tsx", "ts", "jsx", "js"]
    : ["tsx", "ts", "jsx", "js"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
