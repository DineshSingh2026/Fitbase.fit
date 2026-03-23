import { Pool } from "pg";
import { AuthService } from "./auth.service";
import type { Response } from "express";
export declare class AuthController {
    private readonly pool;
    private readonly authService;
    constructor(pool: Pool | null, authService: AuthService);
    private getUserByEmail;
    private getUserById;
    login(body: {
        email?: string;
        password?: string;
    }, res: Response): Promise<Response<any, Record<string, any>>>;
    me(req: any): Promise<any>;
}
