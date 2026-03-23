import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";

@Injectable()
export class BootstrapService implements OnModuleInit {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  async onModuleInit() {
    if (!this.pool) return;
    const emailRaw = process.env.SUPERADMIN_EMAIL;
    const passRaw = process.env.SUPERADMIN_PASS;
    if (!emailRaw || !passRaw) return;

    const email = String(emailRaw).trim().toLowerCase();
    const passwordHash = bcrypt.hashSync(String(passRaw), 10);

    try {
      const existing = await this.pool.query(
        "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1",
        [email]
      );
      if (existing.rows[0]?.id) {
        await this.updateSuperadmin(email, passwordHash);
      } else {
        await this.insertSuperadmin(email, passwordHash);
      }
      // Avoid leaking secrets, only log state.
      console.log(`Superadmin bootstrap complete for ${email}`);
    } catch (err) {
      console.error("Superadmin bootstrap failed", err);
    }
  }

  private async updateSuperadmin(email: string, passwordHash: string) {
    try {
      await this.pool!.query(
        `UPDATE users
         SET role='superadmin',
             password=$1,
             first_name='Super',
             last_name='Admin',
             approval_status='approved',
             suspended=false
         WHERE LOWER(email) = $2`,
        [passwordHash, email]
      );
    } catch (err: any) {
      if (err?.code !== "42703") throw err;
      await this.pool!.query(
        `UPDATE users
         SET role='superadmin',
             password=$1,
             first_name='Super',
             last_name='Admin'
         WHERE LOWER(email) = $2`,
        [passwordHash, email]
      );
    }
  }

  private async insertSuperadmin(email: string, passwordHash: string) {
    try {
      await this.pool!.query(
        `INSERT INTO users (id, email, password, first_name, last_name, role, approval_status, suspended)
         VALUES ($1, $2, $3, 'Super', 'Admin', 'superadmin', 'approved', false)`,
        [randomUUID(), email, passwordHash]
      );
    } catch (err: any) {
      if (err?.code !== "42703") throw err;
      await this.pool!.query(
        `INSERT INTO users (id, email, password, first_name, last_name, role)
         VALUES ($1, $2, $3, 'Super', 'Admin', 'superadmin')`,
        [randomUUID(), email, passwordHash]
      );
    }
  }
}
