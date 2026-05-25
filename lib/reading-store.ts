import "server-only";

import { ObjectId, type Db } from "mongodb";
import { ensureAccountIndexes, requireAccount } from "@/lib/accounts";
import { getMongoClient } from "@/lib/mongodb";
import type {
  ActiveSessionView,
  BookStatus,
  BookView,
  DashboardView,
  FinishedBooksView,
  FinishedBookView,
  ReadingSessionView,
  ReadingStatisticsView,
} from "@/lib/types";

type BookDoc = {
  _id: ObjectId;
  accountId: ObjectId;
  title: string;
  author: string;
  coverClass: string;
  status: BookStatus;
  totalSeconds: number;
  sessionsCount: number;
  progress: number;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SessionDoc = {
  _id: ObjectId;
  accountId: ObjectId;
  bookId: ObjectId;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  startEventId: string;
  stopEventId?: string;
  createdAt: Date;
  updatedAt: Date;
};

async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB || "booktime");
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    ensureAccountIndexes(db),
    db.collection("books").createIndex({ accountId: 1, createdAt: 1 }),
    db.collection("books").createIndex({ accountId: 1, status: 1, finishedAt: -1 }),
    db.collection("reading_sessions").createIndex({ accountId: 1, endedAt: 1 }),
    db.collection("reading_sessions").createIndex({ accountId: 1, bookId: 1, endedAt: 1 }),
    db.collection("reading_sessions").createIndex({ accountId: 1, startEventId: 1 }, { unique: true }),
    db.collection("reading_sessions").createIndex({ accountId: 1, stopEventId: 1 }, { sparse: true }),
  ]);
}

async function prepareDatabase(db: Db) {
  await ensureIndexes(db);
}

function asObjectId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new Error("Invalid book id.");
  }

  return new ObjectId(value);
}

function asSessionObjectId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new Error("Invalid session id.");
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

function startOfDay(date: Date): Date {
  const start = new Date(date);
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

function toReadingSessionView(session: SessionDoc, now: Date): ReadingSessionView {
  const isActive = !session.endedAt;

  return {
    id: session._id.toString(),
    bookId: session.bookId.toString(),
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    durationSeconds: isActive ? activeElapsed(session, now) : session.durationSeconds ?? 0,
    isActive,
  };
}

function toFinishedBookView(book: BookDoc): FinishedBookView {
  return {
    id: book._id.toString(),
    title: book.title,
    author: book.author,
    coverClass: book.coverClass,
    totalSeconds: book.totalSeconds,
    sessionsCount: book.sessionsCount,
    finishedAt: (book.finishedAt ?? book.updatedAt).toISOString(),
  };
}

export async function getDashboard(accountIdentifier: string): Promise<DashboardView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(accountIdentifier);
  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const [books, activeSession, weekSessions] = await Promise.all([
    db.collection<BookDoc>("books").find({ accountId: account._id }).sort({ createdAt: 1 }).toArray(),
    db
      .collection<SessionDoc>("reading_sessions")
      .findOne({ accountId: account._id, endedAt: null }, { sort: { startedAt: -1 } }),
    db
      .collection<SessionDoc>("reading_sessions")
      .find({
        accountId: account._id,
        startedAt: { $lte: now },
        $or: [{ endedAt: null }, { endedAt: { $gte: weekStart } }],
      })
      .toArray(),
  ]);

  const totalThisWeekSeconds = weekSessions.reduce(
    (sum, session) => sum + sessionOverlapSeconds(session, weekStart, now),
    0,
  );
  const totalTodaySeconds = weekSessions.reduce(
    (sum, session) => sum + sessionOverlapSeconds(session, dayStart, now),
    0,
  );

  return {
    books: books.map((book) => toBookView(book, activeSession, now)),
    activeSession: toActiveView(activeSession),
    totalTodaySeconds,
    totalThisWeekSeconds,
    booksInProgress: books.filter((book) => book.status === "reading").length,
    serverNow: now.toISOString(),
  };
}

export async function getBookSessions(input: {
  accountIdentifier: string;
  bookId: string;
}): Promise<ReadingSessionView[]> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const bookId = asObjectId(input.bookId);

  const book = await db.collection<BookDoc>("books").findOne({ _id: bookId, accountId: account._id });
  if (!book) {
    throw new Error("Book was not found.");
  }

  const now = new Date();
  const sessions = await db
    .collection<SessionDoc>("reading_sessions")
    .find({ accountId: account._id, bookId })
    .sort({ startedAt: -1 })
    .toArray();

  return sessions.map((session) => toReadingSessionView(session, now));
}

export async function getReadingStatistics(input: {
  accountIdentifier: string;
  from: string;
  to: string;
}): Promise<ReadingStatisticsView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const from = new Date(input.from);
  const to = new Date(input.to);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new Error("Invalid statistics range.");
  }

  const now = new Date();
  const sessions = await db
    .collection<SessionDoc>("reading_sessions")
    .find({
      accountId: account._id,
      startedAt: { $lt: to },
      $or: [{ endedAt: null }, { endedAt: { $gt: from } }],
    })
    .sort({ startedAt: 1 })
    .toArray();

  return {
    sessions: sessions.map((session) => toReadingSessionView(session, now)),
    serverNow: now.toISOString(),
  };
}

export async function getFinishedBooks(accountIdentifier: string): Promise<FinishedBooksView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(accountIdentifier);
  const books = await db
    .collection<BookDoc>("books")
    .find({ accountId: account._id, status: "finished" })
    .toArray();

  return {
    books: books
      .map((book) => toFinishedBookView(book))
      .sort((first, second) => new Date(second.finishedAt).getTime() - new Date(first.finishedAt).getTime()),
  };
}

export async function updateFinishedBook(input: {
  accountIdentifier: string;
  bookId: string;
  title: string;
  author: string;
  finishedAt: string;
}): Promise<FinishedBooksView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const bookId = asObjectId(input.bookId);
  const title = input.title.trim();
  const author = input.author.trim();
  const finishedAt = new Date(input.finishedAt);

  if (!title || !author) {
    throw new Error("Title and author are required.");
  }

  if (Number.isNaN(finishedAt.getTime())) {
    throw new Error("Invalid finish timestamp.");
  }

  const result = await db.collection<BookDoc>("books").updateOne(
    { _id: bookId, accountId: account._id, status: "finished" },
    {
      $set: {
        title,
        author,
        finishedAt,
        updatedAt: new Date(),
      },
    },
  );

  if (!result.matchedCount) {
    throw new Error("Book was not found.");
  }

  return getFinishedBooks(input.accountIdentifier);
}

export async function deleteFinishedBook(input: {
  accountIdentifier: string;
  bookId: string;
}): Promise<FinishedBooksView> {
  await deleteBook(input);
  return getFinishedBooks(input.accountIdentifier);
}

export async function startReading(input: {
  accountIdentifier: string;
  bookId: string;
  startedAt: string;
  eventId: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const bookId = asObjectId(input.bookId);
  const startedAt = new Date(input.startedAt);

  if (Number.isNaN(startedAt.getTime())) {
    throw new Error("Invalid start timestamp.");
  }

  const existing = await db.collection<SessionDoc>("reading_sessions").findOne({
    accountId: account._id,
    startEventId: input.eventId,
  });

  if (existing) {
    return getDashboard(input.accountIdentifier);
  }

  const book = await db.collection<BookDoc>("books").findOne({ _id: bookId, accountId: account._id });
  if (!book) {
    throw new Error("Book was not found.");
  }

  const now = new Date();
  const activeSessions = await db
    .collection<SessionDoc>("reading_sessions")
    .find({ accountId: account._id, endedAt: null })
    .toArray();

  for (const session of activeSessions) {
    const endedAt = startedAt > session.startedAt ? startedAt : now;
    const durationSeconds = secondsBetween(session.startedAt, endedAt);
    await db.collection<SessionDoc>("reading_sessions").updateOne(
      { _id: session._id, accountId: account._id, endedAt: null },
      {
        $set: { endedAt, durationSeconds, updatedAt: now },
      },
    );
    await db.collection<BookDoc>("books").updateOne(
      { _id: session.bookId, accountId: account._id },
      {
        $inc: { totalSeconds: durationSeconds, sessionsCount: 1 },
        $set: { updatedAt: now },
      },
    );
  }

  try {
    await db.collection<SessionDoc>("reading_sessions").insertOne({
      _id: new ObjectId(),
      accountId: account._id,
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
      return getDashboard(input.accountIdentifier);
    }
    throw error;
  }

  return getDashboard(input.accountIdentifier);
}

export async function stopReading(input: {
  accountIdentifier: string;
  bookId: string;
  stoppedAt: string;
  eventId: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const bookId = asObjectId(input.bookId);
  const stoppedAt = new Date(input.stoppedAt);

  if (Number.isNaN(stoppedAt.getTime())) {
    throw new Error("Invalid stop timestamp.");
  }

  const existingStop = await db.collection<SessionDoc>("reading_sessions").findOne({
    accountId: account._id,
    stopEventId: input.eventId,
  });

  if (existingStop) {
    return getDashboard(input.accountIdentifier);
  }

  const activeSession = await db.collection<SessionDoc>("reading_sessions").findOne(
    {
      accountId: account._id,
      bookId,
      endedAt: null,
    },
    { sort: { startedAt: -1 } },
  );

  if (!activeSession) {
    return getDashboard(input.accountIdentifier);
  }

  const now = new Date();
  const endedAt = stoppedAt > activeSession.startedAt ? stoppedAt : now;
  const durationSeconds = secondsBetween(activeSession.startedAt, endedAt);

  await db.collection<SessionDoc>("reading_sessions").updateOne(
    { _id: activeSession._id, accountId: account._id, endedAt: null },
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
    { _id: activeSession.bookId, accountId: account._id },
    {
      $inc: { totalSeconds: durationSeconds, sessionsCount: 1 },
      $set: { updatedAt: now },
    },
  );

  return getDashboard(input.accountIdentifier);
}

export async function addBook(input: {
  accountIdentifier: string;
  title: string;
  author: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const title = input.title.trim();
  const author = input.author.trim();

  if (!title || !author) {
    throw new Error("Title and author are required.");
  }

  const now = new Date();
  const coverClass = `cover-${(await db.collection<BookDoc>("books").countDocuments({ accountId: account._id })) % 4 + 1}`;

  await db.collection<BookDoc>("books").insertOne({
    _id: new ObjectId(),
    accountId: account._id,
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

  return getDashboard(input.accountIdentifier);
}

export async function markBookFinished(input: {
  accountIdentifier: string;
  bookId: string;
  finishedAt: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const bookId = asObjectId(input.bookId);
  const finishedAt = new Date(input.finishedAt);

  if (Number.isNaN(finishedAt.getTime())) {
    throw new Error("Invalid finish timestamp.");
  }

  const book = await db.collection<BookDoc>("books").findOne({ _id: bookId, accountId: account._id });
  if (!book) {
    throw new Error("Book was not found.");
  }

  const now = new Date();
  const activeSession = await db.collection<SessionDoc>("reading_sessions").findOne(
    {
      accountId: account._id,
      bookId,
      endedAt: null,
    },
    { sort: { startedAt: -1 } },
  );

  const updates: Partial<Pick<BookDoc, "status" | "progress" | "finishedAt" | "updatedAt">> & {
    totalSeconds?: number;
    sessionsCount?: number;
  } = {
    status: "finished",
    progress: 100,
    finishedAt,
    updatedAt: now,
  };

  if (activeSession) {
    const endedAt = finishedAt > activeSession.startedAt ? finishedAt : now;
    const durationSeconds = secondsBetween(activeSession.startedAt, endedAt);

    await db.collection<SessionDoc>("reading_sessions").updateOne(
      { _id: activeSession._id, accountId: account._id, endedAt: null },
      {
        $set: {
          endedAt,
          durationSeconds,
          updatedAt: now,
        },
      },
    );

    updates.totalSeconds = book.totalSeconds + durationSeconds;
    updates.sessionsCount = book.sessionsCount + 1;
  }

  await db.collection<BookDoc>("books").updateOne(
    { _id: bookId, accountId: account._id },
    {
      $set: updates,
    },
  );

  return getDashboard(input.accountIdentifier);
}

export async function markBookReading(input: {
  accountIdentifier: string;
  bookId: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const bookId = asObjectId(input.bookId);

  const result = await db.collection<BookDoc>("books").updateOne(
    { _id: bookId, accountId: account._id },
    {
      $set: {
        status: "reading",
        progress: 0,
        updatedAt: new Date(),
      },
      $unset: {
        finishedAt: "",
      },
    },
  );

  if (!result.matchedCount) {
    throw new Error("Book was not found.");
  }

  return getDashboard(input.accountIdentifier);
}

export async function deleteBook(input: {
  accountIdentifier: string;
  bookId: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const bookId = asObjectId(input.bookId);

  const result = await db.collection<BookDoc>("books").deleteOne({ _id: bookId, accountId: account._id });
  if (!result.deletedCount) {
    throw new Error("Book was not found.");
  }

  await db.collection<SessionDoc>("reading_sessions").deleteMany({ accountId: account._id, bookId });

  return getDashboard(input.accountIdentifier);
}

export async function deleteReadingSession(input: {
  accountIdentifier: string;
  sessionId: string;
}): Promise<DashboardView> {
  const db = await getDb();
  await prepareDatabase(db);

  const account = await requireAccount(input.accountIdentifier);
  const sessionId = asSessionObjectId(input.sessionId);
  const session = await db.collection<SessionDoc>("reading_sessions").findOne({
    _id: sessionId,
    accountId: account._id,
  });

  if (!session) {
    throw new Error("Session was not found.");
  }

  await db.collection<SessionDoc>("reading_sessions").deleteOne({ _id: sessionId, accountId: account._id });

  if (session.endedAt) {
    const durationSeconds = session.durationSeconds ?? secondsBetween(session.startedAt, session.endedAt);
    const book = await db.collection<BookDoc>("books").findOne({ _id: session.bookId, accountId: account._id });

    if (book) {
      await db.collection<BookDoc>("books").updateOne(
        { _id: session.bookId, accountId: account._id },
        {
          $set: {
            totalSeconds: Math.max(0, book.totalSeconds - durationSeconds),
            sessionsCount: Math.max(0, book.sessionsCount - 1),
            updatedAt: new Date(),
          },
        },
      );
    }
  }

  return getDashboard(input.accountIdentifier);
}
