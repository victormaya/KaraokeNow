import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://karaokenow.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url:             BASE_URL,
      lastModified:    new Date(),
      changeFrequency: "daily",
      priority:        1,
    },
  ];
}
