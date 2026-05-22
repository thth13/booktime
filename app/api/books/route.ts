import { NextResponse } from "next/server";
import { addBook } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; author?: string };
    return NextResponse.json(
      await addBook({
        title: body.title ?? "",
        author: body.author ?? "",
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add book.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
