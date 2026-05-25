import type { Metadata } from "next";
import { Suspense } from "react";
import DrumsClient from "./DrumsClient";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vokao.com.br";

export const metadata: Metadata = {
  title: "🥁 Bateria Play Along — Remova a bateria com IA",
  description:
    "Remova a bateria de qualquer música do YouTube com inteligência artificial e pratique no seu ritmo. Controle de velocidade e BPM. Grátis, sem cadastro.",
  alternates: { canonical: `${BASE_URL}/drums` },
  keywords: [
    "drumless",
    "drumless track",
    "drumless play along",
    "play along bateria",
    "play along de bateria",
    "remover bateria música",
    "remover bateria youtube",
    "pista sem bateria",
    "backing track bateria",
    "backing track drums",
    "bateria removida IA",
    "praticar bateria online",
    "praticar bateria youtube",
    "bateria removida grátis",
  ],
  openGraph: {
    type:        "website",
    title:       "🥁 Bateria Play Along — VOKAO",
    description: "Remova a bateria de qualquer música do YouTube com IA e pratique no seu ritmo.",
    url:         `${BASE_URL}/drums`,
    siteName:    "VOKAO",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "VOKAO Bateria Play Along" }],
  },
  twitter: {
    card:        "summary_large_image",
    title:       "🥁 Bateria Play Along — VOKAO",
    description: "Remova a bateria de qualquer música com IA. Grátis!",
    images:      ["/opengraph-image"],
  },
};

export default function DrumsPage() {
  return <Suspense><DrumsClient /></Suspense>;
}
