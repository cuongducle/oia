import type { Metadata } from "next";
import { Be_Vietnam_Pro, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const bvpro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-bvpro",
});

const display = Instrument_Serif({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  title: "Oia — Open image agent",
  description: "Open-source, BYOK image agent with a layer-based Fabric editor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bvpro.variable} ${display.variable}`}>
      <body style={{ display: "flex", margin: 0, fontFamily: "var(--font-bvpro), Inter, system-ui, sans-serif" }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, overflowX: "clip" }}>{children}</div>
      </body>
    </html>
  );
}
