import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mihu’s Corner",
  referrer: "no-referrer",
  description: "Góc nhỏ của Mihu — lịch hẹn, chi tiêu và những điều đáng nhớ.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Mihu’s Corner", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-180.png",
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#fffcf2' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
