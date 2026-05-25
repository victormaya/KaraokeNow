import type { Metadata } from "next";
import { Suspense } from "react";
import DrumClient from "./DrumClient";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vokao.com.br";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ title?: string; channel?: string; thumbnail?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id }   = await params;
  const sp       = await searchParams;
  const title    = sp.title     ? decodeURIComponent(sp.title)     : "Play Along";
  const channel  = sp.channel   ? decodeURIComponent(sp.channel)   : "";
  const thumb    = sp.thumbnail ? decodeURIComponent(sp.thumbnail) : null;

  const desc = `Pratique bateria com "${title}"${channel ? ` de ${channel}` : ""} no VOKAO — bateria removida com IA.`;
  const canonicalUrl = `${BASE_URL}/drums/${id}`;

  return {
    title:       `🥁 ${title}`,
    description: desc,
    alternates:  { canonical: canonicalUrl },
    openGraph: {
      type:        "music.song",
      title:       `🥁 ${title}`,
      description: desc,
      url:         canonicalUrl,
      siteName:    "VOKAO",
      images:      thumb ? [{ url: thumb, width: 480, height: 360, alt: title }] : [],
    },
    twitter: {
      card:        "summary_large_image",
      title:       `🥁 ${title}`,
      description: desc,
      images:      thumb ? [thumb] : [],
    },
  };
}

export default async function DrumsPlayerPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp     = await searchParams;
  const title   = sp.title   ? decodeURIComponent(sp.title)   : "";
  const channel = sp.channel ? decodeURIComponent(sp.channel) : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type":    "MusicRecording",
    name:        title || "Play Along",
    url:         `${BASE_URL}/drums/${id}`,
    description: `Play Along de bateria de ${title || "música"}${channel ? ` — ${channel}` : ""} com bateria removida por IA no VOKAO`,
    ...(channel ? { byArtist: { "@type": "MusicGroup", name: channel } } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense>
        <DrumClient />
      </Suspense>
    </>
  );
}
