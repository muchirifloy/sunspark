import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
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
