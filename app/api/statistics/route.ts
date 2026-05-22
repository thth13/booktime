import { NextResponse } from "next/server";
import { getAccountIdentifierFromRequest } from "@/lib/accounts";
import { getReadingStatistics } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";

    return NextResponse.json(await getReadingStatistics({ accountIdentifier, from, to }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load reading statistics.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
