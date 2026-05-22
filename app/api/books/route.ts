import { NextResponse } from "next/server";
import { getAccountIdentifierFromRequest } from "@/lib/accounts";
import { addBook } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; author?: string };
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    return NextResponse.json(
      await addBook({
        accountIdentifier,
        title: body.title ?? "",
        author: body.author ?? "",
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add book.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
