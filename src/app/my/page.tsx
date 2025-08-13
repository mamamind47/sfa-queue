"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Types
type TicketStatus = "WAITING" | "CALLED" | "SERVED" | "SKIPPED" | "CANCELED";

type TicketData = {
  id: number;
  displayNo: string;
  token?: string;
  serviceId: number;
  status: TicketStatus;
  name?: string | null;
};

type Envelope = {
  ticket: {
    id: number;
    displayNo: string;
    status: TicketStatus;
    serviceId: number;
    name?: string | null;
    token?: string | null;
  };
  waitingAhead?: number;
  currentTicketId?: number | null;
};

export default function MyQueue() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<TicketData | null>(null);
  const [waitingAhead, setWaitingAhead] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [canceling, setCanceling] = useState<boolean>(false);

  const isTerminal = useCallback(
    (st: TicketStatus) => st === "SERVED" || st === "SKIPPED" || st === "CANCELED",
    []
  );

  // Normalize API response (envelope or raw)
  const normalize = useCallback(
    (j: unknown, fallbackToken: string | null): { t: TicketData; w: number | null } | null => {
      if (j && typeof j === "object" && (j as Record<string, unknown>).ticket) {
        const env = j as Envelope;
        const t = env.ticket;
        if (
          !t ||
          typeof t.id !== "number" ||
          typeof t.displayNo !== "string" ||
          typeof t.serviceId !== "number" ||
          typeof t.status !== "string"
        )
          return null;
        return {
          t: {
            id: t.id,
            displayNo: t.displayNo,
            serviceId: t.serviceId,
            status: t.status,
            name: t.name ?? null,
            token: t.token ?? fallbackToken ?? undefined,
          },
          w: typeof env.waitingAhead === "number" ? env.waitingAhead : null,
        };
      }
      const r = j as Partial<TicketData>;
      if (
        r &&
        typeof r.id === "number" &&
        typeof r.displayNo === "string" &&
        typeof r.serviceId === "number" &&
        typeof r.status === "string"
      ) {
        return {
          t: {
            id: r.id,
            displayNo: r.displayNo,
            serviceId: r.serviceId,
            status: r.status as TicketStatus,
            name: r.name ?? null,
            token: r.token ?? fallbackToken ?? undefined,
          },
          w: null,
        };
      }
      return null;
    },
    []
  );

  // Read token from localStorage
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const last = localStorage.getItem("sfaq:lastToken");
        if (!last) {
          router.replace("/ticket");
          return;
        }
        setToken(last);
      }
    } catch {
      router.replace("/ticket");
    }
  }, [router]);

  // Fetch + poll
  useEffect(() => {
    if (!token) return;
    let stop = false;

    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/tickets/${token}`, { cache: "no-store" });
        if (!r.ok) {
          setErr("ไม่พบคิวของคุณ");
          try {
            localStorage.removeItem("sfaq:lastToken");
          } catch {}
          setLoading(false);
          router.replace("/ticket");
          return;
        }
        const j = await r.json();
        const n = normalize(j, token);
        if (!n) {
          setErr("รูปแบบข้อมูลผิดพลาด");
          setLoading(false);
          return;
        }
        setData(n.t);
        setWaitingAhead(n.w);
        setErr(null);
        setLoading(false);
        if (isTerminal(n.t.status)) {
          try {
            localStorage.removeItem("sfaq:lastToken");
          } catch {}
          stop = true;
        }
      } catch {
        setLoading(false);
      }
    })();

    const iv = setInterval(async () => {
      if (stop) return;
      try {
        const r2 = await fetch(`/api/tickets/${token}`, { cache: "no-store" });
        if (!r2.ok) return;
        const j2 = await r2.json();
        const n2 = normalize(j2, token);
        if (!n2) return;
        setData(n2.t);
        setWaitingAhead(n2.w);
        if (isTerminal(n2.t.status)) {
          try {
            localStorage.removeItem("sfaq:lastToken");
          } catch {}
          clearInterval(iv);
        }
      } catch {}
    }, 10000);

    return () => clearInterval(iv);
  }, [token, router, normalize, isTerminal]);

  const canCancel = useMemo(
    () => !!data && (data.status === "WAITING" || data.status === "CALLED"),
    [data]
  );

  // UI helpers
  function StatusBadge({ status }: { status: TicketStatus }) {
    const map: Record<TicketStatus, string> = {
      WAITING: "bg-slate-100 text-slate-700",
      CALLED: "bg-blue-100 text-blue-800",
      SERVED: "bg-emerald-100 text-emerald-800",
      SKIPPED: "bg-amber-100 text-amber-800",
      CANCELED: "bg-rose-100 text-rose-800",
    };
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${map[status]}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current/70" />
        {status}
      </span>
    );
  }

  const Skeleton = () => (
    <div className="animate-pulse space-y-4">
      <div className="h-24 w-full rounded-2xl bg-slate-200" />
      <div className="h-16 w-full rounded-2xl bg-slate-200" />
      <div className="h-24 w-full rounded-2xl bg-slate-200" />
    </div>
  );

  async function cancelTicket() {
    if (!token || !canCancel) return;
    const ok = confirm("ยืนยันยกเลิกคิว?");
    if (!ok) return;
    setCanceling(true);
    try {
      const r = await fetch(`/api/tickets/${token}`, { method: "DELETE" });
      if (r.ok) {
        try {
          localStorage.removeItem("sfaq:lastToken");
        } catch {}
        router.replace("/ticket");
      }
    } catch {
      // ignore
    } finally {
      setCanceling(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-28">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 bg-white/80 px-4 pt-3 backdrop-blur">
        <h1 className="text-2xl font-bold">คิวของฉัน - SFA Queue</h1>
      </div>

      {loading ? (
        <Skeleton />
      ) : err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          {err}
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Big number card */}
          <div className="rounded-2xl border p-5 text-center shadow-sm">
            <div className="text-sm text-slate-500">หมายเลขคิวของคุณ</div>
            <div className="mt-1 text-6xl font-extrabold tracking-wider">
              {data.displayNo}
            </div>
            {data.name ? (
              <div className="mt-1 text-base">{data.name}</div>
            ) : null}
            <div className="mt-3">
              <StatusBadge status={data.status} />
            </div>
          </div>

          {/* Waiting ahead or called info */}
          {data.status === "WAITING" && typeof waitingAhead === "number" && (
            <div className="rounded-2xl border p-5 shadow-sm">
              <div className="text-sm text-slate-500">เหลือก่อนหน้าคุณ</div>
              <div className="mt-1 text-3xl font-semibold">
                {waitingAhead} คิว
              </div>
              <div className="mt-2 h-2 w-full rounded bg-slate-100">
                <div
                  className="h-2 rounded bg-blue-600"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, 100 - Math.min(waitingAhead, 99))
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {data.status === "CALLED" && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <div className="text-sm text-emerald-700">สถานะ</div>
              <div className="mt-1 text-xl font-semibold text-emerald-800">
                ถึงคิวของคุณแล้ว
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelTicket}
              disabled={!canCancel || canceling}
              className="w-full rounded-lg bg-rose-600 px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {canceling ? "กำลังยกเลิก…" : "ยกเลิกคิว"}
            </button>
          </div>

          <div className="text-xs text-slate-500">
            เก็บลิงก์หน้านี้ไว้กลับมาดูสถานะได้
            หากปิดหน้าไปแล้วระบบจะจำคิวของคุณจนกว่าคิวจะเสร็จ/ถูกข้าม/ยกเลิก
          </div>
        </div>
      ) : null}

      {/* Sticky footer CTA when data is terminal (optional)
      {data && (data.status === 'SERVED' || data.status === 'SKIPPED' || data.status === 'CANCELED') && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              onClick={() => router.push('/ticket')}
              className="w-full rounded-lg bg-black px-4 py-3 text-white"
            >
              กลับไปเริ่มใหม่
            </button>
          </div>
        </div>
      )}
      */}
    </main>
  );
}
