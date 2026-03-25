import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Req,
  ServiceUnavailableException,
  UseGuards
} from "@nestjs/common";
import { Pool } from "pg";
import { JwtAuthGuard } from "./jwt-auth.guard";

function getDataUrlBytes(dataUrl: string): number | null {
  const match = String(dataUrl || "").match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) return null;
  const base64 = match[2];
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function validateProfilePicture(profilePicture: unknown): string | null {
  if (profilePicture === undefined) return null;
  const value = String(profilePicture || "").trim();
  if (!value) return null;
  if (!/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(value)) {
    return "Please upload a valid image file.";
  }
  const bytes = getDataUrlBytes(value);
  if (!bytes) return "Could not process this image.";
  if (bytes > 5 * 1024 * 1024) return "Profile photo must be 5 MB or smaller.";
  return null;
}

@Controller("api")
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  private canAccess(req: { user?: { id?: string; role?: string } }, targetId: string): boolean {
    const role = String(req.user?.role || "");
    if (role === "admin" || role === "superadmin") return true;
    return String(req.user?.id || "") === String(targetId);
  }

  @Get("profile/:id")
  async getProfile(@Req() req: { user?: { id?: string; role?: string } }, @Param("id") id: string) {
    if (!this.pool) throw new ServiceUnavailableException("Database unavailable");
    if (!this.canAccess(req, id)) throw new ForbiddenException();
    const r = await this.pool.query(
      `SELECT id, email, first_name, last_name, phone, country, timezone, profile_picture, role, created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!r.rows[0]) throw new NotFoundException();
    return r.rows[0];
  }

  @Put("profile/:id")
  async putProfile(
    @Req() req: { user?: { id?: string; role?: string } },
    @Param("id") id: string,
    @Body()
    body: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      email?: string;
      profile_picture?: string;
      country?: string;
      timezone?: string;
    }
  ) {
    if (!this.pool) throw new ServiceUnavailableException("Database unavailable");
    if (!this.canAccess(req, id)) throw new ForbiddenException();

    const {
      first_name,
      last_name,
      phone,
      email,
      profile_picture,
      country,
      timezone
    } = body || {};

    const updates: string[] = [];
    const values: unknown[] = [];

    if (first_name !== undefined) {
      updates.push(`first_name = $${values.length + 1}`);
      values.push(String(first_name));
    }
    if (last_name !== undefined) {
      updates.push(`last_name = $${values.length + 1}`);
      values.push(String(last_name));
    }
    if (phone !== undefined) {
      updates.push(`phone = $${values.length + 1}`);
      values.push(String(phone));
    }
    if (country !== undefined) {
      updates.push(`country = $${values.length + 1}`);
      values.push(String(country || "").trim());
    }
    if (timezone !== undefined) {
      updates.push(`timezone = $${values.length + 1}`);
      values.push(String(timezone || "").trim());
    }
    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      const other = await this.pool.query(`SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2 LIMIT 1`, [
        emailNorm,
        id
      ]);
      if (other.rows[0]) throw new ConflictException("Email already in use");
      updates.push(`email = $${values.length + 1}`);
      values.push(emailNorm);
    }
    if (profile_picture !== undefined) {
      const err = validateProfilePicture(profile_picture);
      if (err) throw new BadRequestException(err);
      updates.push(`profile_picture = $${values.length + 1}`);
      values.push(String(profile_picture || "").trim());
    }

    if (updates.length === 0) throw new BadRequestException("No fields to update");

    values.push(id);
    await this.pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length}`, values);
    return { message: "Profile updated" };
  }
}
