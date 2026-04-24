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
      `CREATE TABLE IF NOT EXISTS audit_requests (
        id text PRIMARY KEY,
        first_name text NOT NULL,
        last_name text DEFAULT '',
        age integer,
        sex text DEFAULT '',
        email text NOT NULL,
        phone text DEFAULT '',
        country text DEFAULT '',
        city text DEFAULT '',
        occupation text DEFAULT '',
        work_intensity text DEFAULT '',
        fitness_experience text DEFAULT '',
        goals text DEFAULT '',
        motivation text DEFAULT '',
        status text DEFAULT 'pending',
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS contact_messages (
        id text PRIMARY KEY,
        user_id text,
        name text NOT NULL,
        phone text DEFAULT '',
        email text DEFAULT '',
        message text DEFAULT '',
        created_at timestamptz DEFAULT now()
      )`
    );

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

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS campaign_messages (
        id text PRIMARY KEY,
        day_of_week text NOT NULL,
        time_of_day text NOT NULL,
        message text NOT NULL,
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_campaign_messages_active ON campaign_messages (is_active, day_of_week, time_of_day)`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS campaign_send_log (
        id text PRIMARY KEY,
        campaign_id text,
        message text NOT NULL,
        sent_to integer DEFAULT 0,
        sent_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_campaign_send_log_sent_at ON campaign_send_log (sent_at DESC)`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS user_inbox (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        title text NOT NULL DEFAULT 'FitBase',
        body text NOT NULL,
        type text DEFAULT 'campaign',
        is_read boolean DEFAULT false,
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_user_inbox_user ON user_inbox (user_id, created_at DESC)`);

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS part2_audit (
        id text PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        mobile text DEFAULT '',
        sports_history text DEFAULT '',
        injuries text DEFAULT '',
        mental_health text DEFAULT '',
        gym_experience text DEFAULT '',
        food_choices text DEFAULT '',
        vices_addictions text DEFAULT '',
        goals text DEFAULT '',
        what_compelled text DEFAULT '',
        activity_level text DEFAULT '',
        created_at timestamptz DEFAULT now()
      )`
    );

    await this.ensureTribeMembersTable();
    await this.ensureClientActivityTables();
    await this.ensureNutritionTables();
  }

  /** workout_logs, daily_checkins, progress_logs, sunday_checkins — used by client dashboard APIs. */
  private async ensureClientActivityTables() {
    if (!this.pool) return;
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS workout_logs (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        workout_name text NOT NULL,
        duration_seconds integer DEFAULT 0,
        feedback text DEFAULT '',
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS daily_checkins (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        checkin_date date NOT NULL,
        steps integer,
        water_ml integer,
        protein_g integer,
        sleep_hours double precision,
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins (user_id, checkin_date)`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS progress_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        weight numeric(5,2),
        body_fat numeric(5,2),
        calories_intake integer,
        protein_intake integer,
        workout_completed boolean DEFAULT false,
        workout_type varchar(100),
        strength_bench numeric(6,2),
        strength_squat numeric(6,2),
        strength_deadlift numeric(6,2),
        sleep_hours numeric(3,1),
        water_intake numeric(4,1),
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_progress_logs_user_id ON progress_logs (user_id)`);
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS sunday_checkins (
        id text PRIMARY KEY,
        user_id text,
        full_name text NOT NULL,
        reply_email text NOT NULL DEFAULT '',
        plan text DEFAULT '',
        current_weight_waist_week text DEFAULT '',
        last_week_weight_waist text DEFAULT '',
        total_weight_loss text DEFAULT '',
        training_go text DEFAULT '',
        nutrition_go text DEFAULT '',
        sleep text DEFAULT '',
        occupation_stress text DEFAULT '',
        other_stress text DEFAULT '',
        differences_felt text DEFAULT '',
        achievements text DEFAULT '',
        improve_next_week text DEFAULT '',
        questions text DEFAULT '',
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(`ALTER TABLE sunday_checkins ADD COLUMN IF NOT EXISTS user_id text`);
    await this.pool.query(`ALTER TABLE sunday_checkins ADD COLUMN IF NOT EXISTS reply_email text DEFAULT ''`);

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS user_goals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        target_weight numeric,
        target_body_fat numeric,
        weekly_workout_target integer,
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals (user_id)`);

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS weight_logs (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        weight_kg double precision NOT NULL,
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_weight_logs_user_id ON weight_logs (user_id)`);

    await this.pool.query(`ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS workout_completed boolean DEFAULT true`);
    await this.pool.query(`ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS calories_burned integer`);
    await this.pool.query(`ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS session_date date`);
    await this.pool.query(`ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS workout_type text`);
  }

  /** Nutrition meal logging + daily aggregates (Nest /api/nutrition). */
  private async ensureNutritionTables() {
    if (!this.pool) return;
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS height_cm double precision`);

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS nutrition_meal_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        log_date date NOT NULL,
        meal_type text NOT NULL,
        portion_size text DEFAULT 'medium',
        manual_note text DEFAULT '',
        photo_data text,
        photo_mime text,
        photo_upload_count integer DEFAULT 0,
        ai_result jsonb DEFAULT '{}'::jsonb,
        ai_usage jsonb,
        meal_score integer,
        meal_confidence text,
        submitted_at timestamptz DEFAULT now(),
        notified_at timestamptz
      )`
    );
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS nutrition_meal_logs_user_date_meal_idx
       ON nutrition_meal_logs (user_id, log_date, meal_type)`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS nutrition_meal_logs_user_date_idx ON nutrition_meal_logs (user_id, log_date)`
    );

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS nutrition_daily_stats (
        user_id text NOT NULL,
        stats_date date NOT NULL,
        total_calories integer DEFAULT 0,
        total_protein integer DEFAULT 0,
        total_carbs integer DEFAULT 0,
        total_fat integer DEFAULT 0,
        total_fiber integer DEFAULT 0,
        calorie_goal integer DEFAULT 2000,
        protein_goal integer DEFAULT 150,
        calories_out integer DEFAULT 0,
        energy_difference integer DEFAULT 0,
        rmr_kcal integer,
        tef_kcal_est integer,
        total_out_est_kcal integer,
        energy_balance_est integer,
        weekly_avg_calories numeric(10,1),
        weekly_avg_protein numeric(10,1),
        meal_quality_score numeric(4,1),
        extra jsonb DEFAULT '{}'::jsonb,
        updated_at timestamptz DEFAULT now(),
        PRIMARY KEY (user_id, stats_date)
      )`
    );

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS nutrition_coin_events (
        idempotency_key text PRIMARY KEY,
        user_id text NOT NULL,
        coins integer NOT NULL,
        created_at timestamptz DEFAULT now()
      )`
    );
  }

  /** Matches Express server.js / trainer dashboard; required for approve-user and /api/tribe. */
  private async ensureTribeMembersTable() {
    if (!this.pool) return;
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS tribe_members (
        id text PRIMARY KEY,
        first_name text NOT NULL DEFAULT '',
        last_name text DEFAULT '',
        email text DEFAULT '',
        phone text DEFAULT '',
        city text DEFAULT '',
        phase integer DEFAULT 1,
        start_date text,
        activity_per_week integer DEFAULT 0,
        starting_weight double precision,
        current_weight double precision,
        target_weight double precision,
        next_checkin text DEFAULT '',
        notes text DEFAULT '',
        status text DEFAULT 'active',
        created_at timestamptz DEFAULT now()
      )`
    );
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS last_name text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS email text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS phone text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS city text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS phase integer DEFAULT 1`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS start_date text`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS activity_per_week integer DEFAULT 0`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS starting_weight double precision`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS current_weight double precision`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS target_weight double precision`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS next_checkin text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS notes text DEFAULT ''`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'`);
    await this.pool.query(`ALTER TABLE tribe_members ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`);
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
