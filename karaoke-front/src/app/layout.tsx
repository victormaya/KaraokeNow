import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KaraokeNow — Karaokê Instantâneo do YouTube",
  description:
    "Busque qualquer música do YouTube e remova os vocais em segundos para um karaokê perfeito.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
