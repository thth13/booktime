import "server-only";

import { randomBytes } from "crypto";
import { ObjectId, type Db } from "mongodb";
import { getMongoClient } from "@/lib/mongodb";

export type AccountDoc = {
  _id: ObjectId;
  identifier: string;
  createdAt: Date;
  lastSeenAt: Date;
};

async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB || "booktime");
}

export async function ensureAccountIndexes(db: Db) {
  await db.collection("accounts").createIndex({ identifier: 1 }, { unique: true });
}

export function normalizeAccountIdentifier(identifier: string): string {
  return identifier.trim().toUpperCase().replace(/\s+/g, "");
}

function makeAccountIdentifier(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let token = "";

  for (const byte of bytes) {
    token += alphabet[byte % alphabet.length];
  }

  return `BT-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}`;
}

export async function createAccount(): Promise<{ identifier: string }> {
  const db = await getDb();
  await ensureAccountIndexes(db);

  const now = new Date();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const identifier = makeAccountIdentifier();

    try {
      await db.collection<AccountDoc>("accounts").insertOne({
        _id: new ObjectId(),
        identifier,
        createdAt: now,
        lastSeenAt: now,
      });

      return { identifier };
    } catch (error) {
      const duplicateKeyCode = 11000;
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === duplicateKeyCode
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to create a unique account identifier.");
}

export async function findAccount(identifier: string): Promise<AccountDoc | null> {
  const db = await getDb();
  await ensureAccountIndexes(db);

  const normalizedIdentifier = normalizeAccountIdentifier(identifier);
  if (!normalizedIdentifier) {
    return null;
  }

  const account = await db.collection<AccountDoc>("accounts").findOne({
    identifier: normalizedIdentifier,
  });

  if (!account) {
    return null;
  }

  await db.collection<AccountDoc>("accounts").updateOne(
    { _id: account._id },
    {
      $set: { lastSeenAt: new Date() },
    },
  );

  return account;
}

export async function requireAccount(identifier: string): Promise<AccountDoc> {
  const account = await findAccount(identifier);

  if (!account) {
    throw new Error("Account was not found.");
  }

  return account;
}

export function getAccountIdentifierFromRequest(request: Request): string {
  return request.headers.get("x-booktime-account") ?? "";
}
