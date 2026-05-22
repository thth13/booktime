import "server-only";

import { ObjectId, type Db } from "mongodb";
import { getMongoClient } from "@/lib/mongodb";
import type { ActiveSessionView, BookStatus, BookView, DashboardView } from "@/lib/types";

type BookDoc = {
  _id: ObjectId;
  title: string;
  author: string;
  coverClass: string;
  status: BookStatus;
  totalSeconds: number;
  sessionsCount: number;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
};

type SessionDoc = {
  _id: ObjectId;
  bookId: ObjectId;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  startEventId: string;
  stopEventId?: string;
  createdAt: Date;
  updatedAt: Date;
};

const defaultBooks = [
  {
    title: "The Master and Margarita",
    author: "Mikhail Bulgakov",
    coverClass: "cover-1",
    totalSeconds: 5 * 3600 + 48 * 60,
    sessionsCount: 16,
    progress: 65,
    status: "reading" as const,
  },
  {
    title: "Flowers for Algernon",
    author: "Daniel Keyes",
    coverClass: "cover-2",
    totalSeconds: 3 * 3600 + 14 * 60,
    sessionsCount: 12,
    progress: 40,
    status: "reading" as const,
  },
  {
    title: "Meditations",
    author: "Marcus Aurelius",
    coverClass: "cover-3",
    totalSeconds: 1 * 3600 + 50 * 60,
    sessionsCount: 7,
    progress: 22,
    status: "reading" as const,
  },
  {
    title: "Steppenwolf",
    author: "Hermann Hesse",
    coverClass: "cover-4",
    totalSeconds: 8 * 3600 + 3 * 60,
    sessionsCount: 19,
    progress: 100,
    status: "finished" as const,
  },
];

async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB || "booktime");
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("books").createIndex({ createdAt: 1 }),
    db.collection("reading_sessions").createIndex({ endedAt: 1 }),
    db.collection("reading_sessions").createIndex({ bookId: 1, endedAt: 1 }),
    db.collection("reading_sessions").createIndex({ startEventId: 1 }, { unique: true }),
    db.collection("reading_sessions").createIndex({ stopEventId: 1 }, { sparse: true }),
  ]);
}

async function seedBooks(db: Db) {
  await ensureIndexes(db);
  const count = await db.collection<BookDoc>("books").countDocuments();

  if (count > 0) {
    return;
  }

  const now = new Date();
  await db.collection("books").insertMany(
    defaultBooks.map((book) => ({
      ...book,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

function asObjectId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new Error("Invalid book id.");
  }

  return new ObjectId(value);
}

function secondsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function sessionOverlapSeconds(session: SessionDoc, from: Date, to: Date): number {
  const end = session.endedAt ?? to;
  const overlapStart = new Date(Math.max(session.startedAt.getTime(), from.getTime()));
  const overlapEnd = new Date(Math.min(end.getTime(), to.getTime()));
  return secondsBetween(overlapStart, overlapEnd);
}

function activeElapsed(session: SessionDoc | null, now: Date): number {
  if (!session || session.endedAt) {
    return 0;
  }

  return secondsBetween(session.startedAt, now);
}

function toBookView(book: BookDoc, activeSession: SessionDoc | null, now: Date): BookView {
  const isActive = Boolean(activeSession && activeSession.bookId.equals(book._id));
  const totalSeconds = book.totalSeconds + (isActive ? activeElapsed(activeSession, now) : 0);

  return {
    id: book._id.toString(),
    title: book.title,
    author: book.author,
    coverClass: book.coverClass,
    status: book.status,
    totalSeconds,
    sessionsCount: book.sessionsCount,
    progress: book.progress,
    isActive,
  };
}

function toActiveView(session: SessionDoc | null): ActiveSessionView | null {
  if (!session) {
    return null;
  }

  return {
    id: session._id.toString(),
    bookId: session.bookId.toString(),
    startedAt: session.startedAt.toISOString(),
  };
}

export async function getDashboard(): Promise<DashboardView> {
  const db = await getDb();
  await seedBooks(db);

  const now = new Date();
  const weekStart = startOfWeek(now);
  const [books, activeSession, weekSessions] = await Promise.all([
    db.collection<BookDoc>("books").find({}).sort({ createdAt: 1 }).toArray(),
    db.collection<SessionDoc>("reading_sessions").findOne({ endedAt: null }, { sort: { startedAt: -1 } }),
    db
      .collection<SessionDoc>("reading_sessions")
      .find({
        startedAt: { $lte: now },
        $or: [{ endedAt: null }, { endedAt: { $gte: weekStart } }],
      })
      .toArray(),
  ]);

  const totalThisWeekSeconds = weekSessions.reduce(
    (sum, session) => sum + sessionOverlapSeconds(session, weekStart, now),
    0,
  );

  return {
    books: books.map((book) => toBookView(book, activeSession, now)),
    activeSession: toActiveView(activeSession),
    totalThisWeekSeconds,
    booksInProgress: books.filter((book) => book.status === "reading").length,
    serverNow: now.toISOString(),
  };
}

export async function startReading(input: {
  bookId: string;
  startedAt: string;
  eventId: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await seedBooks(db);

  const bookId = asObjectId(input.bookId);
  const startedAt = new Date(input.startedAt);

  if (Number.isNaN(startedAt.getTime())) {
    throw new Error("Invalid start timestamp.");
  }

  const existing = await db.collection<SessionDoc>("reading_sessions").findOne({
    startEventId: input.eventId,
  });

  if (existing) {
    return getDashboard();
  }

  const book = await db.collection<BookDoc>("books").findOne({ _id: bookId });
  if (!book) {
    throw new Error("Book was not found.");
  }

  const now = new Date();
  const activeSessions = await db
    .collection<SessionDoc>("reading_sessions")
    .find({ endedAt: null })
    .toArray();

  for (const session of activeSessions) {
    const endedAt = startedAt > session.startedAt ? startedAt : now;
    const durationSeconds = secondsBetween(session.startedAt, endedAt);
    await db.collection<SessionDoc>("reading_sessions").updateOne(
      { _id: session._id, endedAt: null },
      {
        $set: { endedAt, durationSeconds, updatedAt: now },
      },
    );
    await db.collection<BookDoc>("books").updateOne(
      { _id: session.bookId },
      {
        $inc: { totalSeconds: durationSeconds, sessionsCount: 1 },
        $set: { updatedAt: now },
      },
    );
  }

  try {
    await db.collection<SessionDoc>("reading_sessions").insertOne({
      _id: new ObjectId(),
      bookId,
      startedAt,
      endedAt: null,
      durationSeconds: null,
      startEventId: input.eventId,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    const duplicateKeyCode = 11000;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === duplicateKeyCode
    ) {
      return getDashboard();
    }
    throw error;
  }

  return getDashboard();
}

export async function stopReading(input: {
  bookId: string;
  stoppedAt: string;
  eventId: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await seedBooks(db);

  const bookId = asObjectId(input.bookId);
  const stoppedAt = new Date(input.stoppedAt);

  if (Number.isNaN(stoppedAt.getTime())) {
    throw new Error("Invalid stop timestamp.");
  }

  const existingStop = await db.collection<SessionDoc>("reading_sessions").findOne({
    stopEventId: input.eventId,
  });

  if (existingStop) {
    return getDashboard();
  }

  const activeSession = await db.collection<SessionDoc>("reading_sessions").findOne(
    {
      bookId,
      endedAt: null,
    },
    { sort: { startedAt: -1 } },
  );

  if (!activeSession) {
    return getDashboard();
  }

  const now = new Date();
  const endedAt = stoppedAt > activeSession.startedAt ? stoppedAt : now;
  const durationSeconds = secondsBetween(activeSession.startedAt, endedAt);

  await db.collection<SessionDoc>("reading_sessions").updateOne(
    { _id: activeSession._id, endedAt: null },
    {
      $set: {
        endedAt,
        durationSeconds,
        stopEventId: input.eventId,
        updatedAt: now,
      },
    },
  );

  await db.collection<BookDoc>("books").updateOne(
    { _id: activeSession.bookId },
    {
      $inc: { totalSeconds: durationSeconds, sessionsCount: 1 },
      $set: { updatedAt: now },
    },
  );

  return getDashboard();
}

export async function addBook(input: {
  title: string;
  author: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await seedBooks(db);

  const title = input.title.trim();
  const author = input.author.trim();

  if (!title || !author) {
    throw new Error("Title and author are required.");
  }

  const now = new Date();
  const coverClass = `cover-${(await db.collection<BookDoc>("books").countDocuments()) % 4 + 1}`;

  await db.collection<BookDoc>("books").insertOne({
    _id: new ObjectId(),
    title,
    author,
    coverClass,
    status: "reading",
    totalSeconds: 0,
    sessionsCount: 0,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  });

  return getDashboard();
}
