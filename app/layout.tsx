import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./theme.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const title = "Goldie Listing Factory";
  const description = "Turn a folder of finished designs into organized Printify drafts—fast.";
  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: { icon: "/goldie-g.png", shortcut: "/goldie-g.png" },
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
