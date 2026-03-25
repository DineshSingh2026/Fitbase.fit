import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import * as webpush from "web-push";

export type FitbasePushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** If set, service worker updates PWA icon badge (Chromium). */
  badgeCount?: number;
};

@Injectable()
export class PushNotificationService {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (pub && priv) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@fitbase.fit", pub, priv);
    }
  }

  isConfigured(): boolean {
    return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  }

  async ensureTable(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        endpoint text NOT NULL,
        p256dh text,
        auth text,
        created_at timestamptz DEFAULT now()
      )
    `);
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_idx ON push_subscriptions (user_id, endpoint)`
    );
    await this.pool.query(`CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id)`);
  }

  async saveSubscription(
    userId: string,
    sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  ): Promise<void> {
    if (!this.pool) return;
    await this.ensureTable();
    const endpoint = String(sub?.endpoint || "").trim();
    if (!endpoint) throw new Error("endpoint required");
    const p256dh = sub?.keys?.p256dh || null;
    const auth = sub?.keys?.auth || null;
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET
         p256dh = COALESCE(EXCLUDED.p256dh, push_subscriptions.p256dh),
         auth = COALESCE(EXCLUDED.auth, push_subscriptions.auth)`,
      [id, userId, endpoint, p256dh, auth]
    );
  }

  async removeSubscription(userId: string, endpoint?: string): Promise<void> {
    if (!this.pool) return;
    await this.ensureTable();
    if (endpoint && String(endpoint).trim()) {
      await this.pool.query(`DELETE FROM push_subscriptions WHERE user_id = $1::uuid AND endpoint = $2`, [
        userId,
        String(endpoint).trim()
      ]);
    } else {
      await this.pool.query(`DELETE FROM push_subscriptions WHERE user_id = $1::uuid`, [userId]);
    }
  }

  async sendToUser(userId: string, payload: FitbasePushPayload): Promise<void> {
    if (!this.isConfigured() || !this.pool) return;
    await this.ensureTable();
    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "/dashboard",
      tag: payload.tag || "fitbase",
      badgeCount: payload.badgeCount
    });
    const r = await this.pool.query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1::uuid`,
      [userId]
    );
    for (const row of r.rows || []) {
      if (!row.endpoint) continue;
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh || "", auth: row.auth || "" }
          },
          data,
          { TTL: 86400 }
        );
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 410 || code === 404) {
          await this.pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [row.endpoint]);
        }
      }
    }
  }
}
