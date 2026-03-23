import type { Response } from "express";
import { Pool } from "pg";
export declare class AdminManagementController {
    private readonly pool;
    constructor(pool: Pool | null);
    private safeRows;
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
    auditRequests(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    sundayCheckins(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    dailyCheckins(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    dailyCheckinById(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    workouts(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    workoutById(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    part2Submissions(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    users(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    suspendUser(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    reactivateUser(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    recentActivity(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    performanceInsights(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
}
