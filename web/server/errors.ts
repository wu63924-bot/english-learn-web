export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'ORIGIN_NOT_ALLOWED'
  | 'UNAUTHORIZED'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'BUSY'
  | 'BUDGET_EXCEEDED'
  | 'AI_AUTH_ERROR'
  | 'AI_RATE_LIMIT'
  | 'AI_TIMEOUT'
  | 'AI_UNAVAILABLE'
  | 'AI_BAD_RESPONSE'
  | 'INTERNAL_ERROR';

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  ORIGIN_NOT_ALLOWED: 403,
  UNAUTHORIZED: 401,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  BUSY: 503,
  BUDGET_EXCEEDED: 402,
  AI_AUTH_ERROR: 502,
  AI_RATE_LIMIT: 429,
  AI_TIMEOUT: 504,
  AI_UNAVAILABLE: 502,
  AI_BAD_RESPONSE: 502,
  INTERNAL_ERROR: 500
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = STATUS[code];
  }
}
