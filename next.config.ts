import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off on purpose. With it on, Next.js keeps the last few
  // pages mounted but hidden to preserve their state, which for this app means
  // a typed password or a previous account's squad staying in memory after
  // navigation. Every screen here is client-rendered and fetches its own data,
  // so there is nothing for it to speed up.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
