import type { MetadataRoute } from "next";

// Lets people add Accountably to their home screen. On iPhone that is also
// what makes notifications possible.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Accountably",
    short_name: "Accountably",
    description: "Lock in together. Weekly goals with a few friends.",
    start_url: "/squad",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f6f3",
    theme_color: "#f7f6f3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
