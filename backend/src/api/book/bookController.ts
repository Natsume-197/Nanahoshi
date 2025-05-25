import type { Request, RequestHandler, Response } from "express";
import { bookService } from "./bookService";
import { CreateBookInput } from "./bookModel";

class BookController {
    public getBook: RequestHandler = async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        const serviceResponse = await bookService.findById(id);
        res.status(serviceResponse.statusCode).send(serviceResponse);
    };

    public createBook: RequestHandler = async (req: Request, res: Response) => {
        const data: CreateBookInput = req.body;
        const serviceResponse = await bookService.create(data);
        res.status(serviceResponse.statusCode).send(serviceResponse);
    };

    public deleteBook: RequestHandler = async (req: Request, res: Response) => {
        const id = Number(req.params.id);
        const serviceResponse = await bookService.deleteById(id);
        res.status(serviceResponse.statusCode).send(serviceResponse);
    };

    public getBooksByLibrary: RequestHandler = async (req: Request, res: Response) => {
        const libraryId = Number(req.params.libraryId);
        const serviceResponse = await bookService.findByLibrary(libraryId);
        res.status(serviceResponse.statusCode).send(serviceResponse);
    };
}

export const bookController = new BookController();