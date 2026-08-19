import { ImageResponse } from "next/og";

export const dynamic = "force-static";

const allowedSizes = new Set([192, 512]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: requestedSize } = await params;
  const parsedSize = Number(requestedSize);
  const size = allowedSizes.has(parsedSize) ? parsedSize : 512;

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
            border: `${Math.max(7, Math.round(size * 0.035))}px solid rgba(255,255,255,0.92)`,
            borderRadius: Math.round(size * 0.18),
            display: "flex",
            fontSize: Math.round(size * 0.31),
            fontWeight: 800,
            height: "72%",
            justifyContent: "center",
            letterSpacing: 0,
            width: "72%",
          }}
        >
          MP
        </div>
      </div>
    ),
    { height: size, width: size },
  );
}
