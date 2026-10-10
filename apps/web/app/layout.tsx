import { Header } from "@/components/Header";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Perpetua — the fee-rights exchange",
  description:
    "Turn the trading fees a locked Meteora pool earns into priced, tradable shares you can buy, sell and claim.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
