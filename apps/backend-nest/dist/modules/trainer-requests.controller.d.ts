import { Pool } from "pg";
import type { Response } from "express";
export declare class TrainerRequestsController {
    private readonly pool;
    constructor(pool: Pool | null);
    createTrainerRequest(body: {
        full_name?: string;
        email?: string;
        phone?: string;
        gym_name?: string;
        city?: string;
        message?: string;
    }, res: Response): Promise<Response<any, Record<string, any>>>;
}
