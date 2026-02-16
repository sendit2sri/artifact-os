import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { Toaster } from "@/components/ui/sonner";
import { DevHmrRecoveryBanner } from "@/components/DevHmrRecoveryBanner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Artifact OS",
  description: "Research to Artifacts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isE2E = process.env.NEXT_PUBLIC_E2E_MODE === "true";
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-e2e={isE2E ? "true" : undefined}
      data-e2e-mode={isE2E ? "true" : "false"}
    >
      <body className={inter.className}>
        <Providers>{children}</Providers>
        {/* ✅ Fix: Move toast to top to avoid blocking bottom action bar */}
        <Toaster position="top-center" richColors />
        {/* ✅ STEP #12: Dev HMR recovery banner for ChunkLoadError */}
        <DevHmrRecoveryBanner />
      </body>
    </html>
  );
}