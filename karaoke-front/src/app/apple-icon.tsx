import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        borderRadius: 40,
        background: "linear-gradient(135deg, #c850c0 0%, #4158d0 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 100,
        lineHeight: "1",
      }}
    >
      🎤
    </div>,
    { ...size },
  );
}
