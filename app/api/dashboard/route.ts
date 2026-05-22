import { NextResponse } from "next/server";
import { getAccountIdentifierFromRequest } from "@/lib/accounts";
import { getDashboard } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    return NextResponse.json(await getDashboard(accountIdentifier));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
