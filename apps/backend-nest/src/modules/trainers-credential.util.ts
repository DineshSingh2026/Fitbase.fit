import type { PoolClient } from "pg";
import { randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";

export const TRAINER_STATUSES = ["pending", "approved", "rejected"] as const;
export type TrainerStatus = (typeof TRAINER_STATUSES)[number];

export function generateTempPassword(): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const L = "abcdefghjkmnpqrstuvwxyz";
  const D = "23456789";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return pick(U, 3) + pick(D, 3) + pick(L, 4);
}

export function slugifyNamePart(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function namePartsForTrainerCode(fullName: string): { first: string; last: string } {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: "trainer", last: "coach" };
  if (parts.length === 1) return { first: slugifyNamePart(parts[0]) || "trainer", last: "coach" };
  const first = slugifyNamePart(parts[0]) || "trainer";
  const last = slugifyNamePart(parts.slice(1).join("-")) || "coach";
  return { first, last };
}

export async function ensureUniqueTrainerCode(
  client: PoolClient,
  fullName: string
): Promise<string> {
  const { first, last } = namePartsForTrainerCode(fullName);
  for (let attempt = 0; attempt < 40; attempt++) {
    const n = Math.floor(1000 + Math.random() * 9000);
    const code = `${first}-${last}-${n}`;
    const dupT = await client.query("SELECT 1 FROM trainers WHERE LOWER(trainer_code) = LOWER($1) LIMIT 1", [
      code
    ]);
    if (dupT.rows[0]) continue;
    const dupU = await client.query(
      "SELECT 1 FROM users WHERE LOWER(TRIM(referral_code)) = LOWER($1) LIMIT 1",
      [code]
    );
    if (dupU.rows[0]) continue;
    return code;
  }
  return `${first}-${last}-${randomUUID().slice(0, 4)}`;
}

export async function ensureTrainersTableQueries(pool: {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trainers (
      id uuid PRIMARY KEY,
      full_name varchar(500) NOT NULL,
      email varchar(500) NOT NULL,
      phone varchar(200),
      gym_name varchar(500),
      city varchar(200),
      message text,
      status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      password_hash text,
      temp_password text,
      must_change_password boolean NOT NULL DEFAULT true,
      trainer_code varchar(120) UNIQUE,
      approved_at timestamptz,
      approved_by uuid,
      rejection_reason text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS trainers_email_lower_idx ON trainers (LOWER(email))`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS trainers_status_created_idx ON trainers (status, created_at DESC)`
  );
  await pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS rejection_reason text`);

  await pool.query(`
    INSERT INTO trainers (id, full_name, email, phone, gym_name, city, message, status, created_at)
    SELECT tr.id, tr.full_name, tr.email, tr.phone, tr.gym_name, tr.city, tr.message, tr.status, tr.created_at
    FROM trainer_requests tr
    WHERE NOT EXISTS (SELECT 1 FROM trainers t WHERE t.id = tr.id)
      AND tr.status IN ('pending', 'rejected')
  `);

  await pool.query(`
    INSERT INTO trainers (
      id, full_name, email, phone, gym_name, city, message, status, created_at,
      approved_at, password_hash, must_change_password, trainer_code, temp_password
    )
    SELECT tr.id, tr.full_name, tr.email, tr.phone, tr.gym_name, tr.city, tr.message, 'approved', tr.created_at,
      tr.reviewed_at, u.password, false, u.referral_code, NULL
    FROM trainer_requests tr
    JOIN users u ON u.id::text = tr.trainer_user_id
    WHERE tr.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM trainers t WHERE t.id = tr.id)
  `);
}
