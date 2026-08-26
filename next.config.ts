import type { NextConfig } from "next";

/* The development editor fixture lives in a `page.dev.tsx` file. That extension
   is only treated as a route outside production, so in a production build the
   directory contains no page at all and the route does not exist - rather than
   existing and refusing, which still shipped its code in the client bundle. */
const devOnlyRoutes = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  pageExtensions: devOnlyRoutes
    ? ["dev.tsx", "tsx", "ts", "jsx", "js"]
    : ["tsx", "ts", "jsx", "js"],
  async redirects() {
    return [
      {
        source: "/",
        destination: "/listing-factory",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
