import { Global, Module } from "@nestjs/common";
import { Pool } from "pg";

@Global()
@Module({
  providers: [
    {
      provide: "PG_POOL",
      useFactory: async () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) return null;
        const pool = new Pool({ connectionString });
        await pool.query("SELECT 1");
        return pool;
      }
    }
  ],
  exports: ["PG_POOL"]
})
export class DatabaseModule {}
