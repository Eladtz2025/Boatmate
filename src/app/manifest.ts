import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Boatmate — ניהול סירה משותפת",
    short_name: "Boatmate",
    description:
      "ניהול הוצאות, מסמכים ולוח זמנים לסירה בבעלות משותפת — הכל במקום אחד.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#06121e",
    theme_color: "#0a1a2a",
    lang: "he",
    dir: "rtl",
    categories: ["productivity", "finance", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "הוצאה חדשה", short_name: "הוצאה", url: "/finances?new=expense" },
      { name: "העלאת מסמך", short_name: "מסמך", url: "/documents?new=document" },
      { name: "יומן", short_name: "יומן", url: "/calendar" },
    ],
  };
}
