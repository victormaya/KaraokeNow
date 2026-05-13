import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    <div
      style={{
        width: 192,
        height: 192,
        background: "linear-gradient(135deg, #c850c0 0%, #4158d0 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 110,
        lineHeight: "1",
      }}
    >
      🎤
    </div>,
    { width: 192, height: 192 },
  );
}
