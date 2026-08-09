import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PartInfo = {
  price: string;
};

type Source = {
  title?: string;
  url?: string;
};

type LookupPayload = {
  found?: boolean;
  price?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  message?: string | null;
};

type MobisPriceResult = {
  price: string;
  partNameKo?: string;
  partNameEn?: string;
  maker: "H" | "K";
  vehicleType: "P" | "C";
  sourceTitle: string;
  sourceUrl: string;
};

const mobisPriceCache = new Map<string, MobisPriceResult>();
let mobisLookupQueue: Promise<void> = Promise.resolve();

const partCatalog: Record<string, PartInfo> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePartNumber(value: unknown) {
  return asString(value)?.toUpperCase() ?? "";
}

function mobisSearchPartNumber(partNumber: string) {
  return partNumber.replace(/[^A-Z0-9]/g, "");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function scheduleMobisLookup<T>(lookup: () => Promise<T>) {
  const run = mobisLookupQueue.then(async () => {
    await wait(250);
    return lookup();
  });

  mobisLookupQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

function normalizeKrw(price: string) {
  const cleaned = price
    .replace(/[₩￦]/g, "")
    .replace(/\bKRW\b/gi, "")
    .replace(/\s+/g, "")
    .trim();
  return cleaned.includes("원") ? cleaned : `${cleaned}원`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function textFromHtml(value: string) {
  return decodeHtml(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function cookieHeaderFrom(setCookie: string | null) {
  if (!setCookie) return "";

  return setCookie
    .split(/,(?=\s*[^;,]+=)/)
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function parseMobisPrice(
  html: string,
): Omit<MobisPriceResult, "maker" | "vehicleType" | "sourceTitle" | "sourceUrl"> | null {
  if (/id="sessionExpired"[^>]*value="Y"/i.test(html)) return null;
  if (/id="black"[^>]*value="Y"/i.test(html)) return null;
  if (/id="rateLimited"[^>]*value="Y"/i.test(html)) return null;
  if (/class="nodata"/i.test(html)) return null;

  const values = new Map<string, string>();

  for (const match of html.matchAll(
    /<span class="t-th"[\s\S]*?>([\s\S]*?)<\/span>\s*<span class="t-td"[\s\S]*?>([\s\S]*?)<\/span>/gi,
  )) {
    const label = textFromHtml(match[1] ?? "");
    const value = textFromHtml(match[2] ?? "");
    if (label && value) values.set(label, value);
  }

  const priceEntry = [...values.entries()].find(([label]) => label.startsWith("가격"));
  const price = priceEntry?.[1];

  if (!price) return null;

  return {
    price: normalizeKrw(price),
    partNameKo: values.get("한글 부품명"),
    partNameEn: values.get("영문 부품명"),
  };
}

async function fetchMobisPriceFor(
  searchNumber: string,
  maker: "H" | "K",
  vehicleType: "P" | "C",
): Promise<MobisPriceResult | null> {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";
  const sourceUrl = "https://www.mobis-as.com/simple_search_part.do";
  const initialResponse = await fetch(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": userAgent,
    },
    cache: "no-store",
  });
  const cookie = cookieHeaderFrom(initialResponse.headers.get("set-cookie"));

  const searchUrl = new URL("https://www.mobis-as.com/simple_search_partLoad_v2.do");
  searchUrl.searchParams.set("pageIndex", "1");
  searchUrl.searchParams.set("hkgb", maker);
  searchUrl.searchParams.set("vtyp", vehicleType);
  searchUrl.searchParams.set("catSeq", "");
  searchUrl.searchParams.set("srchType", "ptno");
  searchUrl.searchParams.set("inText", searchNumber);

  const response = await fetch(searchUrl, {
    headers: {
      Accept: "text/html,*/*;q=0.8",
      Referer: sourceUrl,
      "User-Agent": userAgent,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    cache: "no-store",
  });
  const html = await response.text();
  const parsed = parseMobisPrice(html);

  if (!parsed) return null;

  return {
    ...parsed,
    maker,
    vehicleType,
    sourceTitle: "현대모비스 부품 가격 검색",
    sourceUrl,
  };
}

async function fetchMobisPrice(partNumber: string): Promise<MobisPriceResult | null> {
  const searchNumber = mobisSearchPartNumber(partNumber);
  if (!searchNumber) return null;

  const cachedPrice = mobisPriceCache.get(searchNumber);
  if (cachedPrice) return cachedPrice;

  const attempts: Array<{ maker: "H" | "K"; vehicleType: "P" | "C" }> = [
    { maker: "K", vehicleType: "P" },
    { maker: "H", vehicleType: "P" },
    { maker: "K", vehicleType: "C" },
    { maker: "H", vehicleType: "C" },
  ];

  for (const attempt of attempts) {
    const result = await scheduleMobisLookup(() =>
      fetchMobisPriceFor(searchNumber, attempt.maker, attempt.vehicleType),
    );
    if (result) {
      mobisPriceCache.set(searchNumber, result);
      return result;
    }
  }

  return null;
}

function extractResponseText(data: unknown) {
  if (!isRecord(data)) return "";

  const directText = asString(data.output_text);
  if (directText) return directText;

  const output = Array.isArray(data.output) ? data.output : [];
  const texts: string[] = [];

  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = Array.isArray(item.content) ? item.content : [];

    for (const part of content) {
      if (!isRecord(part)) continue;
      const text = asString(part.text);
      if (text) texts.push(text);
    }
  }

  return texts.join("\n");
}

function addSource(sources: Source[], source: Source) {
  if (!source.url || sources.some((existing) => existing.url === source.url)) return;
  sources.push({
    title: source.title || source.url,
    url: source.url,
  });
}

function collectSources(data: unknown) {
  if (!isRecord(data)) return [];

  const output = Array.isArray(data.output) ? data.output : [];
  const sources: Source[] = [];

  for (const item of output) {
    if (!isRecord(item)) continue;

    if (isRecord(item.action) && Array.isArray(item.action.sources)) {
      for (const source of item.action.sources) {
        if (!isRecord(source)) continue;
        addSource(sources, {
          title: asString(source.title) ?? undefined,
          url: asString(source.url) ?? undefined,
        });
      }
    }

    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!isRecord(part) || !Array.isArray(part.annotations)) continue;

      for (const annotation of part.annotations) {
        if (!isRecord(annotation)) continue;
        addSource(sources, {
          title: asString(annotation.title) ?? undefined,
          url: asString(annotation.url) ?? undefined,
        });
      }
    }
  }

  return sources;
}

function parseLookupPayload(text: string): LookupPayload | null {
  const fencedJson = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const bareJson = text.match(/\{[\s\S]*\}/)?.[0];
  const candidate = fencedJson ?? bareJson;

  if (!candidate) return null;

  try {
    const parsed: unknown = JSON.parse(candidate);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildLookupPrompt(partNumber: string) {
  return [
    `Find reliable public web information for the Korean price of this Hyundai Mobis genuine part number: ${partNumber}.`,
    "Prefer Hyundai Mobis official Korean prices when available.",
    "Return only JSON. Do not include markdown.",
    "Use Korean won for price and include the suffix 원.",
    "If the exact part number price cannot be confirmed, do not guess.",
    JSON.stringify({
      found: true,
      price: "예: 18,400원",
      sourceTitle: "source page title",
      sourceUrl: "https://example.com/source",
      notes: "brief confidence note in Korean",
    }),
  ].join("\n");
}

export async function POST(request: Request) {
  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const partNumber = isRecord(body) ? normalizePartNumber(body.partNumber) : "";

  if (!partNumber) {
    return NextResponse.json(
      { found: false, message: "파츠넘버를 입력해 주세요." },
      { status: 400 },
    );
  }

  const savedInfo = partCatalog[partNumber];
  if (savedInfo) {
    return NextResponse.json({
      found: true,
      partNumber,
      ...savedInfo,
      message: "저장된 파츠 자료에서 입력했습니다.",
    });
  }

  let mobisPrice: MobisPriceResult | null = null;

  try {
    mobisPrice = await fetchMobisPrice(partNumber);
  } catch {
    mobisPrice = null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (mobisPrice) {
      return NextResponse.json({
        found: true,
        partNumber,
        price: mobisPrice.price,
        sourceTitle: mobisPrice.sourceTitle,
        sourceUrl: mobisPrice.sourceUrl,
        message: [
          "현대모비스 공식 가격을 입력했습니다.",
          mobisPrice.partNameKo ? `부품명: ${mobisPrice.partNameKo}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }

    return NextResponse.json({
      found: false,
      partNumber,
      needsApiKey: true,
      message: "현대모비스 공식 가격을 찾지 못했습니다. 추가 웹검색을 사용하려면 OPENAI_API_KEY 설정이 필요합니다.",
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_PART_LOOKUP_MODEL ?? "gpt-5.6",
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        input: buildLookupPrompt(partNumber),
        max_output_tokens: 900,
      }),
      cache: "no-store",
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          found: false,
          partNumber,
          message: "웹검색 API 응답을 받지 못했습니다. API 키와 모델 설정을 확인해 주세요.",
        },
        { status: 502 },
      );
    }

    const sources = collectSources(data);
    const payload = parseLookupPayload(extractResponseText(data));
    const fallbackSource = sources[0];

    if (!payload) {
      return NextResponse.json({
        found: false,
        partNumber,
        sourceTitle: fallbackSource?.title,
        sourceUrl: fallbackSource?.url,
        message: "웹검색 결과를 표 형식으로 정리하지 못했습니다.",
      });
    }

    const price = asString(payload.price);
    const sourceTitle = asString(payload.sourceTitle) ?? fallbackSource?.title;
    const sourceUrl = asString(payload.sourceUrl) ?? fallbackSource?.url;
    const finalPrice = mobisPrice?.price ?? (price ? normalizeKrw(price) : null);

    if (payload.found !== true || !finalPrice) {
      if (mobisPrice) {
        return NextResponse.json({
          found: true,
          partNumber,
          price: mobisPrice.price,
          sourceTitle: mobisPrice.sourceTitle,
          sourceUrl: mobisPrice.sourceUrl,
          message:
            asString(payload.message) ??
            asString(payload.notes) ??
            "현대모비스 공식 가격을 입력했습니다.",
        });
      }

      return NextResponse.json({
        found: false,
        partNumber,
        sourceTitle,
          sourceUrl,
          message:
            asString(payload.message) ??
            asString(payload.notes) ??
          "웹에서 신뢰할 수 있는 가격을 찾지 못했습니다.",
      });
    }

    return NextResponse.json({
      found: true,
      partNumber,
      price: finalPrice,
      sourceTitle,
      sourceUrl,
      message: asString(payload.notes) ?? "웹검색으로 입력했습니다.",
    });
  } catch {
    return NextResponse.json(
      {
        found: false,
        partNumber,
        message: "웹검색 중 문제가 생겼습니다. 잠시 후 다시 확인해 주세요.",
      },
      { status: 502 },
    );
  }
}
