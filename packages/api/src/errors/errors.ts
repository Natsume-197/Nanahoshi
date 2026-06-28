import { AppError } from "./AppError";

export class NotFoundError extends AppError {
	readonly code = "NOT_FOUND";
	readonly title = "Not Found";
	readonly status = 404;
}

export class UnauthorizedError extends AppError {
	readonly code = "UNAUTHORIZED";
	readonly title = "Unauthorized";
	readonly status = 401;
}

export class ForbiddenError extends AppError {
	readonly code = "FORBIDDEN";
	readonly title = "Forbidden";
	readonly status = 403;
}

export class BadRequestError extends AppError {
	readonly code = "BAD_REQUEST";
	readonly title = "Bad Request";
	readonly status = 400;
}

export class ConflictError extends AppError {
	readonly code = "CONFLICT";
	readonly title = "Conflict";
	readonly status = 409;
}

export class TooManyRequestsError extends AppError {
	readonly code = "TOO_MANY_REQUESTS";
	readonly title = "Too Many Requests";
	readonly status = 429;
}

export class InternalServerError extends AppError {
	readonly code = "INTERNAL_SERVER_ERROR";
	readonly title = "Internal Server Error";
	readonly status = 500;
}
