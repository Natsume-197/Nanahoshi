import type { Request, RequestHandler, Response } from "express";

import { libraryService } from "@/api/library/libraryService";
import { CreateLibraryInput } from "./libraryModel";

class LibraryController {
    public getLibraries: RequestHandler = async (_req: Request, res: Response) => {
        const serviceResponse = await libraryService.findAll();
        res.status(serviceResponse.statusCode).send(serviceResponse);
    };

    public getLibrary: RequestHandler = async (req: Request, res: Response) => {
        const id = Number.parseInt(req.params.id as string, 10);
        const serviceResponse = await libraryService.findById(id);
        res.status(serviceResponse.statusCode).send(serviceResponse);
    };

    public createLibrary: RequestHandler = async (req: Request, res: Response) => {
        const data: CreateLibraryInput = req.body;
        const serviceResponse = await libraryService.create(data);
        res.status(serviceResponse.statusCode).send(serviceResponse);
    };
    
}

export const libraryController = new LibraryController();
