import type { Metadata } from "next";
import { Suspense } from "react";
import DrumClient from "./DrumClient";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vokao.com.br";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ title?: string; channel?: string; thumbnail?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id }  = await params;
  const sp      = await searchParams;
  const title   = sp.title   ? decodeURIComponent(sp.title)   : "Play Along";
  const channel = sp.channel ? decodeURIComponent(sp.channel) : "";

  const desc = `Pratique bateria com "${title}"${channel ? ` de ${channel}` : ""} no VOKAO — bateria removida com IA.`;
  const canonicalUrl = `${BASE_URL}/drums/${id}`;

  return {
    title: `🥁 ${title}`,
    description: desc,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `🥁 ${title}`,
      description: desc,
      url: canonicalUrl,
      siteName: "VOKAO",
    },
  };
}

export default async function DrumsPlayerPage({ params, searchParams }: Props) {
  const { id } = await params;
  void id;
  void searchParams;

  return (
    <Suspense>
      <DrumClient />
    </Suspense>
  );
}
