import { Global, Module } from "@nestjs/common";
import { Pool } from "pg";
import { resolveDatabaseUrl, sslOptionForConnectionString } from "./database-url";

@Global()
@Module({
  providers: [
    {
      provide: "PG_POOL",
      useFactory: async () => {
        const connectionString = resolveDatabaseUrl();
        if (!connectionString) {
          console.error(
            "[database] No DATABASE_URL (or POSTGRES_URL / PG* parts). Set DATABASE_URL on Render for fitbase-backend-nest."
          );
          return null;
        }
        const sslOpt = sslOptionForConnectionString(connectionString);
        const pool = new Pool({
          connectionString,
          ssl: sslOpt === false ? undefined : sslOpt,
          max: 10,
          connectionTimeoutMillis: 20_000,
          idleTimeoutMillis: 30_000
        });
        try {
          await pool.query("SELECT 1");
        } catch (e: any) {
          console.error("[database] Connection test failed:", e?.message || e);
          await pool.end().catch(() => {});
          return null;
        }
        return pool;
      }
    }
  ],
  exports: ["PG_POOL"]
})
export class DatabaseModule {}
