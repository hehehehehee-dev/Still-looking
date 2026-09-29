import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-body", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif-heading", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Still Looking",
  description:
    "Age-progressed estimates of long-term missing children, guided by family photos. Photos are never stored.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-border">
          <nav className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <Link href="/" className="font-serif text-xl font-semibold">
              Still Looking
            </Link>
            <div className="flex gap-5 text-sm text-muted">
              <Link href="/create" className="hover:text-foreground">
                Create
              </Link>
              <Link href="/accuracy" className="hover:text-foreground">
                Accuracy
              </Link>
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">{children}</main>

        <footer className="border-t border-border">
          <div className="mx-auto max-w-4xl space-y-2 px-4 py-6 text-xs leading-relaxed text-muted sm:px-6">
            <p>
              <strong className="text-foreground">This is an estimate, not identification.</strong> If a
              child is missing, contact your local police and, in the US, the National Center for Missing
              &amp; Exploited Children (NCMEC) at 1-800-THE-LOST.
            </p>
            <p>
              Still Looking keeps no records and does not search for anyone. Photos are used only to create
              images for the person who uploaded them, then deleted.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
