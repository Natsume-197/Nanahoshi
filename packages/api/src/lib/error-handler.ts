import { ORPCError } from "@orpc/server";
import { isAppError } from "../errors";
import { logger } from "./logger";

/** Postgres error codes we care about */
const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";
const PG_NOT_NULL_VIOLATION = "23502";

function isDrizzleConstraintError(
	error: unknown,
): error is Error & { code: string } {
	return (
		error instanceof Error &&
		"code" in error &&
		typeof (error as { code: unknown }).code === "string"
	);
}

/**
 * Maps an AppError status to the equivalent ORPCError code.
 */
function mapStatusToORPCCode(status: number) {
	switch (status) {
		case 400:
			return "BAD_REQUEST" as const;
		case 401:
			return "UNAUTHORIZED" as const;
		case 403:
			return "FORBIDDEN" as const;
		case 404:
			return "NOT_FOUND" as const;
		case 409:
			return "CONFLICT" as const;
		case 429:
			return "TOO_MANY_REQUESTS" as const;
		default:
			return "INTERNAL_SERVER_ERROR" as const;
	}
}

/**
 * Centralized oRPC error handler interceptor.
 *
 * Priority:
 * 1. ORPCError — already formatted correctly, just log if 5xx
 * 2. AppError — our typed domain errors, map to ORPCError with structured log
 * 3. Drizzle/Postgres constraint errors — map to CONFLICT (409)
 * 4. Unknown errors — log as error and return 500
 */
// Registered as a global interceptor in rpcHandler and apiHandler
export const errorHandlerInterceptor = async <T>(options: {
	next: () => Promise<T>;
}): Promise<T> => {
	try {
		return await options.next();
	} catch (error) {
		// 1. Already an oRPC error — oRPC handles serialization
		if (error instanceof ORPCError) {
			if (error.status >= 500) {
				logger.error({ err: error, code: error.code }, error.message);
			}
			throw error;
		}

		// 2. Our typed AppError
		if (isAppError(error)) {
			if (error.status >= 500) {
				logger.error(
					{ err: error, code: error.code, status: error.status },
					error.message,
				);
			} else {
				logger.warn({ code: error.code, status: error.status }, error.message);
			}
			throw new ORPCError(mapStatusToORPCCode(error.status), {
				message: error.message,
			});
		}

		// 3. Drizzle/Postgres constraint errors
		if (isDrizzleConstraintError(error)) {
			const code = (error as { code: string }).code;
			if (code === PG_UNIQUE_VIOLATION) {
				logger.warn(
					{ err: error, pgCode: code },
					"DB unique constraint violation",
				);
				throw new ORPCError("CONFLICT", {
					message: "A resource with this data already exists.",
				});
			}
			if (code === PG_FOREIGN_KEY_VIOLATION) {
				logger.warn(
					{ err: error, pgCode: code },
					"DB foreign key constraint violation",
				);
				throw new ORPCError("BAD_REQUEST", {
					message: "Referenced resource does not exist.",
				});
			}
			if (code === PG_NOT_NULL_VIOLATION) {
				logger.warn(
					{ err: error, pgCode: code },
					"DB not-null constraint violation",
				);
				throw new ORPCError("BAD_REQUEST", {
					message: "Required field is missing.",
				});
			}
		}

		// 4. Unknown / unhandled error
		logger.error({ err: error }, "Unhandled error");
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "An unexpected error occurred.",
		});
	}
};
