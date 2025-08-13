"use client";
import { useEffect, useState, useCallback, useRef } from "react";

type Ticket = {
  id: number;
  displayNo: string;
  name?: string | null;
  serviceId: number;
  status: string;
};
type Svc = { id: number; code: string; name: string; isOpen: boolean };

async function call(id: number, path: string) {
  const res = await fetch(`/api/service/${id}/${path}`, { method: "POST" });
  if (res.status === 401) {
    alert("Unauthorized. Please login first.");
    window.location.href = "/staff/login";
    return;
  }
  if (!res.ok) {
    alert(await res.text());
  }
}

export default function Staff() {
  const [services, setServices] = useState<Svc[]>([]);
  const [active, setActive] = useState<Svc | null>(null);
  const [current, setCurrent] = useState<Ticket | null>(null);
  const [next, setNext] = useState<Ticket | null>(null);
  const [waiting, setWaiting] = useState<number>(0);

  const esRef = useRef<EventSource | null>(null);

  async function refreshState(serviceId: number) {
    try {
      const r = await fetch(`/api/service/${serviceId}/state`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setCurrent(j.current ?? null);
      setNext(j.next ?? null);
      setWaiting(typeof j.waiting === "number" ? j.waiting : 0);
    } catch {
      // ignore
    }
  }

  const canCurrent = !!current;           // actions that need a current ticket
  const canNext = !!next;                 // actions that need a next ticket
  const canServeNext = !!current && !!next; // actions that need both current and next

  const btnClass = (enabled: boolean) =>
    `px-3 py-2 border rounded ${enabled ? '' : 'opacity-50 cursor-not-allowed'}`;

  const subscribe = useCallback((id: number) => {
    // close previous SSE if exists
    if (esRef.current) {
      try { esRef.current.close(); } catch {}
      esRef.current = null;
    }

    const es = new EventSource(`/api/stream/${id}`);
    esRef.current = es;

    es.onmessage = async (ev) => {
      try {
        const p = JSON.parse(ev.data);

        if (typeof p.waiting === "number") {
          setWaiting(p.waiting);
        }

        if (p.type === "STATE") {
          setCurrent(p.current ? { ...p.current } : null);
          setNext(p.next ? { ...p.next } : null);
          if (typeof p.waiting === "number") setWaiting(p.waiting);
          return;
        }

        if (p.type === "NEXT") {
          setCurrent(p.current ? { ...p.current } : null);
          setNext(p.next ? { ...p.next } : null);
          if (typeof p.waiting !== "number") await refreshState(id);
        } else if (p.type === "RECALL") {
          setCurrent(p.current ? { ...p.current } : null);
        } else if (p.type === "SKIP") {
          // ถ้า server ส่งตัวที่ถูกข้ามมา ให้เคลียร์ current เดิม (ถ้าใช่ตัวเดียวกัน)
          setCurrent((prev) =>
            prev && p.current && prev.id === p.current.id ? null : prev
          );
          if (typeof p.waiting !== "number") await refreshState(id);
        } else if (p.type === "SERVED") {
          // เคลียร์ current ถ้าตรงกัน แล้วอัปเดต next
          setCurrent((prev) =>
            prev && p.served && prev.id === p.served.id ? null : prev
          );
          setNext(p.next ? { ...p.next } : null);
          if (typeof p.waiting !== "number") await refreshState(id);
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      // Let browser auto-reconnect; you can also handle errors here if needed
    };
  }, []);

  const selectService = useCallback(
    async (s: Svc) => {
      setActive(s);
      const r = await fetch(`/api/service/${s.id}/state`, { cache: "no-store" });
      const j = await r.json();
      setCurrent(j.current);
      setNext(j.next);
      setWaiting(j.waiting);
      subscribe(s.id);
      await refreshState(s.id);
    },
    [subscribe]
  );

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/services-list");
      const j = await r.json();
      setServices(j);
      if (j[0]) selectService(j[0]);
    })();
  }, [selectService]);


  useEffect(() => {
    return () => {
      if (esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
      }
    };
  }, []);


  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Staff Panel</h1>

      <div className="flex gap-2 flex-wrap">
        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => selectService(s)}
            className={`px-3 py-2 border rounded ${
              active?.id === s.id ? "bg-black text-white" : ""
            }`}
          >
            {s.code} – {s.name} {s.isOpen ? "" : "(ปิดรับคิว)"}
          </button>
        ))}
      </div>

      {active && (
        <div className="space-y-3">
          <div className="text-lg flex items-center gap-3 flex-wrap">
            <span>
              บริการ: <b>{active.code}</b> – {active.name} | รออยู่: <b>{waiting}</b>
            </span>
            <button
              onClick={() => window.open(`/display/${active.id}`, "_blank")}
              className="px-3 py-1 border rounded"
              title="เปิดหน้า Display ในแท็บใหม่"
            >
              เปิดหน้า Display
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <div className="border rounded p-4">
              <div className="opacity-70 text-sm">กำลังเรียก</div>
              <div className="text-4xl font-bold">
                {current?.displayNo ?? "—"}
              </div>
              <div>{current?.name ?? ""}</div>
            </div>
            <div className="border rounded p-4">
              <div className="opacity-70 text-sm">คิวถัดไป</div>
              <div className="text-4xl font-bold">{next?.displayNo ?? "—"}</div>
              <div>{next?.name ?? ''}</div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              className={btnClass(canNext)}
              disabled={!canNext}
              onClick={() => active && canNext && call(active.id, "next")}
            >
              Next
            </button>

            <button
              className={btnClass(canCurrent)}
              disabled={!canCurrent}
              onClick={() => active && canCurrent && call(active.id, "recall")}
            >
              Recall
            </button>

            <button
              className={btnClass(canCurrent)}
              disabled={!canCurrent}
              onClick={() => active && canCurrent && call(active.id, "skip")}
            >
              Skip
            </button>

            <button
              className={btnClass(canCurrent)}
              disabled={!canCurrent}
              onClick={() => active && canCurrent && call(active.id, "serve")}
            >
              Serve
            </button>

            <button
              className={btnClass(canServeNext)}
              disabled={!canServeNext}
              onClick={() => active && canServeNext && call(active.id, "serve-and-next")}
            >
              Serve & Next
            </button>

            <button
              className={btnClass(canServeNext)}
              disabled={!canServeNext}
              onClick={() => active && canServeNext && call(active.id, "skip-and-next")}
            >
              Skip & Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}