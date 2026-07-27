import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Boatmate — ניהול סירה משותפת",
  description:
    "ניהול הוצאות, מסמכים ולוח זמנים לסירה בבעלות משותפת — הכל במקום אחד.",
  applicationName: "Boatmate",
  appleWebApp: {
    capable: true,
    title: "Boatmate",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a1a2a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
