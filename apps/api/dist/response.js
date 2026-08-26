import { z } from "zod";
export class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}
export function asyncRoute(handler) {
    return (request, response, next) => {
        Promise.resolve(handler(request, response, next)).catch(next);
    };
}
/**
 * Rejected input is the caller's problem, not a server fault.
 *
 * Without this a validation failure answered 500 "Something went wrong", which was wrong
 * three times over: the caller could not tell what to correct, a mistyped field looked
 * identical to a real outage, and every bad request wrote a console.error - so the log
 * that should show genuine faults filled with ordinary typos instead.
 *
 * Only the validation message is returned, never the value that failed, so nothing a
 * caller submitted is reflected back to them.
 */
function validationMessage(error) {
    if (!(error instanceof z.ZodError))
        return null;
    const issue = error.issues[0];
    if (!issue)
        return "Check the details and try again.";
    const field = issue.path.filter((part) => typeof part === "string").join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
}
export function errorHandler(error, _request, response, _next) {
    const invalid = validationMessage(error);
    const status = invalid ? 400 : error instanceof HttpError ? error.status : 500;
    const message = invalid
        ?? (error instanceof HttpError
            ? error.message
            : error instanceof Error && status < 500
                ? error.message
                : "Something went wrong. Please try again.");
    if (status >= 500) {
        console.error(error);
    }
    response.status(status).json({ message });
}
