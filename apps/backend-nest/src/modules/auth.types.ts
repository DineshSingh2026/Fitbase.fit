export type UserRole = "user" | "admin" | "superadmin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  trainer_id?: string | null;
  /** Trainer accounts only — force password change after credential handoff */
  must_change_password?: boolean;
}

export interface JwtPayload extends AuthUser {
  iat?: number;
  exp?: number;
}
