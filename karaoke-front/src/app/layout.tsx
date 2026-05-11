import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClientLayout from "./ClientLayout";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vokao.com.br";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d0d19",
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "VOKAO — Karaokê Instantâneo do YouTube",
    template: "%s | VOKAO",
  },
  description:
    "Busque qualquer música do YouTube, remova os vocais com IA em segundos e cante como nunca. Grátis, sem download, sem cadastro.",
  keywords: [
    "karaoke online",
    "karaokê grátis",
    "remover vocal música",
    "karaoke youtube",
    "karaokê sem vocal",
    "karaoke brasil",
    "cantar online",
    "instrumental youtube",
    "karaoke sertanejo",
    "karaoke funk",
    "karaoke pagode",
    "remover voz da música",
    "karaoke forró",
    "karaoke MPB",
    "karaoke rap",
  ],
  authors:   [{ name: "VOKAO" }],
  creator:   "VOKAO",
  publisher: "VOKAO",
  robots: {
    index:  true,
    follow: true,
    googleBot: {
      index:  true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet":       -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type:        "website",
    locale:      "pt_BR",
    url:         BASE_URL,
    siteName:    "VOKAO",
    title:       "VOKAO — Karaokê Instantâneo do YouTube",
    description: "Busque qualquer música, remova os vocais com IA e cante. Grátis, sem download, sem cadastro.",
    images: [
      {
        url:    "/opengraph-image",
        width:  1200,
        height: 630,
        alt:    "VOKAO — Karaokê Instantâneo do YouTube",
        type:   "image/png",
      },
    ],
  },
  twitter: {
    card:        "summary_large_image",
    title:       "VOKAO — Karaokê Instantâneo do YouTube",
    description: "Karaokê instantâneo do YouTube com remoção de vocais por IA. Grátis!",
    images:      ["/opengraph-image"],
    creator:     "@vokao",
    site:        "@vokao",
  },
  alternates: {
    canonical: BASE_URL,
  },
  manifest: "/manifest.json",
  category: "entertainment",
  verification: {
    google: "wyz7Zcf-lsxTtrQnBCsTY0hnnlTyAT_Qkl-6L-WI0zQ",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type":    "WebSite",
  name:        "VOKAO",
  url:         BASE_URL,
  description: "Karaokê instantâneo do YouTube com remoção de vocais por IA",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type":       "EntryPoint",
      urlTemplate:   `${BASE_URL}/?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6341274812635744"
          crossOrigin="anonymous"
        />
      </head>
      <body><ClientLayout>{children}</ClientLayout></body>
    </html>
  );
}
