import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "VOKAO",
    short_name:       "VOKAO",
    description:      "Karaokê instantâneo do YouTube com remoção de vocais por IA",
    start_url:        "/",
    display:          "standalone",
    background_color: "#0d0d19",
    theme_color:      "#c850c0",
    orientation:      "portrait-primary",
    categories:       ["entertainment", "music"],
    icons: [
      {
        src:     "/icon",
        sizes:   "32x32",
        type:    "image/png",
      },
      {
        src:     "/apple-icon",
        sizes:   "180x180",
        type:    "image/png",
        purpose: "maskable",
      },
    ],
  };
}
