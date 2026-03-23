import type { Response } from "express";
import { Pool } from "pg";
export declare class TrainerCompatController {
    private readonly pool;
    constructor(pool: Pool | null);
    private get secret();
    private signProgressReportToken;
    private verifyProgressReportToken;
    private safeRows;
    private assertTrainerCanAccessClient;
    clients(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    tribe(res: Response): Promise<Response<any, Record<string, any>>>;
    addTribe(body: any, res: Response): Promise<Response<any, Record<string, any>>>;
    meetings(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    createMeeting(body: any, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    meetingsForUser(userId: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    updateMeeting(id: string, body: any, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    adminUserProgress(userId: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    progressReportLink(userId: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    progressReport(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
}
