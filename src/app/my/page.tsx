"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Minimal ticket type for client view
type TicketData = {
  id: number;
  displayNo: string;
  token?: string; // optional; we inject from local state when available
  serviceId: number;
  status: "WAITING" | "CALLED" | "SERVED" | "SKIPPED" | "CANCELED";
  name?: string | null;
};

export default function MyQueue() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<TicketData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [waitingAhead, setWaitingAhead] = useState<number | null>(null);

  type TicketApiEnvelope = {
    ticket: {
      id: number;
      displayNo: string;
      status: TicketData["status"];
      serviceId: number;
      name?: string | null;
      token?: string | null;
    };
    waitingAhead?: number;
    currentTicketId?: number | null;
  };

  function normalizeTicketResponse(j: unknown, fallbackToken: string | null): { ticket: TicketData; waitingAhead: number | null } | null {
    // envelope form { ticket: {...}, waitingAhead }
    if (j && typeof j === "object" && "ticket" in (j as Record<string, unknown>)) {
      const env = j as TicketApiEnvelope;
      const t = env.ticket;
      if (!t || typeof t.id !== "number" || typeof t.displayNo !== "string" || typeof t.serviceId !== "number" || typeof t.status !== "string") return null;
      return {
        ticket: {
          id: t.id,
          displayNo: t.displayNo,
          serviceId: t.serviceId,
          status: t.status as TicketData["status"],
          name: t.name ?? null,
          token: t.token ?? fallbackToken ?? undefined,
        },
        waitingAhead: typeof env.waitingAhead === "number" ? env.waitingAhead : null,
      };
    }
    // raw form { id, displayNo, ... }
    const r = j as Partial<TicketData>;
    if (r && typeof r.id === "number" && typeof r.displayNo === "string" && typeof r.serviceId === "number" && typeof r.status === "string") {
      return {
        ticket: {
          id: r.id,
          displayNo: r.displayNo,
          serviceId: r.serviceId,
          status: r.status as TicketData["status"],
          name: r.name ?? null,
          token: r.token ?? fallbackToken ?? undefined,
        },
        waitingAhead: null,
      };
    }
    return null;
  }

  // read token from localStorage (client only)
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

  // fetch ticket + poll until terminal
  useEffect(() => {
    if (!token) return;
    let stop = false;

    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/tickets/${token}`, { cache: "no-store" });
        if (!r.ok) {
          setErr("ไม่พบคิว");
          // invalid → clear and go back
          try { localStorage.removeItem("sfaq:lastToken"); } catch {}
          router.replace("/ticket");
          return;
        }
        const j = await r.json();
        const normalized = normalizeTicketResponse(j, token);
        if (!normalized) {
          setErr("ข้อมูลคิวไม่ถูกต้อง");
          setLoading(false);
          return;
        }
        setData(normalized.ticket);
        setWaitingAhead(normalized.waitingAhead);
        setErr(null);
        setLoading(false);
        const d = normalized.ticket;
        if (d.status === "SERVED" || d.status === "SKIPPED" || d.status === "CANCELED") {
          try { localStorage.removeItem("sfaq:lastToken"); } catch {}
          // stay to show final state, but stop polling
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
        const normalized2 = normalizeTicketResponse(j2, token);
        if (!normalized2) return;
        setData(normalized2.ticket);
        setWaitingAhead(normalized2.waitingAhead);
        const d2 = normalized2.ticket;
        if (d2.status === "SERVED" || d2.status === "SKIPPED" || d2.status === "CANCELED") {
          try { localStorage.removeItem("sfaq:lastToken"); } catch {}
          stop = true;
          clearInterval(iv);
        }
      } catch {}
    }, 10000);

    return () => clearInterval(iv);
  }, [token, router]);

  return (
    <main className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">คิวของฉัน</h1>

      {loading && <div>กำลังโหลด...</div>}
      {err && <div className="text-red-600">{err}</div>}

      {data && (
        <div className="space-y-3">
          <div className="border rounded p-4">
            <div className="opacity-70 text-sm">หมายเลขคิวของคุณ</div>
            <div className="text-4xl font-bold">{data.displayNo}</div>
            <div className="opacity-80">{data.name ?? ""}</div>
          </div>
          <div className="border rounded p-4">
            <div className="opacity-70 text-sm">สถานะ</div>
            <div className="text-xl font-semibold">{data.status}</div>
          </div>
          {waitingAhead !== null && (
            <div className="border rounded p-4">
              <div className="opacity-70 text-sm">เหลือก่อนหน้าคุณ</div>
              <div className="text-xl font-semibold">{waitingAhead} คิว</div>
            </div>
          )}
          <div className="text-sm opacity-70">
            เก็บลิงก์หน้านี้ไว้กลับมาดูสถานะได้ตลอด หากปิดหน้าไปแล้วระบบจะจำคิวของคุณจนกว่าคิวจะเสร็จ/ถูกข้าม/ยกเลิก
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 border rounded"
              onClick={async () => {
                if (!token) return;
                const ok = confirm("ยืนยันยกเลิกคิว?");
                if (!ok) return;
                const r = await fetch(`/api/tickets/${token}`, { method: "DELETE" });
                if (r.ok) {
                  try { localStorage.removeItem("sfaq:lastToken"); } catch {}
                  router.replace("/ticket");
                }
              }}
              disabled={!token || (data.status !== "WAITING" && data.status !== "CALLED")}
            >
              ยกเลิกคิว
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
