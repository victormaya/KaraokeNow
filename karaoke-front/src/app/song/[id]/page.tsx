import type { Metadata } from "next";
import { Suspense } from "react";
import SongClient from "./SongClient";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vokao.com.br";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ title?: string; channel?: string; thumbnail?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id }   = await params;
  const sp       = await searchParams;
  const title    = sp.title   ? decodeURIComponent(sp.title)   : "Karaokê";
  const channel  = sp.channel ? decodeURIComponent(sp.channel) : "";
  const thumb    = sp.thumbnail ?? null;

  const desc = `Cante "${title}"${channel ? ` de ${channel}` : ""} no VOKAO. Vocais removidos com IA — grátis e instantâneo!`;

  const canonicalParams = new URLSearchParams({ title });
  if (channel)  canonicalParams.set("channel",   channel);
  if (thumb)    canonicalParams.set("thumbnail", thumb);
  const canonicalUrl = `${BASE_URL}/song/${id}?${canonicalParams.toString()}`;

  return {
    title,
    description: desc,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type:        "music.song",
      title:       `🎤 ${title}`,
      description: desc,
      url:         canonicalUrl,
      siteName:    "VOKAO",
      images:      thumb ? [{ url: thumb, width: 480, height: 360, alt: title }] : [],
    },
    twitter: {
      card:        "summary_large_image",
      title:       `🎤 ${title}`,
      description: desc,
      images:      thumb ? [thumb] : [],
    },
  };
}

export default async function SongPage({ params, searchParams }: Props) {
  const { id }  = await params;
  const sp      = await searchParams;
  const title   = sp.title   ? decodeURIComponent(sp.title)   : "";
  const channel = sp.channel ? decodeURIComponent(sp.channel) : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type":    "MusicRecording",
    name:        title || "Karaokê",
    url:         `${BASE_URL}/song/${id}`,
    description: `Karaokê de ${title || "música"}${channel ? ` — ${channel}` : ""} com vocais removidos por IA no VOKAO`,
    ...(channel ? { byArtist: { "@type": "MusicGroup", name: channel } } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense>
        <SongClient />
      </Suspense>
    </>
  );
}
