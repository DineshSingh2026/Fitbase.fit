import type { Response } from "express";
import { Pool } from "pg";
export declare class SuperadminController {
    private readonly pool;
    constructor(pool: Pool | null);
    private get secret();
    private signShareToken;
    private verifyShareToken;
    private safeRows;
    private safeCount;
    private getSuperadminDashboardData;
    dashboard(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    shareLink(body: {
        from?: string | null;
        to?: string | null;
        user_id?: string | null;
    }, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    shared(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    trainers(res: Response): Promise<Response<any, Record<string, any>>>;
    trainerClientOverview(res: Response): Promise<Response<any, Record<string, any>>>;
    trainerRequests(res: Response): Promise<Response<any, Record<string, any>>>;
    approveTrainerRequest(id: string, body: {
        password?: string;
    }, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    rejectTrainerRequest(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    createTrainer(body: {
        email?: string;
        password?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
    }, res: Response): Promise<Response<any, Record<string, any>>>;
    suspendTrainer(id: string, res: Response): Promise<Response<any, Record<string, any>>>;
    reactivateTrainer(id: string, res: Response): Promise<Response<any, Record<string, any>>>;
    resetTrainerPassword(id: string, body: {
        password?: string;
    }, res: Response): Promise<Response<any, Record<string, any>>>;
}
