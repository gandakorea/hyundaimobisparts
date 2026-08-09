"use client";

import { useEffect, useMemo, useState } from "react";

type PartInfo = {
  price: string;
  size: string;
  weight: string;
};

type OrderRow = {
  id: string;
  date: string;
  partNumber: string;
  price: string;
  size: string;
  weight: string;
  note: string;
  status: "found" | "missing" | "empty";
};

const partCatalog: Record<string, PartInfo> = {
  "28113-3X000": {
    price: "$18.40",
    size: "31 x 21 x 4 cm",
    weight: "0.18 kg",
  },
  "97133-D1000": {
    price: "$22.90",
    size: "22 x 20 x 3 cm",
    weight: "0.12 kg",
  },
  "26300-35505": {
    price: "$7.80",
    size: "8 x 8 x 9 cm",
    weight: "0.32 kg",
  },
  "58101-2MA00": {
    price: "$38.50",
    size: "16 x 9 x 8 cm",
    weight: "0.95 kg",
  },
};

const storageKey = "mobis-daily-parts-v1";

function todayInSeoul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function makeRow(date = todayInSeoul()): OrderRow {
  return {
    id: crypto.randomUUID(),
    date,
    partNumber: "",
    price: "",
    size: "",
    weight: "",
    note: "",
    status: "empty",
  };
}

function lookupPart(partNumber: string): PartInfo | null {
  const key = partNumber.trim().toUpperCase();
  return partCatalog[key] ?? null;
}

export default function Home() {
  const [rows, setRows] = useState<OrderRow[]>([makeRow()]);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as OrderRow[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setRows(parsed);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(rows));
  }, [rows]);

  const summary = useMemo(() => {
    const filled = rows.filter((row) => row.partNumber.trim()).length;
    const found = rows.filter((row) => row.status === "found").length;
    const missing = rows.filter((row) => row.status === "missing").length;
    return { filled, found, missing };
  }, [rows]);

  function updateRow(id: string, field: keyof OrderRow, value: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;

        if (field === "partNumber") {
          const partNumber = value.toUpperCase();
          const info = lookupPart(partNumber);

          return {
            ...row,
            partNumber,
            price: info?.price ?? row.price,
            size: info?.size ?? row.size,
            weight: info?.weight ?? row.weight,
            status: partNumber.trim() ? (info ? "found" : "missing") : "empty",
          };
        }

        return { ...row, [field]: value };
      }),
    );
  }

  function addRow() {
    setRows((current) => [...current, makeRow(current.at(-1)?.date)]);
  }

  function removeRow(id: string) {
    setRows((current) =>
      current.length === 1 ? [makeRow(current[0]?.date)] : current.filter((row) => row.id !== id),
    );
  }

  function clearRows() {
    setRows([makeRow()]);
  }

  return (
    <main className="min-h-screen bg-[#f5f7f6] text-[#17211c]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d9dfdc] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#617069]">Hyundai Mobis Parts Order</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[#121916] sm:text-4xl">
              현대모비스 주문 파츠 기록장
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#526058]">
              날짜와 파츠넘버를 넣으면 등록된 항목의 가격, 제품 크기, 무게를 바로 채워 둡니다.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-md border border-[#d9dfdc] bg-white p-2 shadow-sm">
            <Stat label="입력" value={summary.filled} />
            <Stat label="자동" value={summary.found} />
            <Stat label="확인" value={summary.missing} />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="overflow-hidden rounded-md border border-[#d9dfdc] bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[#e3e8e5] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-[#2d3b34]">일별 주문 입력</div>
              <div className="flex flex-wrap gap-2">
                <button className="command-button primary" type="button" onClick={addRow}>
                  + 행 추가
                </button>
                <button className="command-button" type="button" onClick={clearRows}>
                  새로 시작
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-[#eef2ef] text-xs font-semibold uppercase text-[#617069]">
                    <th className="table-head w-[150px]">날짜</th>
                    <th className="table-head w-[190px]">파츠넘버</th>
                    <th className="table-head w-[130px]">가격</th>
                    <th className="table-head w-[180px]">크기</th>
                    <th className="table-head w-[120px]">무게</th>
                    <th className="table-head">메모</th>
                    <th className="table-head w-[88px]">상태</th>
                    <th className="table-head w-[68px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-[#edf0ee]">
                      <td className="table-cell">
                        <input
                          aria-label="날짜"
                          className="field"
                          type="date"
                          value={row.date}
                          onChange={(event) => updateRow(row.id, "date", event.target.value)}
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          aria-label="파츠넘버"
                          className="field font-mono text-[13px]"
                          placeholder="예: 28113-3X000"
                          value={row.partNumber}
                          onChange={(event) => updateRow(row.id, "partNumber", event.target.value)}
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          aria-label="가격"
                          className="field"
                          placeholder="$"
                          value={row.price}
                          onChange={(event) => updateRow(row.id, "price", event.target.value)}
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          aria-label="크기"
                          className="field"
                          placeholder="L x W x H"
                          value={row.size}
                          onChange={(event) => updateRow(row.id, "size", event.target.value)}
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          aria-label="무게"
                          className="field"
                          placeholder="kg"
                          value={row.weight}
                          onChange={(event) => updateRow(row.id, "weight", event.target.value)}
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          aria-label="메모"
                          className="field"
                          placeholder="주문처, 확인사항"
                          value={row.note}
                          onChange={(event) => updateRow(row.id, "note", event.target.value)}
                        />
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="table-cell text-right">
                        <button
                          aria-label="행 삭제"
                          className="icon-button"
                          type="button"
                          onClick={() => removeRow(row.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="rounded-md border border-[#d9dfdc] bg-[#17211c] p-4 text-white shadow-sm">
            <h2 className="text-base font-semibold">자동 입력 샘플</h2>
            <div className="mt-4 space-y-3">
              {Object.entries(partCatalog).map(([partNumber, info]) => (
                <button
                  key={partNumber}
                  className="sample-button"
                  type="button"
                  onClick={() =>
                    setRows((current) => [
                      ...current,
                      {
                        ...makeRow(current.at(-1)?.date),
                        partNumber,
                        price: info.price,
                        size: info.size,
                        weight: info.weight,
                        status: "found",
                      },
                    ])
                  }
                >
                  <span className="font-mono text-sm">{partNumber}</span>
                  <span className="text-xs text-[#b8c8bf]">
                    {info.price} · {info.weight}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-sm leading-6 text-[#c7d5ce]">
              실제 파츠넘버를 주면 가격표와 치수 데이터를 계속 추가해 나갈 수 있습니다.
            </p>
          </aside>
        </section>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded bg-[#f5f7f6] px-3 py-2 text-center">
      <div className="text-xl font-semibold text-[#17211c]">{value}</div>
      <div className="text-xs text-[#617069]">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderRow["status"] }) {
  const label = status === "found" ? "자동" : status === "missing" ? "확인" : "대기";
  return <span className={`status-badge ${status}`}>{label}</span>;
}
