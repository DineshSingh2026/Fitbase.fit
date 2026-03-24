/** Resolve Postgres URL from common host env patterns (Render, Neon, etc.). */
export function resolveDatabaseUrl(): string | undefined {
  const raw =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.PGURL ||
    "";
  const trimmed = String(raw).trim();
  if (trimmed) return trimmed;

  const host = process.env.PGHOST || process.env.POSTGRES_HOST;
  const user = process.env.PGUSER || process.env.POSTGRES_USER;
  const pass = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const db = process.env.PGDATABASE || process.env.POSTGRES_DB;
  const port = process.env.PGPORT || process.env.POSTGRES_PORT || "5432";
  if (host && user && db) {
    const enc = encodeURIComponent(String(pass ?? ""));
    const auth = pass !== undefined && pass !== "" ? `${user}:${enc}` : user;
    return `postgresql://${auth}@${host}:${port}/${db}`;
  }
  return undefined;
}

/** pg Pool SSL — Render/managed DBs often require TLS. */
export function sslOptionForConnectionString(connectionString: string): false | { rejectUnauthorized: boolean } {
  if (/sslmode=disable/i.test(connectionString)) return false;
  if (/sslmode=require|sslmode=no-verify|ssl=true/i.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  if (process.env.PGSSLMODE === "require") return { rejectUnauthorized: false };
  if (
    process.env.NODE_ENV === "production" &&
    /\.(render\.com|neon\.tech|amazonaws\.com)\b/i.test(connectionString)
  ) {
    return { rejectUnauthorized: false };
  }
  return false;
}
