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
exports.TrainerRequestsController = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let TrainerRequestsController = class TrainerRequestsController {
    constructor(pool) {
        this.pool = pool;
    }
    async ensureTrainerRequestsTable() {
        if (!this.pool)
            return;
        await this.pool.query(`CREATE TABLE IF NOT EXISTS trainer_requests (
        id uuid PRIMARY KEY,
        full_name text NOT NULL,
        email text NOT NULL,
        phone text,
        gym_name text,
        city text,
        message text,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz DEFAULT now()
      )`);
        await this.pool.query(`CREATE INDEX IF NOT EXISTS trainer_requests_email_idx ON trainer_requests (LOWER(email))`);
        await this.pool.query(`CREATE INDEX IF NOT EXISTS trainer_requests_status_idx ON trainer_requests (status)`);
        await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS phone text`);
        await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS gym_name text`);
        await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS city text`);
        await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS message text`);
        await this.pool.query(`ALTER TABLE trainer_requests ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`);
    }
    async createTrainerRequest(body, res) {
        if (!this.pool)
            return res.status(500).json({ error: "Failed to submit trainer request" });
        try {
            await this.ensureTrainerRequestsTable();
            const name = String(body?.full_name || "").trim();
            const emailNorm = String(body?.email || "").trim().toLowerCase();
            if (!name || !emailNorm) {
                return res.status(400).json({ error: "Full name and email are required" });
            }
            const existingTrainer = await this.pool.query("SELECT id FROM users WHERE LOWER(email) = $1 AND role = 'admin' LIMIT 1", [emailNorm]);
            if (existingTrainer.rows[0]) {
                return res.status(409).json({
                    error: "This email is already onboarded as a trainer. Please use your login credentials."
                });
            }
            const pending = await this.pool.query("SELECT id FROM trainer_requests WHERE LOWER(email) = $1 AND status = 'pending' LIMIT 1", [emailNorm]);
            if (pending.rows[0]) {
                return res.status(409).json({
                    error: "A trainer request with this email is already pending review."
                });
            }
            await this.pool.query(`INSERT INTO trainer_requests (id, full_name, email, phone, gym_name, city, message, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`, [
                (0, crypto_1.randomUUID)(),
                name,
                emailNorm,
                String(body?.phone || "").trim(),
                String(body?.gym_name || "").trim(),
                String(body?.city || "").trim(),
                String(body?.message || "").trim()
            ]);
            return res.json({
                ok: true,
                message: "Request submitted. Superadmin will review and share your credentials."
            });
        }
        catch {
            return res.status(500).json({ error: "Failed to submit trainer request" });
        }
    }
};
exports.TrainerRequestsController = TrainerRequestsController;
__decorate([
    (0, common_1.Post)("trainer-requests"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TrainerRequestsController.prototype, "createTrainerRequest", null);
exports.TrainerRequestsController = TrainerRequestsController = __decorate([
    (0, common_1.Controller)("api"),
    __param(0, (0, common_1.Inject)("PG_POOL")),
    __metadata("design:paramtypes", [Object])
], TrainerRequestsController);
//# sourceMappingURL=trainer-requests.controller.js.map