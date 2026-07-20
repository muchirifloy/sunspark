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
export function errorHandler(error, _request, response, _next) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError
        ? error.message
        : error instanceof Error && status < 500
            ? error.message
            : "Something went wrong. Please try again.";
    if (status >= 500) {
        console.error(error);
    }
    response.status(status).json({ message });
}
