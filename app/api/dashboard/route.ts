import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getDashboard());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
