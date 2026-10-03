import { Header } from "@/components/Header";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Perpetua — fee-rights exchange",
  description: "Price, securitize and trade the fee stream of a locked Meteora DAMM v2 position.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-slate-100">
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-slate-500">
            Unaudited hackathon software. Not legal, tax or investment advice.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
