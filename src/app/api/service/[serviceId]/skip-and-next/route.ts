import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitService } from "@/lib/events";
import { requireAuth } from "@/lib/auth-guard";
import type { NextRequest } from "next/server";
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

  const { skipped, current, next } = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
    const svc = await tx.service.findUnique({
      where: { id },
      include: { currentTicket: true },
    });
    if (!svc?.currentTicket) throw new Error("No current ticket");

    const skipped = await tx.ticket.update({
      where: { id: svc.currentTicket.id },
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

    const nextWaiting = await tx.ticket.findFirst({
      where: { serviceId: id, status: "WAITING" },
      orderBy: { createdAt: "asc" },
    });

    if (!nextWaiting) {
      await tx.service.update({
        where: { id },
        data: { currentTicketId: null },
      });
      return { skipped, current: null, next: null };
    }

    await tx.service.update({
      where: { id },
      data: { currentTicketId: nextWaiting.id },
    });
    const called = await tx.ticket.update({
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

    const preview = await tx.ticket.findFirst({
      where: { serviceId: id, status: "WAITING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, displayNo: true, serviceId: true, status: true },
    });

    return { skipped, current: called, next: preview };
  });

  emitService(id, { type: "SKIP", current: skipped });
  if (current) {
    emitService(id, { type: "NEXT", current, next });
  }

  return NextResponse.json({ skipped, current, next });
}