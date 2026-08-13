import type { Metadata } from "next";
import { Geist, Noto_Kufi_Arabic } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const notoArabic = Noto_Kufi_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "MASRI AI — Speak Egyptian Arabic",
    description: "A voice-first Egyptian Arabic conversation coach for real daily life.",
    openGraph: {
      title: "MASRI AI",
      description: "Speak Egyptian. For real.",
      type: "website",
      images: [{ url: image, width: 1728, height: 907, alt: "MASRI AI voice coach" }],
    },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${notoArabic.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
