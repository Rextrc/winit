import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

const TITLE = "WinIt — play-money casino";
const DESCRIPTION =
  "A fully simulated casino and gambling-career sim. Play-money only: no deposits, no withdrawals, no real-money path.";

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
  appleWebApp: {
    capable: true,
    title: "WinIt",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#080a12",
  width: "device-width",
  initialScale: 1,
  // Lets the page paint under the notch and home indicator; every fixed
  // bar pads itself back out with env(safe-area-inset-*).
  viewportFit: "cover",
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
