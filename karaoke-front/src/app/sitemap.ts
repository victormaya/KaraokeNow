import type { MetadataRoute } from "next";

const BASE_URL    = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vokao.com.br";
const BACKEND_URL = process.env.BACKEND_URL          ?? "http://localhost:8000";

export const revalidate = 3600; // rebuild sitemap every hour

interface CachedSong {
  video_id:     string;
  title:        string;
  channel:      string;
  thumbnail:    string;
  processed_at: number;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url:             BASE_URL,
      lastModified:    new Date(),
      changeFrequency: "daily",
      priority:        1,
    },
  ];

  try {
    const res = await fetch(`${BACKEND_URL}/api/cached-songs`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return staticRoutes;

    const data = await res.json() as { songs: CachedSong[] };
    const songRoutes: MetadataRoute.Sitemap = data.songs
      .filter(s => s.video_id && s.title)
      .map(s => {
        const params = new URLSearchParams({
          title:     s.title,
          channel:   s.channel   || "",
          thumbnail: s.thumbnail || `https://img.youtube.com/vi/${s.video_id}/hqdefault.jpg`,
        });
        return {
          url:             `${BASE_URL}/song/${s.video_id}?${params.toString()}`,
          lastModified:    s.processed_at ? new Date(s.processed_at * 1000) : new Date(),
          changeFrequency: "monthly" as const,
          priority:        0.7,
        };
      });

    return [...staticRoutes, ...songRoutes];
  } catch {
    return staticRoutes;
  }
}
