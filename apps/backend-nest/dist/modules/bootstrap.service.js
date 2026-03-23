"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BootstrapService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const bcrypt = require("bcryptjs");
let BootstrapService = class BootstrapService {
    constructor(pool) {
        this.pool = pool;
    }
    async onModuleInit() {
        if (!this.pool)
            return;
        await this.ensureUsersTable();
        await this.ensureOperationalTables();
        const emailRaw = process.env.SUPERADMIN_EMAIL;
        const passRaw = process.env.SUPERADMIN_PASS;
        if (!emailRaw || !passRaw)
            return;
        const email = String(emailRaw).trim().toLowerCase();
        const passwordHash = bcrypt.hashSync(String(passRaw), 10);
        try {
            const existing = await this.pool.query("SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1", [email]);
            if (existing.rows[0]?.id) {
                await this.updateSuperadmin(email, passwordHash);
            }
            else {
                await this.insertSuperadmin(email, passwordHash);
            }
            console.log(`Superadmin bootstrap complete for ${email}`);
        }
        catch (err) {
            console.error("Superadmin bootstrap failed", err);
        }
    }
    async ensureUsersTable() {
        if (!this.pool)
            return;
        await this.pool.query(`CREATE TABLE IF NOT EXISTS users (
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
      )`);
        await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text`);
        await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status text`);
        await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended boolean DEFAULT false`);
        await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture text`);
        await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country text`);
        await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text`);
        await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_id uuid`);
        await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`);
    }
    async ensureOperationalTables() {
        if (!this.pool)
            return;
        await this.pool.query(`CREATE TABLE IF NOT EXISTS meetings (
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
      )`);
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
        await this.pool.query(`CREATE TABLE IF NOT EXISTS message_threads (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        subject text DEFAULT '',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )`);
        await this.pool.query(`CREATE TABLE IF NOT EXISTS thread_messages (
        id uuid PRIMARY KEY,
        thread_id uuid NOT NULL,
        sender_id uuid,
        sender_role text NOT NULL,
        body text NOT NULL,
        created_at timestamptz DEFAULT now()
      )`);
        await this.pool.query(`CREATE INDEX IF NOT EXISTS message_threads_user_idx ON message_threads (user_id, updated_at DESC)`);
        await this.pool.query(`CREATE INDEX IF NOT EXISTS thread_messages_thread_idx ON thread_messages (thread_id, created_at ASC)`);
    }
    async updateSuperadmin(email, passwordHash) {
        try {
            await this.pool.query(`UPDATE users
         SET role='superadmin',
             password=$1,
             first_name='Super',
             last_name='Admin',
             approval_status='approved',
             suspended=false
         WHERE LOWER(email) = $2`, [passwordHash, email]);
        }
        catch (err) {
            if (err?.code !== "42703")
                throw err;
            await this.pool.query(`UPDATE users
         SET role='superadmin',
             password=$1,
             first_name='Super',
             last_name='Admin'
         WHERE LOWER(email) = $2`, [passwordHash, email]);
        }
    }
    async insertSuperadmin(email, passwordHash) {
        try {
            await this.pool.query(`INSERT INTO users (id, email, password, first_name, last_name, role, approval_status, suspended)
         VALUES ($1, $2, $3, 'Super', 'Admin', 'superadmin', 'approved', false)`, [(0, crypto_1.randomUUID)(), email, passwordHash]);
        }
        catch (err) {
            if (err?.code !== "42703")
                throw err;
            await this.pool.query(`INSERT INTO users (id, email, password, first_name, last_name, role)
         VALUES ($1, $2, $3, 'Super', 'Admin', 'superadmin')`, [(0, crypto_1.randomUUID)(), email, passwordHash]);
        }
    }
};
exports.BootstrapService = BootstrapService;
exports.BootstrapService = BootstrapService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)("PG_POOL")),
    __metadata("design:paramtypes", [Object])
], BootstrapService);
//# sourceMappingURL=bootstrap.service.js.map