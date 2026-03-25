import type { MetadataRoute } from "next";

/** Web app manifest for Chrome / Android / Samsung Internet install + iOS “Add to Home Screen” hints. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FitBase",
    short_name: "FitBase",
    description: "Coaching platform for trainers and clients — check-ins, programs, and messaging.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#c9a84c",
    lang: "en",
    dir: "ltr",
    categories: ["fitness", "health", "lifestyle"],
    icons: [
      {
        src: "/img/Fitbase_logo_PWA2.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/img/Fitbase_logo_PWA2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/img/Fitbase_logo_PWA2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
