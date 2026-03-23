import type { Response } from "express";
import { Pool } from "pg";
export declare class StatsController {
    private readonly pool;
    constructor(pool: Pool | null);
    private safeCount;
    stats(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
}
