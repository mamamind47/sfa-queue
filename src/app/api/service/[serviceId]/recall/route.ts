// src/app/api/service/[serviceId]/recall/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  const current = {
    id: svc.currentTicket.id,
    displayNo: svc.currentTicket.displayNo,
    name: svc.currentTicket.name,
    serviceId: svc.currentTicket.serviceId,
    status: svc.currentTicket.status,
  };

  emitService(id, { type: "RECALL", current });
  return NextResponse.json({ current });
}