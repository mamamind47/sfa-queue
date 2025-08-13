// src/app/api/service/[serviceId]/stats/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";

function parseDate(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ serviceId: string }> }
) {
  const gate = await requireAuth(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  const { serviceId } = await ctx.params;
  const id = Number(serviceId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid serviceId" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const fromParam = parseDate(searchParams.get("from"));
  const toParam = parseDate(searchParams.get("to"));

  // ช่วงเวลา: ถ้าไม่ระบุ ให้ default = ตั้งแต่เที่ยงคืนวันนี้ ถึง ตอนนี้
  const now = new Date();
  const start = fromParam ?? new Date(new Date(now).setHours(0, 0, 0, 0));
  const end = toParam ?? now;

  // ดึงข้อมูลเฉพาะช่วงเวลา (ตาม createdAt)
  const tickets = await prisma.ticket.findMany({
    where: {
      serviceId: id,
      createdAt: { gte: start, lte: end },
    },
    select: {
      status: true,
      createdAt: true,
      calledAt: true,
      servedAt: true,
    },
  });

  // นับตามสถานะ
  let total = 0;
  let waiting = 0;
  let called = 0;
  let served = 0;
  let skipped = 0;
  let canceled = 0;

  // เวลาเฉลี่ย:
  // - รอเรียก: calledAt - createdAt (สำหรับใบที่มี calledAt)
  // - ให้บริการ: servedAt - calledAt (สำหรับใบที่มี servedAt และ calledAt)
  let sumWaitMs = 0;
  let countWait = 0;
  let sumServiceMs = 0;
  let countService = 0;

  for (const t of tickets) {
    total += 1;
    switch (t.status) {
      case "WAITING":
        waiting += 1;
        break;
      case "CALLED":
        called += 1;
        break;
      case "SERVED":
        served += 1;
        break;
      case "SKIPPED":
        skipped += 1;
        break;
      case "CANCELED":
        canceled += 1;
        break;
      default:
        break;
    }

    if (t.calledAt) {
      sumWaitMs += t.calledAt.getTime() - t.createdAt.getTime();
      countWait += 1;
    }
    if (t.servedAt && t.calledAt) {
      sumServiceMs += t.servedAt.getTime() - t.calledAt.getTime();
      countService += 1;
    }
  }

  const avgWaitMs = countWait ? Math.round(sumWaitMs / countWait) : 0;
  const avgServiceMs = countService
    ? Math.round(sumServiceMs / countService)
    : 0;

  return NextResponse.json({
    serviceId: id,
    range: { from: start.toISOString(), to: end.toISOString() },
    counts: { total, waiting, called, served, skipped, canceled },
    averages: {
      wait_ms: avgWaitMs,
      wait_s: +(avgWaitMs / 1000).toFixed(1),
      service_ms: avgServiceMs,
      service_s: +(avgServiceMs / 1000).toFixed(1),
    },
  });
}