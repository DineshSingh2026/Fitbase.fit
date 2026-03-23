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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
let NotificationsController = class NotificationsController {
    constructor(pool) {
        this.pool = pool;
    }
    async notifications(req, res) {
        if (!this.pool)
            return res.status(500).json([]);
        try {
            const notifications = [];
            const isAdmin = req.user?.role === "admin" || req.user?.role === "superadmin";
            if (isAdmin) {
                const pending = await this.pool.query("SELECT id, first_name, last_name, email, created_at FROM audit_requests WHERE status='pending' ORDER BY created_at DESC LIMIT 20");
                pending.rows.forEach((r) => {
                    notifications.push({
                        id: "audit-" + r.id,
                        type: "audit",
                        title: "New Body Audit Request",
                        desc: `${r.first_name} ${r.last_name} (${r.email})`,
                        time: r.created_at,
                        link: "requests"
                    });
                });
                const messages = await this.pool.query("SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 20");
                messages.rows.forEach((m) => {
                    const msg = String(m.message || "").substring(0, 50);
                    notifications.push({
                        id: "message-" + m.id,
                        type: "message",
                        title: "New Contact Message",
                        desc: `${m.name}: ${msg}${String(m.message || "").length > 50 ? "..." : ""}`,
                        time: m.created_at,
                        link: "messages"
                    });
                });
                const chatMessages = await this.pool.query(`SELECT m.id, m.thread_id, m.body, m.created_at, u.first_name, u.last_name, u.email
           FROM thread_messages m
           JOIN message_threads t ON t.id = m.thread_id
           LEFT JOIN users u ON u.id = t.user_id
           WHERE m.sender_role = 'user'
           ORDER BY m.created_at DESC LIMIT 50`);
                chatMessages.rows.forEach((m) => {
                    const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "User";
                    const preview = String(m.body || "").substring(0, 80) +
                        (String(m.body || "").length > 80 ? "..." : "");
                    notifications.push({
                        id: "chat-" + m.id,
                        type: "chat",
                        title: "Message from " + name,
                        desc: preview,
                        time: m.created_at,
                        link: "messages-meetings"
                    });
                });
                const tribe = await this.pool.query("SELECT id, first_name, last_name, created_at FROM tribe_members WHERE status='active' ORDER BY created_at DESC LIMIT 10");
                tribe.rows.forEach((t) => {
                    notifications.push({
                        id: "tribe-" + t.id,
                        type: "user",
                        title: "New Tribe Member",
                        desc: `${t.first_name} ${t.last_name} joined`,
                        time: t.created_at,
                        link: "tribe"
                    });
                });
                const workouts = await this.pool.query("SELECT w.id, w.workout_name, w.duration_seconds, w.created_at, u.first_name, u.last_name FROM workout_logs w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 20");
                workouts.rows.forEach((w) => {
                    const mins = Math.floor((Number(w.duration_seconds) || 0) / 60);
                    notifications.push({
                        id: "workout-" + w.id,
                        type: "workout",
                        title: "Workout Logged",
                        desc: `${w.first_name || ""} ${w.last_name || ""} - ${w.workout_name} (${mins} min)`,
                        time: w.created_at,
                        link: "workouts"
                    });
                });
                const pendingSignups = await this.pool.query("SELECT id, email, first_name, last_name, created_at FROM users WHERE role='user' AND (approval_status IS NULL OR approval_status = 'pending') ORDER BY created_at DESC LIMIT 20");
                pendingSignups.rows.forEach((u) => {
                    notifications.push({
                        id: "signup-" + u.id,
                        type: "user",
                        title: "New User Sign-up (Pending Approval)",
                        desc: `${u.first_name || ""} ${u.last_name || ""} (${u.email})`,
                        time: u.created_at,
                        link: "signups"
                    });
                });
                const part2Subs = await this.pool.query("SELECT id, name, email, created_at FROM part2_audit ORDER BY created_at DESC LIMIT 15");
                part2Subs.rows.forEach((p) => {
                    notifications.push({
                        id: "part2-" + p.id,
                        type: "audit",
                        title: "Part-2 Form Submitted",
                        desc: `${p.name} (${p.email})`,
                        time: p.created_at,
                        link: "part2"
                    });
                });
                const meetReqs = await this.pool.query("SELECT id, user_name, user_email, meeting_date, time_slot, created_at FROM meetings WHERE status='scheduled' ORDER BY created_at DESC LIMIT 15");
                meetReqs.rows.forEach((m) => {
                    notifications.push({
                        id: "meeting-" + m.id,
                        type: "audit",
                        title: "Call Scheduled",
                        desc: `${m.user_name || m.user_email} — ${m.meeting_date} ${m.time_slot}`,
                        time: m.created_at,
                        link: "meetings"
                    });
                });
                try {
                    const sundayRows = await this.pool.query(`SELECT s.id, s.full_name, s.reply_email, s.created_at, u.first_name, u.last_name
             FROM sunday_checkins s
             LEFT JOIN users u ON u.id = s.user_id
             ORDER BY s.created_at DESC LIMIT 25`);
                    sundayRows.rows.forEach((s) => {
                        const who = [s.first_name, s.last_name].filter(Boolean).join(" ") ||
                            s.full_name ||
                            s.reply_email ||
                            "User";
                        notifications.push({
                            id: "sunday-" + s.id,
                            type: "checkin",
                            title: "Sunday Check-in Submitted",
                            desc: who,
                            time: s.created_at,
                            link: "sundaycheckin"
                        });
                    });
                }
                catch { }
                try {
                    const dailyRows = await this.pool.query(`SELECT d.id, d.checkin_date, d.created_at, d.steps, d.water_ml, d.protein_g, d.sleep_hours,
                    u.first_name, u.last_name, u.email
             FROM daily_checkins d
             LEFT JOIN users u ON u.id = d.user_id
             ORDER BY d.created_at DESC LIMIT 30`);
                    dailyRows.rows.forEach((d) => {
                        const who = [d.first_name, d.last_name].filter(Boolean).join(" ") || d.email || "User";
                        const bits = [];
                        if (d.steps != null)
                            bits.push(`${d.steps} steps`);
                        if (d.water_ml != null)
                            bits.push(`${d.water_ml}ml water`);
                        if (d.protein_g != null)
                            bits.push(`${d.protein_g}g protein`);
                        if (d.sleep_hours != null)
                            bits.push(`${d.sleep_hours}h sleep`);
                        notifications.push({
                            id: "daily-" + d.id,
                            type: "checkin",
                            title: "Daily Check-in — " + who,
                            desc: (bits.length ? bits.join(" · ") : "Logged") + " · " + String(d.checkin_date || ""),
                            time: d.created_at,
                            link: "dailycheckin"
                        });
                    });
                }
                catch { }
                try {
                    const wlogs = await this.pool.query(`SELECT w.id, w.weight_kg, w.created_at, u.first_name, u.last_name
             FROM weight_logs w
             LEFT JOIN users u ON w.user_id = u.id
             ORDER BY w.created_at DESC LIMIT 20`);
                    wlogs.rows.forEach((w) => {
                        const who = [w.first_name, w.last_name].filter(Boolean).join(" ") || "User";
                        notifications.push({
                            id: "weight-" + w.id,
                            type: "workout",
                            title: "Weight Logged",
                            desc: `${who} — ${w.weight_kg} kg`,
                            time: w.created_at,
                            link: "clientprogress"
                        });
                    });
                }
                catch { }
                try {
                    const prog = await this.pool.query(`SELECT p.id, p.weight, p.body_fat, p.created_at, u.first_name, u.last_name
             FROM progress_logs p
             LEFT JOIN users u ON p.user_id = u.id
             ORDER BY p.created_at DESC LIMIT 25`);
                    prog.rows.forEach((p) => {
                        const who = [p.first_name, p.last_name].filter(Boolean).join(" ") || "User";
                        const parts = [];
                        if (p.weight != null)
                            parts.push(`${p.weight} kg`);
                        if (p.body_fat != null)
                            parts.push(`${p.body_fat}% bf`);
                        notifications.push({
                            id: "progress-" + String(p.id),
                            type: "workout",
                            title: "Progress Update — " + who,
                            desc: parts.length ? parts.join(", ") : "New entry",
                            time: p.created_at,
                            link: "clientprogress"
                        });
                    });
                }
                catch { }
                try {
                    const hyd = await this.pool.query(`SELECT h.id, h.amount_ml, h.glasses, h.created_at, u.first_name, u.last_name
             FROM hydration_logs h
             LEFT JOIN users u ON h.user_id = u.id
             ORDER BY h.created_at DESC LIMIT 15`);
                    hyd.rows.forEach((h) => {
                        const who = [h.first_name, h.last_name].filter(Boolean).join(" ") || "User";
                        const amt = h.amount_ml ? `${h.amount_ml} ml` : h.glasses ? `${h.glasses} glasses` : "Hydration";
                        notifications.push({
                            id: "hyd-" + h.id,
                            type: "checkin",
                            title: "Hydration Logged",
                            desc: `${who} — ${amt}`,
                            time: h.created_at,
                            link: "dailycheckin"
                        });
                    });
                }
                catch { }
            }
            else {
                const thread = await this.pool.query("SELECT id FROM message_threads WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1", [req.user.id]);
                if (thread.rows[0]) {
                    const adminMsgs = await this.pool.query("SELECT id, body, created_at FROM thread_messages WHERE thread_id = $1 AND sender_role = 'admin' ORDER BY created_at DESC LIMIT 10", [thread.rows[0].id]);
                    adminMsgs.rows.forEach((m) => {
                        const preview = String(m.body || "").substring(0, 60) +
                            (String(m.body || "").length > 60 ? "..." : "");
                        notifications.push({
                            id: "chat-" + m.id,
                            type: "chat",
                            title: "New message from Lifestyle Manager",
                            desc: preview,
                            time: m.created_at,
                            link: "messages"
                        });
                    });
                }
                const programAssignments = await this.pool.query(`SELECT a.id, a.assigned_at, p.name FROM user_program_assignments a
           JOIN programs p ON p.id = a.program_id
           WHERE a.user_id = $1 AND a.removed_at IS NULL AND a.seen_at IS NULL
           ORDER BY a.assigned_at DESC LIMIT 5`, [req.user.id]);
                programAssignments.rows.forEach((a) => {
                    notifications.push({
                        id: "program-" + a.id,
                        type: "program",
                        title: "Program Assigned",
                        desc: 'Your lifestyle manager assigned "' + (a.name || "") + '"',
                        time: a.assigned_at,
                        link: "programs"
                    });
                });
                try {
                    const inboxMsgs = await this.pool.query(`SELECT id, title, body, type, created_at FROM user_inbox
             WHERE user_id = $1 AND is_read = FALSE
             ORDER BY created_at DESC LIMIT 20`, [req.user.id]);
                    inboxMsgs.rows.forEach((m) => {
                        notifications.push({
                            id: "inbox-" + m.id,
                            type: "campaign",
                            title: m.title || "FitBase",
                            desc: String(m.body || "").substring(0, 120),
                            time: m.created_at,
                            link: null
                        });
                    });
                }
                catch { }
            }
            notifications.sort((a, b) => new Date(String(b.time || 0)).getTime() - new Date(String(a.time || 0)).getTime());
            const maxItems = isAdmin ? 150 : 40;
            return res.json(notifications.slice(0, maxItems));
        }
        catch {
            return res.json([]);
        }
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)("notifications"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "notifications", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, common_1.Controller)("api"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Inject)("PG_POOL")),
    __metadata("design:paramtypes", [Object])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map