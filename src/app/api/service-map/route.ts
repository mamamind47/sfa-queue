// src/app/api/service-map/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code)
    return NextResponse.json({ error: "code required" }, { status: 400 });

  const svc = await prisma.service.findUnique({ where: { code } });
  if (!svc)
    return NextResponse.json({ error: "service not found" }, { status: 404 });

  return NextResponse.json({
    id: svc.id,
    code: svc.code,
    name: svc.name,
    isOpen: svc.isOpen,
  });
}
