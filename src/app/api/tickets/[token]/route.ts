// src/app/api/tickets/[token]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const t = await prisma.ticket.findUnique({ where: { token } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // เหลือกี่คิวก่อนหน้าเรา (นับ WAITING/CALLED ที่สร้างก่อนหน้าเรา)
  const waitingAhead = await prisma.ticket.count({
    where: {
      serviceId: t.serviceId,
      status: { in: ["WAITING", "CALLED"] },
      createdAt: { lt: t.createdAt },
    },
  });

  // คิวปัจจุบันของ service (id ticket)
  const svc = await prisma.service.findUnique({
    where: { id: t.serviceId },
    select: { currentTicketId: true },
  });

  return NextResponse.json(
    {
      ticket: {
        id: t.id,
        displayNo: t.displayNo,
        status: t.status,
        serviceId: t.serviceId,
        name: t.name,
      },
      waitingAhead,
      currentTicketId: svc?.currentTicketId ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

// ยกเลิกคิวตัวเอง (optional)
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const t = await prisma.ticket.findUnique({ where: { token } });
  if (!t) return NextResponse.json({ ok: true });
  await prisma.ticket.update({
    where: { id: t.id },
    data: { status: "CANCELED", canceledAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}