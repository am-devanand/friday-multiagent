import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FRIDAY Command Center",
  description: "Jarvis ops-HUD — command center over multi-agent desk",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#030710] text-[#F8F4FF] antialiased">{children}</body>
    </html>
  );
}
