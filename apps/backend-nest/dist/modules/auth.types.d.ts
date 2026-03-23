export type UserRole = "user" | "admin" | "superadmin";
export interface AuthUser {
    id: string;
    email: string;
    role: UserRole;
    trainer_id?: string | null;
}
export interface JwtPayload extends AuthUser {
    iat?: number;
    exp?: number;
}
