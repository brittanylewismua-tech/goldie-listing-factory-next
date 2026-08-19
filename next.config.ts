import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
