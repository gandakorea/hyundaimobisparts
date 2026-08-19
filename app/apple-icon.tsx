import { ImageResponse } from "next/og";

export const size = { height: 180, width: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#265f47",
          color: "#ffffff",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            border: "7px solid rgba(255,255,255,0.92)",
            borderRadius: 32,
            display: "flex",
            fontSize: 56,
            fontWeight: 800,
            height: 130,
            justifyContent: "center",
            letterSpacing: 0,
            width: 130,
          }}
        >
          MP
        </div>
      </div>
    ),
    size,
  );
}
