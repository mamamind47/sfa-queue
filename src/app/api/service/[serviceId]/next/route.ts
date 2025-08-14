// src/app/api/service/[serviceId]/next/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitService } from "@/lib/events";
import { requireAuth } from "@/lib/auth-guard";
import type { Prisma } from "@prisma/client";

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

  const nextWaiting = await prisma.ticket.findFirst({
    where: { serviceId: id, status: "WAITING" },
    orderBy: { createdAt: "asc" },
  });

  if (!nextWaiting) {
    return NextResponse.json({ error: "No waiting ticket" }, { status: 404 });
  }

  const current = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.service.update({
      where: { id },
      data: { currentTicketId: nextWaiting.id },
    });
    return tx.ticket.update({
      where: { id: nextWaiting.id },
      data: { status: "CALLED", calledAt: new Date() },
      select: {
        id: true,
        displayNo: true,
        name: true,
        serviceId: true,
        status: true,
        calledAt: true,
      },
    });
  });

  const upcoming = await prisma.ticket.findFirst({
    where: { serviceId: id, status: "WAITING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, displayNo: true, serviceId: true, status: true },
  });

  emitService(id, { type: "NEXT", current, next: upcoming });
  return NextResponse.json({ current, next: upcoming });
}