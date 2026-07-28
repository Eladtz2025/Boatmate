import type { NextConfig } from "next";

/**
 * Host allowed to serve optimised images (Supabase Storage signed URLs).
 *
 * Derived from the env var when it parses, but never at the cost of the build:
 * a missing or malformed NEXT_PUBLIC_SUPABASE_URL used to throw here and fail
 * `next build` outright, which is a poor trade for one config value. Falls back
 * to any Supabase project host — still narrow, since these URLs are only ever
 * produced by our own signed-URL calls.
 */
function supabaseImageHost(): string {
  // The BOM strip mirrors src/lib/supabase/env.ts — a copy-pasted value carrying
  // an invisible U+FEFF is exactly what broke this build once already.
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^\uFEFF/, "").trim();
  if (raw) {
    try {
      return new URL(raw).hostname;
    } catch {
      console.warn(
        "[next.config] NEXT_PUBLIC_SUPABASE_URL is not a valid URL; " +
          "falling back to *.supabase.co for image optimisation.",
      );
    }
  }
  return "*.supabase.co";
}

const supabaseHost = supabaseImageHost();

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home directory makes Turbopack guess the
  // wrong workspace root; pin it to this project.
  turbopack: { root: import.meta.dirname },
  images: {
    // Next 16 requires the allowlist: any quality not named here is refused by
    // the optimiser. 75 is the default everywhere; 90 is the full-screen photo
    // viewer, which exists precisely to show the photo at its best.
    qualities: [75, 90],
    // Storage objects are served through short-lived signed URLs.
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
