import { Header } from "@/components/Header";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Perpetua — own a slice of a pool's fees",
  description:
    "Perpetua turns the trading fees a locked Meteora pool earns into shares you can price and buy.",
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
