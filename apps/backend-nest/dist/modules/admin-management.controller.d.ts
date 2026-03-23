import type { Response } from "express";
import { Pool } from "pg";
export declare class AdminManagementController {
    private readonly pool;
    constructor(pool: Pool | null);
    pendingSignups(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    approveUser(id: string, body: {
        trainer_id?: string;
    }, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    rejectUser(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    pendingSignupById(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    createClient(body: {
        email?: string;
        password?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        country?: string;
        timezone?: string;
        trainer_id?: string;
    }, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    users(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    suspendUser(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    reactivateUser(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    recentActivity(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    performanceInsights(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
}
