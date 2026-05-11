import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const tags = ["🎤 Cante junto", "🤖 IA remove vocais", "⚡ Instantâneo", "🆓 Grátis"];

export default function OGImage() {
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: "linear-gradient(135deg, #0d0d19 0%, #1a1535 50%, #0d0d19 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        gap: 28,
      }}
    >
      {/* Logo badge */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 30,
          background: "linear-gradient(135deg, #c850c0 0%, #4158d0 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 64,
          lineHeight: "1",
          boxShadow: "0 0 80px rgba(200, 80, 192, 0.55)",
        }}
      >
        🎤
      </div>

      {/* App name */}
      <div
        style={{
          fontSize: 76,
          fontWeight: 800,
          color: "#ffffff",
          letterSpacing: "-2px",
          display: "flex",
        }}
      >
        VOKAO
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 28,
          color: "#9090b8",
          textAlign: "center",
          maxWidth: 780,
          lineHeight: "1.4",
          display: "flex",
        }}
      >
        Busque qualquer música do YouTube e remova os vocais com IA em segundos
      </div>

      {/* Pill tags */}
      <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
        {tags.map(tag => (
          <div
            key={tag}
            style={{
              padding: "10px 22px",
              borderRadius: 99,
              border: "1px solid rgba(200, 80, 192, 0.4)",
              background: "rgba(200, 80, 192, 0.12)",
              color: "#d090e8",
              fontSize: 20,
              display: "flex",
            }}
          >
            {tag}
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  );
}
