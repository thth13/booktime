import type { Metadata } from "next";
import "./globals.css";
import favicon16 from "./images/favicon_16x16.png";
import favicon32 from "./images/favicon_32x32.png";
import favicon192 from "./images/favicon_192x192.png";
import ogImage from "./images/og-image.png";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "BookTime",
  description: "A simple reading time tracker for books.",
  icons: {
    icon: [
      { url: favicon16.src, sizes: "16x16", type: "image/png" },
      { url: favicon32.src, sizes: "32x32", type: "image/png" },
      { url: favicon192.src, sizes: "192x192", type: "image/png" },
    ],
    shortcut: favicon32.src,
  },
  openGraph: {
    title: "BookTime",
    description: "A simple reading time tracker for books.",
    images: [
      {
        url: ogImage.src,
        width: 1200,
        height: 630,
        alt: "BookTime - simple reading time tracker for books",
      },
    ],
    siteName: "BookTime",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BookTime",
    description: "A simple reading time tracker for books.",
    images: [ogImage.src],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
