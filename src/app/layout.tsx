import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

const TITLE = "WinIt — play-money casino";
const DESCRIPTION =
  "A fully simulated casino and gambling-career sim. Play-money only: no deposits, no withdrawals, no real-money path — every game publishes its real return-to-player.";

export const metadata: Metadata = {
  title: { default: TITLE, template: "%s · WinIt" },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "WinIt",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
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
