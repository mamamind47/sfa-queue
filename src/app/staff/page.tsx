"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { SkipForward, RotateCcw, Check, StepForward } from "lucide-react";

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/staff/login";
  }
}

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
    `px-3 py-2 rounded-lg border shadow-sm flex items-center ${enabled ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`;

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
    <main className="p-4 md:p-6 space-y-6">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 py-3 px-4 md:px-6">
        <h1 className="text-2xl font-bold">Staff Panel</h1>
        <div className="flex gap-2 flex-wrap items-center">
          {active && (
            <button
              onClick={() => window.open(`/display/${active.id}`, "_blank")}
              className="px-3 py-1 border rounded hover:bg-gray-100"
              title="เปิดหน้า Display ในแท็บใหม่"
            >
              เปิดหน้า Display
            </button>
          )}
          <button
            onClick={() => logout()}
            className="px-3 py-1 border rounded hover:bg-gray-100"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>

      <div>
        <label className="block mb-2 font-semibold text-gray-700">เลือกบริการ</label>
        <div className="flex gap-3 flex-wrap">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => selectService(s)}
              className={`group rounded-xl border px-4 py-3 shadow-sm transition-colors duration-200 ${
                active?.id === s.id
                  ? "bg-black text-white border-black"
                  : "border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="font-semibold">{s.code} – {s.name}</div>
              {!s.isOpen && <div className="text-sm text-red-600">(ปิดรับคิว)</div>}
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div className="space-y-6 max-w-4xl">
          <div className="flex flex-wrap items-center gap-6">
            <div className="px-4 py-2 border rounded-lg shadow-sm bg-gray-50">
              <span className="font-semibold">บริการ:</span> <span>{active.code} – {active.name}</span>
            </div>
            <div className="px-4 py-2 border rounded-lg shadow-sm bg-gray-50">
              <span className="font-semibold">รออยู่:</span> <span>{waiting}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border p-6 flex flex-col items-center justify-center shadow-sm">
              <div className="opacity-70 text-sm mb-2">กำลังเรียก</div>
              <div className="text-6xl font-extrabold leading-none">{current?.displayNo ?? "—"}</div>
              <div className="text-2xl mt-2">{current?.name ?? ""}</div>
            </div>
            <div className="rounded-2xl border p-6 flex flex-col items-center justify-center shadow-sm">
              <div className="opacity-70 text-sm mb-2">คิวถัดไป</div>
              <div className="text-6xl font-extrabold leading-none">{next?.displayNo ?? "—"}</div>
              <div className="text-2xl mt-2">{next?.name ?? ''}</div>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              className={`${btnClass(canNext)} bg-blue-500 text-white hover:bg-blue-600`}
              disabled={!canNext}
              onClick={() => active && canNext && call(active.id, "next")}
            >
              <StepForward className="w-4 h-4 mr-1" />
              Next
            </button>

            <button
              className={`${btnClass(canCurrent)} bg-yellow-500 text-white hover:bg-yellow-600`}
              disabled={!canCurrent}
              onClick={() => active && canCurrent && call(active.id, "recall")}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Recall
            </button>

            <button
              className={`${btnClass(canCurrent)} bg-red-500 text-white hover:bg-red-600`}
              disabled={!canCurrent}
              onClick={() => active && canCurrent && call(active.id, "skip")}
            >
              <SkipForward className="w-4 h-4 mr-1" />
              Skip
            </button>

            <button
              className={`${btnClass(canCurrent)} bg-green-500 text-white hover:bg-green-600`}
              disabled={!canCurrent}
              onClick={() => active && canCurrent && call(active.id, "serve")}
            >
              <Check className="w-4 h-4 mr-1" />
              Serve
            </button>

            <button
              className={`${btnClass(canServeNext)} bg-green-600 text-white hover:bg-green-700`}
              disabled={!canServeNext}
              onClick={() => active && canServeNext && call(active.id, "serve-and-next")}
            >
              <Check className="w-4 h-4 mr-1" />
              Serve & Next
            </button>

            <button
              className={`${btnClass(canServeNext)} bg-red-600 text-white hover:bg-red-700`}
              disabled={!canServeNext}
              onClick={() => active && canServeNext && call(active.id, "skip-and-next")}
            >
              <SkipForward className="w-4 h-4 mr-1" />
              Skip & Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}