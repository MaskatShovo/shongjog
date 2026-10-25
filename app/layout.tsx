import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shongjog — Keep business moving",
  description: "Business continuity for the last mile. Offline orders, reliable reconciliation, and a live resilience lab.",
  manifest: '/manifest.webmanifest',
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
