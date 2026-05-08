import type { Metadata } from "next";
import { Suspense } from "react";
import SongClient from "./SongClient";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ title?: string; channel?: string; thumbnail?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const title   = sp.title   ? decodeURIComponent(sp.title)   : "Karaokê";
  const channel = sp.channel ? decodeURIComponent(sp.channel) : "";
  const thumb   = sp.thumbnail ?? null;

  const desc = `Cante "${title}"${channel ? ` de ${channel}` : ""} no KaraokeNow. Vocais removidos com IA — grátis e instantâneo!`;

  return {
    title,
    description: desc,
    openGraph: {
      title: `🎤 ${title}`,
      description: desc,
      images: thumb ? [{ url: thumb, width: 480, height: 360, alt: title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `🎤 ${title}`,
      description: desc,
      images: thumb ? [thumb] : [],
    },
  };
}

export default function SongPage() {
  return (
    <Suspense>
      <SongClient />
    </Suspense>
  );
}
