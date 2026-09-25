import type { Metadata, Viewport } from "next";
import "tldraw/tldraw.css";
import "./chalkie.css";

export const metadata: Metadata = {
  title: "Chalkie — visual lessons, drawn live",
  description:
    "An interactive AI whiteboard teacher that researches, explains, and draws ideas as you learn.",
  icons: {
    icon: [
      { url: "/chalkie-icon.png", type: "image/png" },
      { url: "/favicon.png", type: "image/png" },
    ],
    shortcut: "/chalkie-icon.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17191c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
