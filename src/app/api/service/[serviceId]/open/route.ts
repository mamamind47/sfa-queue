// src/app/api/service/[serviceId]/open/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import type { NextRequest } from "next/server";

export async function PATCH(
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

  const body = (await req.json()) as { isOpen?: boolean };
  if (typeof body.isOpen !== "boolean") {
    return NextResponse.json(
      { error: "isOpen (boolean) required" },
      { status: 400 }
    );
  }

  const updated = await prisma.service.update({
    where: { id },
    data: { isOpen: body.isOpen },
    select: { id: true, code: true, name: true, isOpen: true },
  });

  return NextResponse.json(updated);
}