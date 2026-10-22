export function errorHandler(error, req, res, _next) {
  if (res.headersSent) return;

  let status = Number(error?.status) || 500;
  let code = error?.code || "INTERNAL_ERROR";
  let message = "The server could not complete the request.";

  if (error?.name === "ZodError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "The request did not match the expected format.";
  } else if (error?.name === "ValidationError" || error?.name === "CastError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "One or more provided values are invalid.";
  } else if (error?.code === 11000) {
    status = 409;
    code = "CONFLICT";
    message = "A record with those details already exists.";
  } else if (status < 500) {
    message = error.message || message;
  }

  if (status >= 500) {
    req.log?.error(
      { errorName: error?.name, errorCode: error?.code },
      "API request failed",
    );
  }

  res.status(status).json({ error: String(code), message });
}
