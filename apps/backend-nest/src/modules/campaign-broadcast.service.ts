import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import { PushNotificationService } from "./push-notification.service";

@Injectable()
export class CampaignBroadcastService {
  constructor(
    @Inject("PG_POOL") private readonly pool: Pool | null,
    private readonly push: PushNotificationService
  ) {}

  /** Inbox + chat to all approved, non-suspended users; optional web push when VAPID is set. */
  async broadcastToAllActiveUsers(message: string): Promise<number> {
    if (!this.pool) return 0;
    const trimmed = String(message).trim();
    if (!trimmed) return 0;

    let users: { id: string; first_name?: string }[] = [];
    try {
      const r = await this.pool.query(
        `SELECT id::text AS id, first_name FROM users WHERE role = 'user'
         AND COALESCE(approval_status, 'approved') = 'approved'
         AND COALESCE(suspended, false) = false`
      );
      users = r.rows || [];
    } catch (e: any) {
      console.error("[Campaign] Failed to fetch active users:", e?.message || e);
      return 0;
    }

    if (!users.length) {
      console.log("[Campaign] No active users to broadcast to.");
      return 0;
    }

    const bodyForChat = trimmed.slice(0, 5000);
    let lifestyleManagerId: string | null = null;
    try {
      const adm = await this.pool.query(
        `SELECT id::text AS id FROM users WHERE role IN ('admin','superadmin') LIMIT 1`
      );
      if (adm.rows[0]?.id) lifestyleManagerId = String(adm.rows[0].id);
    } catch (e: any) {
      console.warn("[Campaign] Could not resolve admin for chat sender:", e?.message || e);
    }

    let inboxCount = 0;
    let chatCount = 0;

    for (const user of users) {
      const uid = String(user.id);
      try {
        await this.pool.query(
          `INSERT INTO user_inbox (id, user_id, title, body, type, created_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [randomUUID(), uid, "FitBase", trimmed, "campaign"]
        );
        inboxCount++;
      } catch (e: any) {
        console.warn(`[Campaign] Inbox insert failed for user ${uid}:`, e?.message || e);
      }

      void this.push.sendToUser(uid, {
        title: "FitBase",
        body: trimmed.slice(0, 160),
        url: "/dashboard",
        tag: "fitbase-campaign",
        badgeCount: 1
      });

      if (lifestyleManagerId) {
        try {
          const threads = await this.pool.query(
            `SELECT id FROM message_threads
             WHERE user_id = $1::uuid AND (thread_kind = 'client' OR thread_kind IS NULL)
             ORDER BY updated_at DESC LIMIT 1`,
            [uid]
          );
          let threadId: string | null = threads.rows[0]?.id ? String(threads.rows[0].id) : null;
          if (!threadId) {
            threadId = randomUUID();
            await this.pool.query(
              `INSERT INTO message_threads (id, user_id, subject, thread_kind) VALUES ($1, $2::uuid, $3, 'client')`,
              [threadId, uid, ""]
            );
          }
          const msgId = randomUUID();
          await this.pool.query(
            `INSERT INTO thread_messages (id, thread_id, sender_id, sender_role, body)
             VALUES ($1, $2::uuid, $3::uuid, $4, $5)`,
            [msgId, threadId, lifestyleManagerId, "admin", bodyForChat]
          );
          await this.pool.query(`UPDATE message_threads SET updated_at = now() WHERE id = $1::uuid`, [threadId]);
          chatCount++;
        } catch (e: any) {
          console.warn(`[Campaign] Chat insert failed for user ${uid}:`, e?.message || e);
        }
      }
    }

    try {
      await this.pool.query(`INSERT INTO campaign_send_log (id, message, sent_to, sent_at) VALUES ($1, $2, $3, now())`, [
        randomUUID(),
        trimmed.slice(0, 500),
        inboxCount
      ]);
    } catch {
      /* non-critical */
    }

    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    console.log(
      `[Campaign] Broadcast → inbox: ${inboxCount}/${users.length}, chat: ${chatCount}/${users.length} at ${nowIST} IST`
    );
    return inboxCount;
  }
}
