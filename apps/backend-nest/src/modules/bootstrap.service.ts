import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";

@Injectable()
export class BootstrapService implements OnModuleInit {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  async onModuleInit() {
    if (!this.pool) return;
    await this.ensureUsersTable();
    await this.ensureOperationalTables();
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

  private async ensureUsersTable() {
    if (!this.pool) return;
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        email text UNIQUE NOT NULL,
        password text NOT NULL,
        first_name text,
        last_name text,
        phone text,
        role text NOT NULL DEFAULT 'user',
        approval_status text,
        suspended boolean DEFAULT false,
        profile_picture text,
        country text,
        timezone text,
        trainer_id uuid,
        created_at timestamptz DEFAULT now()
      )`
    );

    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status text`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended boolean DEFAULT false`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture text`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country text`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_id uuid`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS city text`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth text`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text`);
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp text`);
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users (referral_code) WHERE referral_code IS NOT NULL AND TRIM(referral_code) <> ''`
    );
  }

  private async ensureOperationalTables() {
    if (!this.pool) return;
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS meetings (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        user_name text,
        user_email text,
        user_phone text,
        meeting_date text,
        time_slot text,
        status text DEFAULT 'scheduled',
        notes text,
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS meetings_user_id_idx ON meetings (user_id)`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS meetings_status_idx ON meetings (status)`);
    await this.pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS user_name text`);
    await this.pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS user_email text`);
    await this.pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS user_phone text`);
    await this.pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_date text`);
    await this.pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS time_slot text`);
    await this.pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status text DEFAULT 'scheduled'`);
    await this.pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS notes text`);
    await this.pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`);

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS message_threads (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        subject text DEFAULT '',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS thread_messages (
        id uuid PRIMARY KEY,
        thread_id uuid NOT NULL,
        sender_id uuid,
        sender_role text NOT NULL,
        body text NOT NULL,
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS message_threads_user_idx ON message_threads (user_id, updated_at DESC)`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS thread_messages_thread_idx ON thread_messages (thread_id, created_at ASC)`
    );
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
