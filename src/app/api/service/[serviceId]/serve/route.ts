// src/app/api/service/[serviceId]/serve/route.ts
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

  const served = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const t = await tx.ticket.update({
      where: { id: svc.currentTicket!.id },
      data: { status: "SERVED", servedAt: new Date() },
      select: {
        id: true,
        displayNo: true,
        name: true,
        serviceId: true,
        status: true,
        servedAt: true,
      },
    });
    await tx.service.update({ where: { id }, data: { currentTicketId: null } });
    return t;
  });

  const upcoming = await prisma.ticket.findFirst({
    where: { serviceId: id, status: "WAITING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, displayNo: true, serviceId: true, status: true },
  });

  emitService(id, { type: "SERVED", served, next: upcoming });
  return NextResponse.json({ served, next: upcoming });
}
