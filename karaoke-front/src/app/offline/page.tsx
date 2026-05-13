"use client";

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 64 }}>🎤</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
        Você está offline
      </h1>
      <p style={{ color: "var(--text-secondary)", margin: 0, maxWidth: 320 }}>
        Verifique sua conexão com a internet e tente novamente.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 8,
          padding: "12px 28px",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
