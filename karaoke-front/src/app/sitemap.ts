import type { MetadataRoute } from "next";

const BASE_URL    = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vokao.com.br";
const BACKEND_URL = process.env.BACKEND_URL          ?? "http://localhost:8000";

export const dynamic = "force-dynamic";

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
    {
      url:             `${BASE_URL}/drums`,
      lastModified:    new Date(),
      changeFrequency: "daily",
      priority:        0.9,
    },
  ];

  try {
    const [songsRes, drumsRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/cached-songs`,  { next: { revalidate: 3600 } }),
      fetch(`${BACKEND_URL}/api/cached-drums`,  { next: { revalidate: 3600 } }),
    ]);

    function buildRoutes(songs: CachedSong[], prefix: string): MetadataRoute.Sitemap {
      return songs
        .filter(s => s.video_id && s.title)
        .map(s => {
          const params = new URLSearchParams({
            title:     s.title,
            channel:   s.channel   || "",
            thumbnail: s.thumbnail || `https://img.youtube.com/vi/${s.video_id}/hqdefault.jpg`,
          });
          // XML <loc> requires & to be escaped as &amp;
          const url = `${BASE_URL}/${prefix}/${s.video_id}?${params.toString()}`.replace(/&/g, "&amp;");
          return {
            url,
            lastModified:    s.processed_at ? new Date(s.processed_at * 1000) : new Date(),
            changeFrequency: "monthly" as const,
            priority:        0.7,
          };
        });
    }

    const songRoutes  = songsRes.ok ? buildRoutes((await songsRes.json() as { songs: CachedSong[] }).songs, "song")  : [];
    const drumsRoutes = drumsRes.ok ? buildRoutes((await drumsRes.json() as { songs: CachedSong[] }).songs, "drums") : [];

    return [...staticRoutes, ...songRoutes, ...drumsRoutes];
  } catch {
    return staticRoutes;
  }
}
