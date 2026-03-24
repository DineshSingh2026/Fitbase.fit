import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegister } from "./pwa-register";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0f0f0f"
};

export const metadata: Metadata = {
  title: "FitBase",
  description: "FitBase — coaching platform for trainers and clients",
  applicationName: "FitBase",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FitBase"
  },
  icons: {
    icon: [
      { url: "/img/Fitbase_logo_PWA2.png", sizes: "192x192", type: "image/png" },
      { url: "/img/Fitbase_logo_PWA2.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/img/Fitbase_logo_PWA2.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
