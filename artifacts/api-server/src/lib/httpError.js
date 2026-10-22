export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message) {
  return new HttpError(400, "VALIDATION_ERROR", message);
}

export function unauthorized(message = "Sign in to continue.") {
  return new HttpError(401, "UNAUTHORIZED", message);
}

export function notFound(message = "The requested record was not found.") {
  return new HttpError(404, "NOT_FOUND", message);
}

export function conflict(message) {
  return new HttpError(409, "CONFLICT", message);
}

export function parseInput(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field = firstIssue?.path?.join(".");
    const detail = firstIssue?.message ?? "Invalid request.";
    throw badRequest(field ? `${field}: ${detail}` : detail);
  }
  return parsed.data;
}
