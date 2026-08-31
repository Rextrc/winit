import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "WinIt — play-money casino",
  description:
    "A fully simulated casino built as a portfolio project. Play-money only: no deposits, no withdrawals, no real-money path.",
};

export const viewport: Viewport = {
  themeColor: "#080a12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
