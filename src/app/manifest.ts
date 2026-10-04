import type { MetadataRoute } from "next";

// Lets a phone install Qwency to the home screen and open it like an app: no browser bar, its own
// icon and colors. (Served at /manifest.webmanifest; the auth proxy already leaves it public.)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Qwency",
    short_name: "Qwency",
    description: "Tap in your day and see the patterns behind it.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FDF8E2",
    theme_color: "#FDF8E2",
    icons: [
      { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // artwork inset in the safe area, so a round or squircle crop doesn't cut into it
      { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android: Share -> Qwency from a shop's app or a web page, to start a Shop item (iPhone doesn't support this)
    share_target: { action: "/shop/add", method: "GET", params: { title: "title", text: "text", url: "url" } },
  };
}
