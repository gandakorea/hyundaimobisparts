"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type PartInfo = {
  price: string;
};

type OrderInfo = {
  date: string;
  dealer: string;
  dealerPhone: string;
  dealerFax: string;
  dealerAddress: string;
};

type OrderRow = {
  id: string;
  partNumber: string;
  quantity: number;
  unitPrice: string;
  price: string;
  status: "found" | "missing" | "checking" | "empty";
};

type SavedOrderRow = Partial<OrderRow & OrderInfo>;

type DealerSection = Omit<OrderInfo, "date"> & {
  id: string;
  rows: OrderRow[];
};

type SavedDealerSection = Partial<Omit<DealerSection, "rows">> & {
  rows?: SavedOrderRow[];
};

type SavedOrderData = {
  orderDate?: string;
  orderInfo?: Partial<OrderInfo>;
  rows?: SavedOrderRow[];
  sections?: SavedDealerSection[];
};

type SavedDailyOrder = {
  sections?: SavedDealerSection[];
  updatedAt?: string;
};

type DailyOrderBook = Record<string, SavedDailyOrder>;

type DealerInfo = {
  name: string;
  phone: string;
  fax: string;
  address: string;
};

type OrderInfoField = keyof OrderInfo;
type DealerSectionField = keyof Omit<OrderInfo, "date">;
type RowField = "partNumber" | "price";

type LookupResponse = {
  found: boolean;
  price?: string;
  message?: string;
  needsApiKey?: boolean;
};

type FaxPreview = {
  sectionId: string;
  dealerName: string;
  fileName: string;
  url: string;
  file: File;
};

type DailyPngPreview = {
  date: string;
  fileName: string;
  url: string;
  file: File;
};

type DailyPngRow = {
  partNumber: string;
  quantity: number;
  price: string;
};

const senderFaxLine =
  process.env.NEXT_PUBLIC_FAX_SENDER_LINE ?? "명성모터스 010-5567-0102";
const faxClosingLine = "없는 부품 문자 부탁드립니다.";

const partCatalog: Record<string, PartInfo> = {};

const storageKey = "mobis-daily-parts-v2";
const dailyStorageKey = "mobis-daily-orders-v3";
const lastOrderDateKey = "mobis-last-order-date-v3";
const dealerStorageKey = "mobis-dealers-v2";
const legacyStorageKeys = ["mobis-daily-parts-v1", "mobis-dealers-v1"];
const resetStorageOnceKey = "mobis-cleanup-20260810-v1";
const cleanupStorageKeys = legacyStorageKeys;
const koreanCollator = new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true });
const koreanInitials = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];
const quantityOptions = Array.from({ length: 40 }, (_, index) => index + 1);
const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);

function todayInSeoul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function safeDateParts(dateText: string) {
  const fallbackParts = todayInSeoul().split("-").map(Number);
  const fallback = {
    year: fallbackParts[0] ?? 2026,
    month: fallbackParts[1] ?? 1,
    day: fallbackParts[2] ?? 1,
  };
  const parts = dateText.split("-").map(Number);
  const [year, month, day] = parts;

  if (
    parts.length !== 3 ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return fallback;
  }

  return { year, month, day };
}

function formatMonthKey(year: number, month: number) {
  return `${year}-${pad2(month)}`;
}

function monthKeyFromDate(dateText: string) {
  const { year, month } = safeDateParts(dateText);
  return formatMonthKey(year, month);
}

function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const today = safeDateParts(todayInSeoul());
    return { year: today.year, month: today.month };
  }

  return { year, month };
}

function makeDateText(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function makeCalendarDays(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: Array<{ date: string; day: number } | null> = Array.from(
    { length: firstWeekday },
    () => null,
  );

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({
      date: makeDateText(year, month, day),
      day,
    });
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function moveMonth(monthKey: string, amount: number) {
  const { year, month } = parseMonthKey(monthKey);
  const nextMonth = new Date(year, month - 1 + amount, 1);

  return formatMonthKey(nextMonth.getFullYear(), nextMonth.getMonth() + 1);
}

function formatDailyTotalDate(dateText: string) {
  const { month, day } = safeDateParts(dateText);

  return `${month}월 ${day}일`;
}

function makeOrderInfo(): OrderInfo {
  return {
    date: todayInSeoul(),
    dealer: "",
    dealerPhone: "",
    dealerFax: "",
    dealerAddress: "",
  };
}

function makeRow(): OrderRow {
  return {
    id: crypto.randomUUID(),
    partNumber: "",
    quantity: 1,
    unitPrice: "",
    price: "",
    status: "empty",
  };
}

function makeDealerSection(
  values: Partial<OrderInfo> & { id?: unknown } = {},
  rows: OrderRow[] = [makeRow()],
): DealerSection {
  return {
    id: stringValue(values.id) || crypto.randomUUID(),
    dealer: stringValue(values.dealer),
    dealerPhone: stringValue(values.dealerPhone),
    dealerFax: stringValue(values.dealerFax),
    dealerAddress: stringValue(values.dealerAddress),
    rows,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lookupPart(partNumber: string): PartInfo | null {
  const key = partNumber.trim().toUpperCase();
  return partCatalog[key] ?? null;
}

function normalizeDealer(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeContact(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function koreanInitialIndex(value: string) {
  const firstChar = normalizeDealer(value).charAt(0);
  if (!firstChar) return Number.MAX_SAFE_INTEGER;

  const directInitialIndex = koreanInitials.indexOf(firstChar);
  if (directInitialIndex >= 0) return directInitialIndex;

  const code = firstChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return Number.MAX_SAFE_INTEGER - 1;

  return Math.floor((code - 0xac00) / 588);
}

function compareDealerNames(leftName: string, rightName: string) {
  const initialDifference = koreanInitialIndex(leftName) - koreanInitialIndex(rightName);
  if (initialDifference !== 0) return initialDifference;

  return koreanCollator.compare(leftName, rightName);
}

function sortDealers(dealers: DealerInfo[]) {
  return [...dealers].sort((left, right) => compareDealerNames(left.name, right.name));
}

function dealerFromSaved(value: unknown): DealerInfo | null {
  if (typeof value === "string") {
    const name = normalizeDealer(value);
    return name ? { name, phone: "", fax: "", address: "" } : null;
  }

  if (!isRecord(value)) return null;

  const name = typeof value.name === "string" ? normalizeDealer(value.name) : "";
  if (!name) return null;

  return {
    name,
    phone: typeof value.phone === "string" ? normalizeContact(value.phone) : "",
    fax: typeof value.fax === "string" ? normalizeContact(value.fax) : "",
    address: typeof value.address === "string" ? normalizeContact(value.address) : "",
  };
}

function isDealerInfo(value: DealerInfo | null): value is DealerInfo {
  return value !== null;
}

function dealerInfoFromSection(section: DealerSection): DealerInfo | null {
  const name = normalizeDealer(section.dealer);
  if (!name) return null;

  return {
    name,
    phone: normalizeContact(section.dealerPhone),
    fax: normalizeContact(section.dealerFax),
    address: normalizeContact(section.dealerAddress),
  };
}

function mergeDealers(dealers: DealerInfo[]) {
  const merged = new Map<string, DealerInfo>();

  for (const dealer of dealers) {
    const name = normalizeDealer(dealer.name);
    if (!name) continue;

    const current = merged.get(name);
    merged.set(name, {
      name,
      phone: normalizeContact(dealer.phone) || current?.phone || "",
      fax: normalizeContact(dealer.fax) || current?.fax || "",
      address: normalizeContact(dealer.address) || current?.address || "",
    });
  }

  return sortDealers([...merged.values()]);
}

function upsertDealer(dealers: DealerInfo[], dealer: DealerInfo) {
  const name = normalizeDealer(dealer.name);
  return sortDealers([
    ...dealers.filter((item) => normalizeDealer(item.name) !== name),
    {
      ...dealer,
      name,
      phone: normalizeContact(dealer.phone),
      fax: normalizeContact(dealer.fax),
      address: normalizeContact(dealer.address),
    },
  ]);
}

function isSavedStatus(value: unknown): value is OrderRow["status"] {
  return value === "found" || value === "missing" || value === "empty";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeQuantity(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;

  return Math.min(40, Math.max(1, Math.round(parsed)));
}

function parseWon(price: string) {
  const numericText = price.replace(/[^\d]/g, "");
  if (!numericText) return null;

  const value = Number(numericText);
  return Number.isFinite(value) ? value : null;
}

function formatWon(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function totalPrice(unitPrice: string, quantity: number) {
  const unitValue = parseWon(unitPrice);
  if (unitValue === null) return "";

  return formatWon(unitValue * quantity);
}

function sectionTotalAmount(rows: OrderRow[]) {
  return rows.reduce((total, row) => {
    return total + (parseWon(row.price) ?? 0);
  }, 0);
}

function formatPartNumberForFax(partNumber: string) {
  const compactPartNumber = partNumber.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (compactPartNumber.length <= 5) return compactPartNumber;

  return `${compactPartNumber.slice(0, 5)}-${compactPartNumber.slice(5)}`;
}

function filledFaxRows(section: DealerSection) {
  return section.rows
    .map((row) => ({
      partNumber: formatPartNumberForFax(row.partNumber),
      quantity: normalizeQuantity(row.quantity),
    }))
    .filter((row) => row.partNumber);
}

function formatPriceForDailyPng(price: string) {
  const value = parseWon(price);
  if (value === null) return "-";

  return formatWon(value);
}

function filledDailyPngRows(section: DealerSection): DailyPngRow[] {
  return section.rows
    .map((row) => ({
      partNumber: formatPartNumberForFax(row.partNumber),
      quantity: normalizeQuantity(row.quantity),
      price: formatPriceForDailyPng(row.price),
    }))
    .filter((row) => row.partNumber);
}

function sanitizeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
}

function drawCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  if (context.measureText(text).width <= maxWidth) {
    context.fillText(text, x, y);
    return;
  }

  let clippedText = text;
  while (clippedText.length > 0 && context.measureText(`${clippedText}...`).width > maxWidth) {
    clippedText = clippedText.slice(0, -1);
  }
  context.fillText(`${clippedText}...`, x, y);
}

function drawCanvasRightText(
  context: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  y: number,
) {
  context.fillText(text, rightX - context.measureText(text).width, y);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("이미지를 만들지 못했습니다."));
    }, "image/png");
  });
}

async function makeFaxImageFile(orderDate: string, section: DealerSection, sectionIndex: number) {
  const width = 1240;
  const height = 1754;
  const margin = 96;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지를 만들지 못했습니다.");
  }

  const rows = filledFaxRows(section);
  const dealerName = normalizeDealer(section.dealer) || `대리점 ${sectionIndex + 1}`;
  const firstLine = `${orderDate || todayInSeoul()} ${dealerName}`;
  const partListTop = 276;
  const partListBottom = height - 210;
  const availablePartHeight = partListBottom - partListTop;
  const rowGap =
    rows.length > 1
      ? Math.min(
          16,
          Math.max(0, Math.floor((availablePartHeight - rows.length * 30) / (rows.length - 1))),
        )
      : 0;
  const lineHeight =
    rows.length > 0
      ? Math.max(
          30,
          Math.min(58, Math.floor((availablePartHeight - rowGap * (rows.length - 1)) / rows.length)),
        )
      : 58;
  const rowStride = lineHeight + rowGap;
  const partFontSize = lineHeight < 38 ? 25 : 34;
  const fileName = `${sanitizeFileName(orderDate)}-${sanitizeFileName(dealerName)}-팩스.png`;

  canvas.width = width;
  canvas.height = height;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#17211c";
  context.textBaseline = "top";
  context.font = '800 48px "Malgun Gothic", Arial, sans-serif';
  drawCanvasText(context, firstLine, margin, 88, width - margin * 2);

  context.font = '700 42px "Malgun Gothic", Arial, sans-serif';
  drawCanvasText(context, senderFaxLine, margin, 166, width - margin * 2);

  context.strokeStyle = "#d9dfdc";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(margin, 238);
  context.lineTo(width - margin, 238);
  context.stroke();

  if (rows.length === 0) {
    context.fillStyle = "#617069";
    context.font = '700 34px "Malgun Gothic", Arial, sans-serif';
    context.fillText("입력된 파츠넘버가 없습니다.", margin, partListTop);
  }

  rows.forEach((row, index) => {
    const rowTop = partListTop + index * rowStride;

    context.strokeStyle = "#edf0ee";
    context.beginPath();
    context.moveTo(margin, rowTop + lineHeight);
    context.lineTo(width - margin, rowTop + lineHeight);
    context.stroke();

    context.fillStyle = "#17211c";
    context.font = `800 ${partFontSize}px "Malgun Gothic", Arial, sans-serif`;
    drawCanvasText(
      context,
      `${row.partNumber} ${row.quantity}개`,
      margin,
      rowTop + Math.max(4, (lineHeight - partFontSize) / 2),
      width - margin * 2,
    );
  });

  const closingTop =
    rows.length > 0
      ? Math.min(
          partListBottom + 46,
          partListTop + rows.length * lineHeight + (rows.length - 1) * rowGap + 48,
        )
      : partListTop + 92;
  context.fillStyle = "#17211c";
  context.font = '800 36px "Malgun Gothic", Arial, sans-serif';
  drawCanvasText(context, faxClosingLine, margin, closingTop, width - margin * 2);

  const blob = await canvasToBlob(canvas);
  return new File([blob], fileName || `mobis-fax-${sectionIndex + 1}.png`, {
    type: "image/png",
  });
}

async function makeDailyOrderImageFile(orderDate: string, sections: DealerSection[]) {
  const width = 1240;
  const height = 1754;
  const margin = 64;
  const footerHeight = 58;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지를 만들지 못했습니다.");
  }

  const printableSections = sections
    .map((section, index) => ({
      index,
      section,
      rows: filledDailyPngRows(section),
    }))
    .filter(({ section, rows }) => {
      return Boolean(
        normalizeDealer(section.dealer) ||
          normalizeContact(section.dealerPhone) ||
          normalizeContact(section.dealerFax) ||
          normalizeContact(section.dealerAddress) ||
          rows.length > 0,
      );
    });
  const itemRowCount = printableSections.reduce(
    (count, item) => count + Math.ceil(item.rows.length / 2),
    0,
  );
  const sectionOverhead = printableSections.length > 4 ? 118 : 138;
  const headerBottom = 132;
  const footerTop = height - margin - footerHeight;
  const availableItemHeight =
    footerTop - headerBottom - printableSections.length * sectionOverhead - 18;
  const itemRowHeight =
    itemRowCount > 0
      ? Math.max(22, Math.min(34, Math.floor(availableItemHeight / itemRowCount)))
      : 30;
  const isCompact = itemRowHeight < 28 || printableSections.length > 4;
  const dealerFontSize = isCompact ? 18 : 22;
  const infoFontSize = isCompact ? 13 : 15;
  const partFontSize = Math.max(12, Math.min(isCompact ? 14 : 16, itemRowHeight - 8));
  const contentWidth = width - margin * 2;
  const columnGap = 20;
  const columnWidth = (contentWidth - columnGap) / 2;
  const fileName = `${sanitizeFileName(orderDate || todayInSeoul())}-오늘-총-주문.png`;

  canvas.width = width;
  canvas.height = height;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.textBaseline = "top";

  context.fillStyle = "#17211c";
  context.font = '500 34px "Malgun Gothic", Arial, sans-serif';
  drawCanvasText(context, `${orderDate || todayInSeoul()} 전체 주문 내역`, margin, 48, contentWidth);

  context.fillStyle = "#617069";
  context.font = '400 16px "Malgun Gothic", Arial, sans-serif';
  drawCanvasText(
    context,
    `대리점 ${printableSections.length}곳`,
    margin,
    94,
    contentWidth / 2,
  );
  drawCanvasRightText(
    context,
    `작성 총액 ${formatWon(sections.reduce((total, section) => total + sectionTotalAmount(section.rows), 0))}`,
    width - margin,
    94,
  );

  context.strokeStyle = "#d9dfdc";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(margin, 122);
  context.lineTo(width - margin, 122);
  context.stroke();

  let y = headerBottom;
  let overflowCount = 0;

  if (printableSections.length === 0) {
    context.fillStyle = "#617069";
    context.font = '400 22px "Malgun Gothic", Arial, sans-serif';
    context.fillText("입력된 주문 내용이 없습니다.", margin, y + 20);
  }

  printableSections.forEach(({ section, rows, index }) => {
    if (y + sectionOverhead > footerTop - 10) {
      overflowCount += Math.max(1, rows.length);
      return;
    }

    const dealerName = normalizeDealer(section.dealer) || `대리점 ${index + 1}`;
    const phone = normalizeContact(section.dealerPhone) || "-";
    const fax = normalizeContact(section.dealerFax) || "-";
    const address = normalizeContact(section.dealerAddress) || "-";
    const sectionTotal = sectionTotalAmount(section.rows);

    context.fillStyle = "#f8fbf9";
    context.fillRect(margin, y, contentWidth, isCompact ? 34 : 40);

    context.fillStyle = "#17211c";
    context.font = `500 ${dealerFontSize}px "Malgun Gothic", Arial, sans-serif`;
    drawCanvasText(context, dealerName, margin + 12, y + (isCompact ? 7 : 8), contentWidth - 24);
    y += isCompact ? 42 : 50;

    context.fillStyle = "#4d5d55";
    context.font = `400 ${infoFontSize}px "Malgun Gothic", Arial, sans-serif`;
    drawCanvasText(context, `전화 ${phone}   팩스 ${fax}`, margin + 4, y, contentWidth - 8);
    y += isCompact ? 20 : 24;
    drawCanvasText(context, `주소 ${address}`, margin + 4, y, contentWidth - 8);
    y += isCompact ? 24 : 30;

    if (rows.length === 0) {
      context.fillStyle = "#617069";
      context.font = `400 ${partFontSize}px "Malgun Gothic", Arial, sans-serif`;
      context.fillText("입력된 파츠넘버가 없습니다.", margin + 4, y);
      y += itemRowHeight;
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 2) {
      if (y + itemRowHeight > footerTop - 74) {
        overflowCount += rows.length - rowIndex;
        break;
      }

      [rows[rowIndex], rows[rowIndex + 1]].forEach((item, columnIndex) => {
        if (!item) return;

        const x = margin + columnIndex * (columnWidth + columnGap);
        const text = `${item.partNumber} ${item.quantity}개 ${item.price}`;

        context.strokeStyle = "#edf0ee";
        context.lineWidth = 1;
        context.strokeRect(x, y, columnWidth, itemRowHeight - 4);

        context.fillStyle = "#17211c";
        context.font = `400 ${partFontSize}px "Malgun Gothic", Arial, sans-serif`;
        drawCanvasText(context, text, x + 10, y + 5, columnWidth - 20);
      });

      y += itemRowHeight;
    }

    y += isCompact ? 4 : 8;
    context.fillStyle = "#17211c";
    context.font = `500 ${isCompact ? 15 : 17}px "Malgun Gothic", Arial, sans-serif`;
    drawCanvasRightText(context, `대리점 합계 ${formatWon(sectionTotal)}`, width - margin, y);
    y += isCompact ? 24 : 30;

    context.strokeStyle = "#d9dfdc";
    context.beginPath();
    context.moveTo(margin, y);
    context.lineTo(width - margin, y);
    context.stroke();
    y += isCompact ? 12 : 18;
  });

  if (overflowCount > 0) {
    context.fillStyle = "#8a3d1c";
    context.font = '400 14px "Malgun Gothic", Arial, sans-serif';
    drawCanvasText(
      context,
      `내용이 많아 ${overflowCount}개 항목은 한 장에 다 들어가지 않았습니다.`,
      margin,
      Math.min(y, footerTop - 34),
      contentWidth,
    );
  }

  context.fillStyle = "#ffffff";
  context.fillRect(margin, footerTop, contentWidth, footerHeight);
  context.strokeStyle = "#265f47";
  context.lineWidth = 2;
  context.strokeRect(margin, footerTop, contentWidth, footerHeight);
  context.fillStyle = "#17211c";
  context.font = '500 24px "Malgun Gothic", Arial, sans-serif';
  drawCanvasText(context, "날짜별 총 금액", margin + 18, footerTop + 16, contentWidth / 2);
  drawCanvasRightText(
    context,
    formatWon(sections.reduce((total, section) => total + sectionTotalAmount(section.rows), 0)),
    width - margin - 18,
    footerTop + 16,
  );

  const blob = await canvasToBlob(canvas);
  return new File([blob], fileName || "오늘-총-주문.png", {
    type: "image/png",
  });
}

function unitPriceFromTotal(price: string, quantity: number) {
  const totalValue = parseWon(price);
  if (totalValue === null) return "";

  return formatWon(Math.round(totalValue / quantity));
}

function restoreRows(savedRows: SavedOrderRow[]) {
  if (savedRows.length === 0) return [makeRow()];

  return savedRows.map((row) => {
    const partNumber = stringValue(row.partNumber);
    const info = lookupPart(partNumber);
    const quantity = normalizeQuantity(row.quantity);
    const price = stringValue(row.price);
    const normalizedPrice = info && price.includes("$") ? info.price : price;
    const unitPrice = stringValue(row.unitPrice) || unitPriceFromTotal(normalizedPrice, quantity);
    const status = isSavedStatus(row.status) ? row.status : "empty";

    return {
      id: stringValue(row.id) || crypto.randomUUID(),
      partNumber,
      quantity,
      unitPrice,
      price: unitPrice ? totalPrice(unitPrice, quantity) : normalizedPrice,
      status: unitPrice || normalizedPrice ? "found" : status,
    };
  });
}

function restoreOrderInfo(parsed: unknown, savedRows: SavedOrderRow[]) {
  const fallback = savedRows[0] ?? {};
  const savedOrderInfo =
    isRecord(parsed) && isRecord(parsed.orderInfo) ? parsed.orderInfo : fallback;

  return {
    date: stringValue(savedOrderInfo.date) || todayInSeoul(),
    dealer: stringValue(savedOrderInfo.dealer),
    dealerPhone: stringValue(savedOrderInfo.dealerPhone),
    dealerFax: stringValue(savedOrderInfo.dealerFax),
    dealerAddress: stringValue(savedOrderInfo.dealerAddress),
  };
}

function restoreOrderDate(parsed: unknown, restoredOrderInfo: OrderInfo) {
  if (isRecord(parsed) && typeof parsed.orderDate === "string") {
    return parsed.orderDate;
  }

  return restoredOrderInfo.date || todayInSeoul();
}

function restoreSection(section: SavedDealerSection) {
  return makeDealerSection(
    {
      id: section.id,
      dealer: stringValue(section.dealer),
      dealerPhone: stringValue(section.dealerPhone),
      dealerFax: stringValue(section.dealerFax),
      dealerAddress: stringValue(section.dealerAddress),
    },
    restoreRows(Array.isArray(section.rows) ? section.rows : []),
  );
}

function restoreSavedSections(savedSections: SavedDealerSection[] | undefined) {
  if (!savedSections || savedSections.length === 0) return [makeDealerSection()];

  return savedSections.map(restoreSection);
}

function restoreSections(
  parsed: unknown,
  savedRows: SavedOrderRow[],
  restoredOrderInfo: OrderInfo,
) {
  const savedSections = getSavedSections(parsed);
  if (savedSections.length > 0) {
    return restoreSavedSections(savedSections);
  }

  return [makeDealerSection(restoredOrderInfo, restoreRows(savedRows))];
}

function getSavedRows(parsed: unknown): SavedOrderRow[] {
  if (Array.isArray(parsed)) return parsed as SavedOrderRow[];
  if (isRecord(parsed) && Array.isArray((parsed as SavedOrderData).rows)) {
    return (parsed as SavedOrderData).rows ?? [];
  }

  return [];
}

function getSavedSections(parsed: unknown): SavedDealerSection[] {
  if (isRecord(parsed) && Array.isArray((parsed as SavedOrderData).sections)) {
    return (parsed as SavedOrderData).sections ?? [];
  }

  return [];
}

function restoreDailyOrders(parsed: unknown): DailyOrderBook {
  if (!isRecord(parsed)) return {};

  return Object.entries(parsed).reduce<DailyOrderBook>((orders, [date, value]) => {
    if (!date || !isRecord(value)) return orders;

    const savedSections = Array.isArray(value.sections)
      ? (value.sections as SavedDealerSection[])
      : [];
    if (savedSections.length === 0) return orders;

    orders[date] = {
      sections: savedSections,
      updatedAt: stringValue(value.updatedAt),
    };
    return orders;
  }, {});
}

function hasSavedRows(savedSections: SavedDealerSection[] | undefined) {
  return Boolean(
    savedSections?.some((section) => {
      const hasDealerInfo = Boolean(
        stringValue(section.dealer).trim() ||
          stringValue(section.dealerPhone).trim() ||
          stringValue(section.dealerFax).trim() ||
          stringValue(section.dealerAddress).trim(),
      );
      const hasPartInfo = section.rows?.some(
        (row) =>
          stringValue(row.partNumber).trim() ||
          stringValue(row.price).trim() ||
          normalizeQuantity(row.quantity) > 1,
      );

      return hasDealerInfo || hasPartInfo;
    }),
  );
}

function makeDailySnapshot(sections: DealerSection[]): SavedDailyOrder {
  return {
    sections,
    updatedAt: new Date().toISOString(),
  };
}

function dealersFromSections(sections: DealerSection[]) {
  return sections.map(dealerInfoFromSection).filter(isDealerInfo);
}

function savedRowsTotalAmount(rows: SavedOrderRow[] | undefined) {
  return (
    rows?.reduce((total, row) => {
      return total + (parseWon(stringValue(row.price)) ?? 0);
    }, 0) ?? 0
  );
}

function savedSectionsTotalAmount(savedSections: SavedDealerSection[] | undefined) {
  return (
    savedSections?.reduce((total, section) => total + savedRowsTotalAmount(section.rows), 0) ?? 0
  );
}

export default function Home() {
  const [orderDate, setOrderDate] = useState(todayInSeoul);
  const [sections, setSections] = useState<DealerSection[]>([makeDealerSection()]);
  const [dealers, setDealers] = useState<DealerInfo[]>([]);
  const [activeDealerListSectionId, setActiveDealerListSectionId] = useState<string | null>(null);
  const [sharingSectionId, setSharingSectionId] = useState<string | null>(null);
  const [faxPreview, setFaxPreview] = useState<FaxPreview | null>(null);
  const [dailyPngPreview, setDailyPngPreview] = useState<DailyPngPreview | null>(null);
  const [isDailyPngPreparing, setIsDailyPngPreparing] = useState(false);
  const [dailyOrders, setDailyOrders] = useState<DailyOrderBook>({});
  const [calendarMonth, setCalendarMonth] = useState(() => monthKeyFromDate(todayInSeoul()));
  const [activeQuarter, setActiveQuarter] = useState<1 | 2 | null>(null);
  const [isOrderEditing, setIsOrderEditing] = useState(true);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  useEffect(() => {
    if (!window.localStorage.getItem(resetStorageOnceKey)) {
      cleanupStorageKeys.forEach((key) => window.localStorage.removeItem(key));
      window.localStorage.setItem(resetStorageOnceKey, "done");
    }

    const saved = window.localStorage.getItem(storageKey);
    const savedDailyOrders = window.localStorage.getItem(dailyStorageKey);
    const savedDealers = window.localStorage.getItem(dealerStorageKey);
    const savedLastOrderDate = window.localStorage.getItem(lastOrderDateKey);
    const collectedDealers: DealerInfo[] = [];
    let restoredDailyOrders: DailyOrderBook = {};
    let fallbackDate = todayInSeoul();

    if (savedDealers) {
      try {
        const parsedDealers = JSON.parse(savedDealers) as unknown;
        if (Array.isArray(parsedDealers)) {
          collectedDealers.push(...parsedDealers.map(dealerFromSaved).filter(isDealerInfo));
        }
      } catch {
        window.localStorage.removeItem(dealerStorageKey);
      }
    }

    if (savedDailyOrders) {
      try {
        restoredDailyOrders = restoreDailyOrders(JSON.parse(savedDailyOrders) as unknown);
      } catch {
        window.localStorage.removeItem(dailyStorageKey);
      }
    }

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as unknown;
        const savedRows = getSavedRows(parsed);
        const restoredOrderInfo = restoreOrderInfo(parsed, savedRows);
        const restoredSections = restoreSections(parsed, savedRows, restoredOrderInfo);
        const restoredDate = restoreOrderDate(parsed, restoredOrderInfo);
        const dealersFromRows = savedRows
          .map((row) => ({
            name: stringValue(row.dealer),
            phone: stringValue(row.dealerPhone),
            fax: stringValue(row.dealerFax),
            address: stringValue(row.dealerAddress),
          }))
          .filter((dealer) => normalizeDealer(dealer.name));

        fallbackDate = restoredDate || fallbackDate;
        collectedDealers.push(...dealersFromSections(restoredSections), ...dealersFromRows);

        if (!restoredDailyOrders[restoredDate] && hasSavedRows(restoredSections)) {
          restoredDailyOrders[restoredDate] = makeDailySnapshot(restoredSections);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    const selectedDate = savedLastOrderDate || fallbackDate;
    const restoredSections = restoreSavedSections(restoredDailyOrders[selectedDate]?.sections);

    setDailyOrders(restoredDailyOrders);
    setOrderDate(selectedDate);
    setCalendarMonth(monthKeyFromDate(selectedDate));
    setSections(restoredSections);
    setDealers(mergeDealers([...collectedDealers, ...dealersFromSections(restoredSections)]));
    setActiveDealerListSectionId(null);
    setSharingSectionId(null);
    setFaxPreview(null);
    setDailyPngPreview(null);
    setIsOrderEditing(!hasSavedRows(restoredSections));
    setIsStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (!isStorageLoaded) return;
    const currentSnapshot = makeDailySnapshot(sections);

    setDailyOrders((current) => {
      const nextDailyOrders = {
        ...current,
        [orderDate]: currentSnapshot,
      };

      window.localStorage.setItem(dailyStorageKey, JSON.stringify(nextDailyOrders));
      window.localStorage.setItem(storageKey, JSON.stringify({ orderDate, sections }));
      window.localStorage.setItem(lastOrderDateKey, orderDate);

      return nextDailyOrders;
    });
  }, [isStorageLoaded, orderDate, sections]);

  useEffect(() => {
    if (!isStorageLoaded) return;
    window.localStorage.setItem(
      dealerStorageKey,
      JSON.stringify(mergeDealers(dealers.map(dealerFromSaved).filter(isDealerInfo))),
    );
  }, [dealers, isStorageLoaded]);

  useEffect(() => {
    return () => {
      if (faxPreview?.url) URL.revokeObjectURL(faxPreview.url);
    };
  }, [faxPreview?.url]);

  useEffect(() => {
    return () => {
      if (dailyPngPreview?.url) URL.revokeObjectURL(dailyPngPreview.url);
    };
  }, [dailyPngPreview?.url]);

  const visibleDealers = useMemo(
    () => mergeDealers(dealers.map(dealerFromSaved).filter(isDealerInfo)),
    [dealers],
  );

  const savedOrderDateSet = useMemo(() => {
    const dates = new Set<string>();

    Object.entries(dailyOrders).forEach(([date, order]) => {
      if (hasSavedRows(order.sections)) dates.add(date);
    });

    if (hasSavedRows(sections)) dates.add(orderDate);

    return dates;
  }, [dailyOrders, orderDate, sections]);

  const calendarParts = useMemo(() => parseMonthKey(calendarMonth), [calendarMonth]);

  const calendarDays = useMemo(() => makeCalendarDays(calendarMonth), [calendarMonth]);

  const calendarYearOptions = useMemo(() => {
    const years = new Set<number>();
    const baseYear = calendarParts.year;

    for (let year = baseYear - 2; year <= baseYear + 2; year += 1) {
      years.add(year);
    }

    Object.keys(dailyOrders).forEach((date) => {
      years.add(safeDateParts(date).year);
    });
    years.add(safeDateParts(orderDate).year);

    return [...years].sort((left, right) => left - right);
  }, [calendarParts.year, dailyOrders, orderDate]);

  const dailyOrdersWithCurrentDate = useMemo(
    () => ({
      ...dailyOrders,
      [orderDate]: makeDailySnapshot(sections),
    }),
    [dailyOrders, orderDate, sections],
  );

  const calendarDailyTotals = useMemo(
    () =>
      Object.entries(dailyOrdersWithCurrentDate)
        .filter(([date, order]) => date.startsWith(calendarMonth) && hasSavedRows(order.sections))
        .map(([date, order]) => ({
          date,
          total: savedSectionsTotalAmount(order.sections),
        }))
        .sort((left, right) => left.date.localeCompare(right.date)),
    [calendarMonth, dailyOrdersWithCurrentDate],
  );

  const calendarMonthTotal = useMemo(
    () => calendarDailyTotals.reduce((total, item) => total + item.total, 0),
    [calendarDailyTotals],
  );

  const quarterTotals = useMemo(() => {
    const totals: Record<1 | 2, number> = { 1: 0, 2: 0 };

    Object.entries(dailyOrdersWithCurrentDate).forEach(([date, order]) => {
      const { year, month } = safeDateParts(date);
      if (year !== calendarParts.year || !hasSavedRows(order.sections)) return;

      const quarter: 1 | 2 = month <= 6 ? 1 : 2;
      totals[quarter] += savedSectionsTotalAmount(order.sections);
    });

    return totals;
  }, [calendarParts.year, dailyOrdersWithCurrentDate]);

  const selectedCalendarDailyTotal = useMemo(() => {
    if (!orderDate.startsWith(calendarMonth)) return null;

    const selectedOrder = dailyOrdersWithCurrentDate[orderDate];
    if (!hasSavedRows(selectedOrder?.sections)) return null;

    return {
      date: orderDate,
      total: savedSectionsTotalAmount(selectedOrder.sections),
    };
  }, [calendarMonth, dailyOrdersWithCurrentDate, orderDate]);

  const grandTotal = useMemo(
    () => sections.reduce((total, section) => total + sectionTotalAmount(section.rows), 0),
    [sections],
  );

  const hasOrderContent = useMemo(() => hasSavedRows(sections), [sections]);

  const isOrderReadOnly = hasOrderContent && !isOrderEditing;

  function resetOpenPanels() {
    setActiveDealerListSectionId(null);
    setSharingSectionId(null);
    setFaxPreview(null);
    setDailyPngPreview(null);
  }

  function saveCurrentDateToBook() {
    return {
      ...dailyOrders,
      [orderDate]: makeDailySnapshot(sections),
    };
  }

  function changeOrderDate(nextDate: string) {
    const normalizedDate = nextDate || todayInSeoul();
    if (normalizedDate === orderDate) return;

    const nextDailyOrders = saveCurrentDateToBook();
    const nextSections = restoreSavedSections(nextDailyOrders[normalizedDate]?.sections);

    window.localStorage.setItem(dailyStorageKey, JSON.stringify(nextDailyOrders));
    window.localStorage.setItem(storageKey, JSON.stringify({ orderDate, sections }));
    window.localStorage.setItem(lastOrderDateKey, normalizedDate);

    setDailyOrders(nextDailyOrders);
    setOrderDate(normalizedDate);
    setCalendarMonth(monthKeyFromDate(normalizedDate));
    setSections(nextSections);
    setIsOrderEditing(!hasSavedRows(nextSections));
    resetOpenPanels();
  }

  function toggleOrderEditing() {
    if (!hasOrderContent) return;

    if (isOrderEditing) {
      resetOpenPanels();
    }

    setIsOrderEditing((current) => !current);
  }

  function moveCalendarMonth(amount: number) {
    setCalendarMonth((current) => moveMonth(current, amount));
  }

  function changeCalendarYear(year: string) {
    const parsedYear = Number(year);
    if (!Number.isInteger(parsedYear)) return;

    setCalendarMonth(formatMonthKey(parsedYear, calendarParts.month));
  }

  function changeCalendarMonth(month: string) {
    const parsedMonth = Number(month);
    if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return;

    setCalendarMonth(formatMonthKey(calendarParts.year, parsedMonth));
  }

  function updateSection(sectionId: string, field: DealerSectionField, value: string) {
    if (isOrderReadOnly) return;

    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, [field]: value } : section,
      ),
    );
  }

  function updateRows(sectionId: string, mapper: (row: OrderRow) => OrderRow) {
    if (isOrderReadOnly) return;

    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, rows: section.rows.map(mapper) } : section,
      ),
    );
  }

  function updateRow(sectionId: string, id: string, field: RowField, value: string) {
    updateRows(sectionId, (row) => {
        if (row.id !== id) return row;

        if (field === "partNumber") {
          const partNumber = value.toUpperCase();

          return {
            ...row,
            partNumber,
            unitPrice: "",
            price: "",
            status: "empty",
          };
        }

        return {
          ...row,
          [field]: value,
          unitPrice:
            field === "price"
              ? unitPriceFromTotal(value, normalizeQuantity(row.quantity))
              : row.unitPrice,
        };
      });
  }

  function updateQuantity(sectionId: string, id: string, value: string) {
    const quantity = normalizeQuantity(value);

    updateRows(sectionId, (row) => {
        if (row.id !== id) return row;

        const previousQuantity = normalizeQuantity(row.quantity);
        const unitPrice = row.unitPrice || unitPriceFromTotal(row.price, previousQuantity);

        return {
          ...row,
          quantity,
          unitPrice,
          price: unitPrice ? totalPrice(unitPrice, quantity) : row.price,
        };
      });
  }

  function addDealerFromSection(sectionId: string) {
    if (isOrderReadOnly) return;

    const section = sections.find((item) => item.id === sectionId);
    if (!section) return;

    const dealer: DealerInfo = {
      name: normalizeDealer(section.dealer),
      phone: normalizeContact(section.dealerPhone),
      fax: normalizeContact(section.dealerFax),
      address: normalizeContact(section.dealerAddress),
    };
    if (!dealer.name) return;

    setSections((current) =>
      current.map((item) =>
        item.id === sectionId
          ? {
              ...item,
              dealer: dealer.name,
              dealerPhone: dealer.phone,
              dealerFax: dealer.fax,
              dealerAddress: dealer.address,
            }
          : item,
      ),
    );
    setDealers((current) => {
      const nextDealers = upsertDealer(current, dealer);
      window.localStorage.setItem(dealerStorageKey, JSON.stringify(nextDealers));
      return nextDealers;
    });
    setActiveDealerListSectionId(null);
  }

  function toggleDealerDatabase(sectionId: string) {
    if (isOrderReadOnly) return;

    setActiveDealerListSectionId((current) => (current === sectionId ? null : sectionId));
  }

  function selectDealer(sectionId: string, dealer: DealerInfo) {
    if (isOrderReadOnly) return;

    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              dealer: dealer.name,
              dealerPhone: dealer.phone,
              dealerFax: dealer.fax,
              dealerAddress: dealer.address,
            }
          : section,
      ),
    );
    setActiveDealerListSectionId(null);
  }

  function removeDealer(dealerName: string) {
    if (isOrderReadOnly) return;

    setDealers((current) => {
      const nextDealers = current.filter((dealer) => dealer.name !== dealerName);
      window.localStorage.setItem(dealerStorageKey, JSON.stringify(nextDealers));
      return nextDealers;
    });

    setSections((current) =>
      current.map((section) =>
        section.dealer === dealerName
          ? {
              ...section,
              dealer: "",
              dealerPhone: "",
              dealerFax: "",
              dealerAddress: "",
            }
          : section,
      ),
    );
  }

  function clearDealerFields(sectionId: string) {
    if (isOrderReadOnly) return;

    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              dealer: "",
              dealerPhone: "",
              dealerFax: "",
              dealerAddress: "",
            }
          : section,
      ),
    );
    setActiveDealerListSectionId(null);
  }

  function clearSectionContact(
    sectionId: string,
    field: "dealerPhone" | "dealerFax" | "dealerAddress",
  ) {
    updateSection(sectionId, field, "");
  }

  async function confirmPart(sectionId: string, id: string) {
    if (isOrderReadOnly) return;

    const selectedRow = sections
      .find((section) => section.id === sectionId)
      ?.rows.find((row) => row.id === id);
    const partNumber = selectedRow?.partNumber.trim().toUpperCase() ?? "";

    if (!partNumber) {
      updateRows(sectionId, (row) =>
        row.id === id
            ? {
                ...row,
                partNumber: "",
                unitPrice: "",
                price: "",
                status: "empty",
              }
            : row,
      );
      return;
    }

    updateRows(sectionId, (row) =>
      row.id === id
          ? {
              ...row,
              partNumber,
              unitPrice: "",
              price: "",
              status: "checking",
            }
          : row,
    );

    const savedInfo = lookupPart(partNumber);
    if (savedInfo) {
      updateRows(sectionId, (row) =>
        row.id === id && row.partNumber.trim().toUpperCase() === partNumber
            ? {
                ...row,
                unitPrice: savedInfo.price,
                price: totalPrice(savedInfo.price, normalizeQuantity(row.quantity)),
                status: "found",
              }
            : row,
      );
      return;
    }

    try {
      const response = await fetch("/api/parts/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partNumber }),
      });
      const data = (await response.json()) as LookupResponse;

      if (!response.ok) {
        throw new Error(data.message ?? "웹검색 결과를 가져오지 못했습니다.");
      }

      const lookupPrice = data.price;

      if (data.found && lookupPrice) {
        updateRows(sectionId, (row) =>
          row.id === id && row.partNumber.trim().toUpperCase() === partNumber
              ? {
                  ...row,
                  unitPrice: lookupPrice,
                  price: totalPrice(lookupPrice, normalizeQuantity(row.quantity)),
                  status: "found",
                }
              : row,
        );
        return;
      }

      updateRows(sectionId, (row) =>
        row.id === id && row.partNumber.trim().toUpperCase() === partNumber
            ? {
                ...row,
                status: "missing",
              }
            : row,
      );
    } catch {
      updateRows(sectionId, (row) =>
        row.id === id && row.partNumber.trim().toUpperCase() === partNumber
            ? {
                ...row,
                status: "missing",
              }
            : row,
      );
    }
  }

  function confirmPartFromEvent(sectionId: string, id: string) {
    void confirmPart(sectionId, id);
  }

  function isChecking(status: OrderRow["status"]) {
    return status === "checking";
  }

  function addRow(sectionId: string) {
    if (isOrderReadOnly) return;

    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, rows: [...section.rows, makeRow()] } : section,
      ),
    );
  }

  function removeRow(sectionId: string, id: string) {
    if (isOrderReadOnly) return;

    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              rows:
                section.rows.length === 1
                  ? [makeRow()]
                  : section.rows.filter((row) => row.id !== id),
            }
          : section,
      ),
    );
  }

  function addDealerSection() {
    if (isOrderReadOnly) return;

    const nextSection = makeDealerSection();
    setSections((current) => [...current, nextSection]);
    setActiveDealerListSectionId(null);
  }

  function removeDealerSection(sectionId: string) {
    if (isOrderReadOnly) return;

    setSections((current) =>
      current.length === 1 ? [makeDealerSection()] : current.filter((section) => section.id !== sectionId),
    );
    setActiveDealerListSectionId((current) => (current === sectionId ? null : current));
    setSharingSectionId((current) => (current === sectionId ? null : current));
    setFaxPreview((current) => (current?.sectionId === sectionId ? null : current));
  }

  function clearOrder() {
    if (isOrderReadOnly) return;
    if (!window.confirm("정말 새로시작을 할까요?")) return;

    setSections([makeDealerSection()]);
    setIsOrderEditing(true);
    resetOpenPanels();
  }

  async function shareDealerFax(section: DealerSection, sectionIndex: number) {
    setSharingSectionId(section.id);

    try {
      const file = await makeFaxImageFile(orderDate, section, sectionIndex);
      const dealerName = normalizeDealer(section.dealer) || `대리점 ${sectionIndex + 1}`;
      const url = URL.createObjectURL(file);

      setFaxPreview({
        sectionId: section.id,
        dealerName,
        fileName: file.name,
        url,
        file,
      });
    } catch {
      window.alert("팩스용 이미지를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSharingSectionId(null);
    }
  }

  async function makeDailyOrderPng() {
    setIsDailyPngPreparing(true);

    try {
      const file = await makeDailyOrderImageFile(orderDate, sections);
      const url = URL.createObjectURL(file);

      setDailyPngPreview({
        date: orderDate,
        fileName: file.name,
        url,
        file,
      });
    } catch {
      window.alert("오늘 총 주문 PNG를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsDailyPngPreparing(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="app-container">
        <header className="app-header">
          <div className="app-title-block">
            <p className="app-kicker">Hyundai Mobis Parts Order</p>
            <h1 className="app-title">
              현대모비스 주문 파츠 기록장
            </h1>
            <p className="app-subtitle">
              날짜별 주문 파츠의 원화 가격을 빠르게 기록합니다.
            </p>
          </div>
        </header>

        <section className="order-workspace">
          <div className="order-card">
            <section className="calendar-band" aria-label="날짜 달력">
              <div className="calendar-header">
                <div className="calendar-title-group">
                  <span>달력</span>
                  <strong>
                    {calendarParts.year}년 {calendarParts.month}월
                  </strong>
                </div>
                <div className="calendar-controls">
                  <button
                    aria-label="이전 달"
                    className="calendar-nav-button"
                    type="button"
                    onClick={() => moveCalendarMonth(-1)}
                  >
                    ‹
                  </button>
                  <select
                    aria-label="연도 선택"
                    className="calendar-select"
                    value={calendarParts.year}
                    onChange={(event) => changeCalendarYear(event.target.value)}
                  >
                    {calendarYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}년
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="월 선택"
                    className="calendar-select"
                    value={calendarParts.month}
                    onChange={(event) => changeCalendarMonth(event.target.value)}
                  >
                    {monthOptions.map((month) => (
                      <option key={month} value={month}>
                        {month}월
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label="다음 달"
                    className="calendar-nav-button"
                    type="button"
                    onClick={() => moveCalendarMonth(1)}
                  >
                    ›
                  </button>
                  <button
                    className="calendar-today-button"
                    type="button"
                    onClick={() => changeOrderDate(todayInSeoul())}
                  >
                    오늘
                  </button>
                </div>
              </div>
              <div className="calendar-grid">
                {weekDays.map((day) => (
                  <div className="calendar-weekday" key={day}>
                    {day}
                  </div>
                ))}
                {calendarDays.map((day, index) =>
                  day ? (
                    <button
                      aria-current={day.date === orderDate ? "date" : undefined}
                      aria-label={`${day.date} 날짜 열기`}
                      className={`calendar-day ${
                        savedOrderDateSet.has(day.date) ? "saved" : ""
                      }`}
                      key={day.date}
                      type="button"
                      onClick={() => changeOrderDate(day.date)}
                    >
                      <span className="calendar-day-number">{day.day}</span>
                      {savedOrderDateSet.has(day.date) ? (
                        <span aria-hidden="true" className="calendar-saved-dot" />
                      ) : null}
                    </button>
                  ) : (
                    <span aria-hidden="true" className="calendar-day empty" key={`empty-${index}`} />
                  ),
                )}
              </div>
              <div className="calendar-total-panel" aria-label="월별 합계">
                <div className="calendar-total-summary">
                  <div className="calendar-total-heading">
                    <span>월 누적 합계</span>
                    <div className="quarter-total-actions" aria-label="분기 합계">
                      {([1, 2] as const).map((quarter) => (
                        <button
                          aria-label={`${quarter}분기 합계 보기`}
                          aria-pressed={activeQuarter === quarter}
                          className="quarter-total-button"
                          key={quarter}
                          type="button"
                          onClick={() =>
                            setActiveQuarter((current) => (current === quarter ? null : quarter))
                          }
                        >
                          {quarter}분기
                        </button>
                      ))}
                    </div>
                  </div>
                  <strong>{formatWon(calendarMonthTotal)}</strong>
                  {activeQuarter ? (
                    <div
                      aria-label={`${calendarParts.year}년 ${activeQuarter}분기 누적 합계 ${formatWon(
                        quarterTotals[activeQuarter],
                      )}`}
                      className="quarter-total-result"
                    >
                      <span>
                        {activeQuarter}분기 {activeQuarter === 1 ? "1~6월" : "7~12월"}
                      </span>
                      <strong>{formatWon(quarterTotals[activeQuarter])}</strong>
                    </div>
                  ) : null}
                </div>
                <div className="calendar-daily-total-list">
                  {selectedCalendarDailyTotal ? (
                    <button
                      aria-current="date"
                      className="calendar-daily-total-row"
                      type="button"
                      onClick={() => changeOrderDate(selectedCalendarDailyTotal.date)}
                    >
                      <span>{formatDailyTotalDate(selectedCalendarDailyTotal.date)}</span>
                      <strong>{formatWon(selectedCalendarDailyTotal.total)}</strong>
                    </button>
                  ) : (
                    <span className="calendar-total-empty">
                      선택한 날짜에 누적된 금액이 없습니다.
                    </span>
                  )}
                </div>
              </div>
            </section>

            <div className="order-toolbar">
              <div className="order-toolbar-title">일별 주문 입력</div>
              <div className="order-toolbar-actions">
                {hasOrderContent ? (
                  <button
                    className={`command-button ${isOrderReadOnly ? "primary" : ""}`}
                    type="button"
                    onClick={toggleOrderEditing}
                  >
                    {isOrderReadOnly ? "수정" : "수정 완료"}
                  </button>
                ) : null}
                <button
                  className="command-button primary"
                  disabled={isOrderReadOnly}
                  type="button"
                  onClick={addDealerSection}
                >
                  + 대리점
                </button>
                <button
                  className="command-button"
                  disabled={isOrderReadOnly}
                  type="button"
                  onClick={clearOrder}
                >
                  새로 시작
                </button>
              </div>
            </div>

            <section className="order-info-band order-date-band">
              <label className="order-date-control">
                <span>날짜</span>
                <input
                  aria-label="날짜"
                  className="field"
                  type="date"
                  value={orderDate}
                  onInput={(event) => changeOrderDate(event.currentTarget.value)}
                  onChange={(event) => changeOrderDate(event.target.value)}
                />
              </label>
              <div className="grand-total-control">
                <div aria-label="총금액" className="grand-total-button">
                  <span>총금액</span>
                </div>
                <div
                  aria-label={`총금액 ${formatWon(grandTotal)}`}
                  className="grand-total-amount"
                >
                  <strong>{formatWon(grandTotal)}</strong>
                </div>
              </div>
              <button
                className="command-button primary daily-png-button"
                disabled={isDailyPngPreparing}
                type="button"
                onClick={makeDailyOrderPng}
              >
                {isDailyPngPreparing ? "준비중" : "오늘 총 주문 png 만들기"}
              </button>
            </section>

            {dailyPngPreview ? (
              <div className="fax-preview-panel daily-png-preview-panel">
                <div className="fax-preview-image-shell daily-png-image-shell">
                  <Image
                    alt={`${dailyPngPreview.date} 전체 주문 PNG`}
                    className="fax-preview-image"
                    height={255}
                    src={dailyPngPreview.url}
                    style={{
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "top left",
                      width: "100%",
                    }}
                    unoptimized
                    width={180}
                  />
                </div>
                <div className="fax-preview-detail">
                  <strong>오늘 총 주문 PNG 준비됨</strong>
                  <span>{dailyPngPreview.fileName}</span>
                </div>
                <div className="fax-preview-actions">
                  <a
                    className="command-button primary"
                    download={dailyPngPreview.fileName}
                    href={dailyPngPreview.url}
                  >
                    PNG 저장
                  </a>
                  <button
                    aria-label="오늘 총 주문 PNG 미리보기 닫기"
                    className="icon-button"
                    type="button"
                    onClick={() => setDailyPngPreview(null)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}

            <div className="dealer-sections">
              {sections.map((section, sectionIndex) => (
                <section
                  aria-label={`대리점 ${sectionIndex + 1}`}
                  className="dealer-order-section"
                  key={section.id}
                >
                  <div className="dealer-section-header">
                    <div className="dealer-section-title">
                      <span>대리점 {sectionIndex + 1}</span>
                      <strong>{section.dealer || "대리점 입력"}</strong>
                    </div>
                    <div className="dealer-section-actions">
                      <button
                        aria-label={`${section.dealer || `대리점 ${sectionIndex + 1}`} PNG 만들기`}
                        className="fax-share-button"
                        disabled={sharingSectionId === section.id}
                        type="button"
                        onClick={() => shareDealerFax(section, sectionIndex)}
                      >
                        {sharingSectionId === section.id ? "준비중" : "PNG 만들기"}
                      </button>
                      {sections.length > 1 ? (
                        <button
                          aria-label="대리점 구간 삭제"
                          className="icon-button"
                          disabled={isOrderReadOnly}
                          type="button"
                          onClick={() => removeDealerSection(section.id)}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {faxPreview?.sectionId === section.id ? (
                    <div className="fax-preview-panel">
                      <div className="fax-preview-image-shell">
                        <Image
                          alt={`${faxPreview.dealerName} 팩스용 PNG`}
                          className="fax-preview-image"
                          height={255}
                          src={faxPreview.url}
                          style={{
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "top left",
                            width: "100%",
                          }}
                          unoptimized
                          width={180}
                        />
                      </div>
                      <div className="fax-preview-detail">
                        <strong>PNG 파일 준비됨</strong>
                        <span>{faxPreview.fileName}</span>
                      </div>
                      <div className="fax-preview-actions">
                        <a
                          className="command-button primary"
                          download={faxPreview.fileName}
                          href={faxPreview.url}
                        >
                          PNG 저장
                        </a>
                        <button
                          aria-label="PNG 미리보기 닫기"
                          className="icon-button"
                          type="button"
                          onClick={() => setFaxPreview(null)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="dealer-form-grid dealer-section-form">
                    <div
                      className={`dealer-select-control ${
                        activeDealerListSectionId === section.id ? "open" : ""
                      }`}
                    >
                      <input
                        aria-label="대리점"
                        className="field dealer-name-field"
                        disabled={isOrderReadOnly}
                        placeholder="대리점명"
                        value={section.dealer}
                        onChange={(event) =>
                          updateSection(section.id, "dealer", event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addDealerFromSection(section.id);
                          }
                        }}
                      />
                      <button
                        aria-expanded={activeDealerListSectionId === section.id}
                        aria-label="저장된 대리점 열기"
                        className="dealer-dropdown-button"
                        disabled={isOrderReadOnly}
                        type="button"
                        onClick={() => toggleDealerDatabase(section.id)}
                      >
                        ▼
                      </button>
                      {activeDealerListSectionId === section.id && visibleDealers.length > 0 ? (
                        <div
                          className="dealer-list dealer-dropdown-list"
                          aria-label="저장된 대리점 목록"
                        >
                          {visibleDealers.map((dealer) => (
                            <div className="dealer-list-item" key={dealer.name}>
                              <button
                                className="dealer-chip"
                                disabled={isOrderReadOnly}
                                type="button"
                                onClick={() => selectDealer(section.id, dealer)}
                              >
                                <span className="dealer-chip-name">{dealer.name}</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="field-clear-row">
                      <input
                        aria-label="전화번호"
                        className="field"
                        disabled={isOrderReadOnly}
                        placeholder="전화번호"
                        value={section.dealerPhone}
                        onChange={(event) =>
                          updateSection(section.id, "dealerPhone", event.target.value)
                        }
                      />
                      <button
                        aria-label="전화번호 삭제"
                        className="field-clear-button"
                        disabled={isOrderReadOnly}
                        type="button"
                        onClick={() => clearSectionContact(section.id, "dealerPhone")}
                      >
                        ×
                      </button>
                    </div>
                    <div className="field-clear-row">
                      <input
                        aria-label="팩스번호"
                        className="field"
                        disabled={isOrderReadOnly}
                        placeholder="팩스번호"
                        value={section.dealerFax}
                        onChange={(event) =>
                          updateSection(section.id, "dealerFax", event.target.value)
                        }
                      />
                      <button
                        aria-label="팩스번호 삭제"
                        className="field-clear-button"
                        disabled={isOrderReadOnly}
                        type="button"
                        onClick={() => clearSectionContact(section.id, "dealerFax")}
                      >
                        ×
                      </button>
                    </div>
                    <div className="field-clear-row dealer-address-row">
                      <input
                        aria-label="주소"
                        className="field"
                        disabled={isOrderReadOnly}
                        placeholder="주소"
                        value={section.dealerAddress}
                        onChange={(event) =>
                          updateSection(section.id, "dealerAddress", event.target.value)
                        }
                      />
                      <button
                        aria-label="주소 삭제"
                        className="field-clear-button"
                        disabled={isOrderReadOnly}
                        type="button"
                        onClick={() => clearSectionContact(section.id, "dealerAddress")}
                      >
                        ×
                      </button>
                    </div>
                    <div className="dealer-panel-actions">
                      <button
                        aria-label="대리점 저장"
                        className="dealer-save-button"
                        disabled={isOrderReadOnly}
                        type="button"
                        onClick={() => addDealerFromSection(section.id)}
                      >
                        저장
                      </button>
                      <button
                        aria-label="대리점 입력 삭제"
                        className="field-clear-button"
                        disabled={isOrderReadOnly}
                        type="button"
                        onClick={() => clearDealerFields(section.id)}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="section-row-actions">
                    <button
                      className="command-button primary"
                      disabled={isOrderReadOnly}
                      type="button"
                      onClick={() => addRow(section.id)}
                    >
                      + 행 추가
                    </button>
                    <div
                      aria-label={`합계 금액 ${formatWon(sectionTotalAmount(section.rows))}`}
                      className="section-total-box"
                    >
                      <strong>{formatWon(sectionTotalAmount(section.rows))}</strong>
                    </div>
                  </div>

                  <div className="table-scroll">
                    <table className="order-table">
                      <thead>
                        <tr className="table-header-row">
                          <th className="table-head part-column">파츠넘버</th>
                          <th className="table-head quantity-column">갯수</th>
                          <th className="table-head confirm-column">확인</th>
                          <th className="table-head price-column">가격(원)</th>
                          <th className="table-head status-column">상태</th>
                          <th className="table-head delete-column"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row) => (
                          <tr key={row.id} className="order-row">
                            <td className="table-cell">
                              <input
                                aria-label="파츠넘버"
                                className="field part-number-field"
                                disabled={isOrderReadOnly}
                                placeholder="파츠넘버 입력"
                                value={row.partNumber}
                                onChange={(event) =>
                                  updateRow(
                                    section.id,
                                    row.id,
                                    "partNumber",
                                    event.target.value,
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    confirmPartFromEvent(section.id, row.id);
                                  }
                                }}
                              />
                            </td>
                            <td className="table-cell">
                              <select
                                aria-label="갯수"
                                className="field quantity-select"
                                disabled={isOrderReadOnly}
                                value={row.quantity ?? 1}
                                onChange={(event) =>
                                  updateQuantity(section.id, row.id, event.target.value)
                                }
                              >
                                {quantityOptions.map((quantity) => (
                                  <option key={quantity} value={quantity}>
                                    {quantity}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="table-cell">
                              <button
                                className="confirm-button"
                                disabled={isOrderReadOnly}
                                type="button"
                                onClick={() => confirmPartFromEvent(section.id, row.id)}
                              >
                                {isChecking(row.status) ? "조회중" : "확인"}
                              </button>
                            </td>
                            <td className="table-cell">
                              <input
                                aria-label="가격"
                                className="field"
                                disabled={isOrderReadOnly}
                                placeholder="원"
                                value={row.price}
                                onChange={(event) =>
                                  updateRow(section.id, row.id, "price", event.target.value)
                                }
                              />
                            </td>
                            <td className="table-cell">
                              <StatusBadge status={row.status} />
                            </td>
                            <td className="table-cell delete-cell">
                              <button
                                aria-label="행 삭제"
                                className="icon-button"
                                disabled={isOrderReadOnly}
                                type="button"
                                onClick={() => removeRow(section.id, row.id)}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          </div>

        </section>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: OrderRow["status"] }) {
  const label =
    status === "found"
      ? "완료"
      : status === "missing"
        ? "확인필요"
        : status === "checking"
          ? "조회중"
          : "대기";
  return <span className={`status-badge ${status}`}>{label}</span>;
}
