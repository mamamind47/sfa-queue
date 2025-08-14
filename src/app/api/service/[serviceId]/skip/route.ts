// src/app/api/service/[serviceId]/skip/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { emitService } from "@/lib/events";
import { requireAuth } from "@/lib/auth-guard";
import type { NextRequest } from "next/server";


export async function POST(
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

  const svc = await prisma.service.findUnique({
    where: { id },
    include: { currentTicket: true },
  });
  if (!svc?.currentTicket) {
    return NextResponse.json({ error: "No current ticket" }, { status: 404 });
  }

  const skipped = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const t = await tx.ticket.update({
      where: { id: svc.currentTicket!.id },
      data: { status: "SKIPPED", skippedAt: new Date() },
      select: {
        id: true,
        displayNo: true,
        name: true,
        serviceId: true,
        status: true,
        skippedAt: true,
      },
    });
    // เคลียร์ current ออก เพื่อให้กด next เลือกใบต่อไปได้ทันที
    await tx.service.update({ where: { id }, data: { currentTicketId: null } });
    return t;
  });

  emitService(id, { type: "SKIP", current: skipped });
  return NextResponse.json({ current: skipped });
}