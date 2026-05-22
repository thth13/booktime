import { NextResponse } from "next/server";
import { getAccountIdentifierFromRequest } from "@/lib/accounts";
import { deleteReadingSession, getBookSessions } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const accountIdentifier = getAccountIdentifierFromRequest(request);
    const bookId = new URL(request.url).searchParams.get("bookId");

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    if (!bookId) {
      return NextResponse.json({ error: "bookId is required." }, { status: 400 });
    }

    return NextResponse.json({ sessions: await getBookSessions({ accountIdentifier, bookId }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sessions.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string };
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    }

    return NextResponse.json(await deleteReadingSession({ accountIdentifier, sessionId: body.sessionId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete session.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
