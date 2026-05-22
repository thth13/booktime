import { NextResponse } from "next/server";
import { createAccount } from "@/lib/accounts";

export const runtime = "nodejs";

export async function POST() {
  try {
    return NextResponse.json(await createAccount());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
