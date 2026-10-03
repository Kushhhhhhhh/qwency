import type { NextConfig } from "next";

// Icons and the manifest aren't content-hashed, so they get a day of fresh + a week of "serve it, then
// check in the background" rather than `immutable`. (Everything under /_next/static is already immutable.)
const ICON_CACHE = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      { source: "/icon.png", headers: ICON_CACHE },
      { source: "/apple-icon.png", headers: ICON_CACHE },
      { source: "/favicon.ico", headers: ICON_CACHE },
      { source: "/manifest.webmanifest", headers: ICON_CACHE },
      { source: "/pwa-:name.png", headers: ICON_CACHE },
      { source: "/og.png", headers: ICON_CACHE },
    ];
  },
};

export default nextConfig;
