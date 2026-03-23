import type { Response } from "express";
import { Pool } from "pg";
export declare class NotificationsController {
    private readonly pool;
    constructor(pool: Pool | null);
    notifications(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
}
