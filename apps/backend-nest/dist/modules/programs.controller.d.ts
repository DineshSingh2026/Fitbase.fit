import type { Response } from "express";
import { Pool } from "pg";
export declare class ProgramsController {
    private readonly pool;
    constructor(pool: Pool | null);
    private get jwtSecret();
    private trainerCanAccessClient;
    markInboxRead(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    markAllInboxRead(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    programsLegacy(res: Response): Promise<Response<any, Record<string, any>>>;
    programCatalog(res: Response): Promise<Response<any, Record<string, any>>>;
    programsByUser(userId: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    assignProgram(body: {
        user_id?: string;
        program_id?: string;
    }, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    unassignProgram(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    mePrograms(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    meProgramUnseen(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    meProgramSeen(id: string, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    meProgramPdfToken(body: {
        program_id?: string;
    }, req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    meProgramPdf(req: any, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
