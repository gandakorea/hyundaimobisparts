import { ImageResponse } from "next/og";

export const size = { height: 512, width: 512 };
export const contentType = "image/png";

export default function Icon() {
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
            border: "18px solid rgba(255,255,255,0.92)",
            borderRadius: 92,
            display: "flex",
            fontSize: 160,
            fontWeight: 800,
            height: 368,
            justifyContent: "center",
            letterSpacing: 0,
            width: 368,
          }}
        >
          MP
        </div>
      </div>
    ),
    size,
  );
}
