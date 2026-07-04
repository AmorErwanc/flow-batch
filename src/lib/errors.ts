/**
 * 错误体系 · BFF 版
 *
 * 从 ~/backend/shared/errors/reference.ts 拷贝 + BFF 扩展：
 *   - CONTENT_REJECTED：内容命中造梦次元风控（4291，跟限流复用数字码，前端 details.errorCode 分流）
 *   - API_KEY_INVALID：BFF 自己的 X-API-Key 无效（复用 AUTH_FAILED 数字码）
 *   - UPSTREAM_*：下游 studio/cyapi/llm-api 报错的细分（复用 UPSTREAM_FAILED 数字码）
 *
 * 分层设计：
 *   - 错误键（PublicErrorCode，字符串）：代码里抛错用，前端在 details.errorCode 里收到，做精细分流
 *   - 数字码（ApiErrorCode）：响应壳顶层 code，跨项目统一 8 个值
 */

export type ErrorDisplayStyle = 'toast' | 'page'

export const ApiErrorCode = {
  AUTH_FAILED: 4001,
  PARAM_INVALID: 4002,
  RESOURCE_NOT_FOUND: 4041,
  STATE_CONFLICT: 4091,
  RATE_LIMITED: 4291,
  INTERNAL_ERROR: 5001,
  NOT_IMPLEMENTED: 5011,
  UPSTREAM_FAILED: 5021,
} as const

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode]

export interface PublicErrorMeta {
  apiCode: ApiErrorCode
  httpStatus: number
  errStyle: ErrorDisplayStyle
}

/** 错误键集：包含 backend 通用启动集 + BFF 特有键 */
export const PUBLIC_ERROR_META = {
  // 通用（来自 shared/errors/reference.ts）
  UNAUTHORIZED: { apiCode: ApiErrorCode.AUTH_FAILED, httpStatus: 401, errStyle: 'toast' },
  FORBIDDEN: { apiCode: ApiErrorCode.AUTH_FAILED, httpStatus: 403, errStyle: 'toast' },
  BAD_REQUEST: { apiCode: ApiErrorCode.PARAM_INVALID, httpStatus: 400, errStyle: 'toast' },
  INVALID_ARGUMENT: { apiCode: ApiErrorCode.PARAM_INVALID, httpStatus: 400, errStyle: 'toast' },
  PAYLOAD_TOO_LARGE: { apiCode: ApiErrorCode.PARAM_INVALID, httpStatus: 413, errStyle: 'toast' },
  ROUTE_NOT_FOUND: { apiCode: ApiErrorCode.RESOURCE_NOT_FOUND, httpStatus: 404, errStyle: 'toast' },
  STATE_CONFLICT: { apiCode: ApiErrorCode.STATE_CONFLICT, httpStatus: 409, errStyle: 'toast' },
  RATE_LIMITED: { apiCode: ApiErrorCode.RATE_LIMITED, httpStatus: 429, errStyle: 'toast' },
  NOT_IMPLEMENTED: { apiCode: ApiErrorCode.NOT_IMPLEMENTED, httpStatus: 501, errStyle: 'page' },
  INTERNAL_SERVER_ERROR: { apiCode: ApiErrorCode.INTERNAL_ERROR, httpStatus: 500, errStyle: 'page' },
  UPSTREAM_TIMEOUT: { apiCode: ApiErrorCode.UPSTREAM_FAILED, httpStatus: 504, errStyle: 'toast' },
  UPSTREAM_ERROR: { apiCode: ApiErrorCode.UPSTREAM_FAILED, httpStatus: 502, errStyle: 'toast' },

  // BFF 特有
  API_KEY_INVALID: { apiCode: ApiErrorCode.AUTH_FAILED, httpStatus: 401, errStyle: 'toast' },
  DREAMA_TOKEN_MISSING: { apiCode: ApiErrorCode.AUTH_FAILED, httpStatus: 401, errStyle: 'toast' },
  DREAMA_TOKEN_INVALID: { apiCode: ApiErrorCode.AUTH_FAILED, httpStatus: 401, errStyle: 'toast' },
  CONTENT_REJECTED: { apiCode: ApiErrorCode.RATE_LIMITED, httpStatus: 400, errStyle: 'toast' },
  UPSTREAM_STUDIO_FAILED: { apiCode: ApiErrorCode.UPSTREAM_FAILED, httpStatus: 502, errStyle: 'toast' },
  UPSTREAM_CYAPI_FAILED: { apiCode: ApiErrorCode.UPSTREAM_FAILED, httpStatus: 502, errStyle: 'toast' },
  UPSTREAM_LLM_FAILED: { apiCode: ApiErrorCode.UPSTREAM_FAILED, httpStatus: 502, errStyle: 'toast' },
} as const satisfies Record<string, PublicErrorMeta>

export type PublicErrorCode = keyof typeof PUBLIC_ERROR_META

export const PUBLIC_ERROR_CODES = Object.keys(PUBLIC_ERROR_META) as PublicErrorCode[]

export function isPublicErrorCode(code: string): code is PublicErrorCode {
  return code in PUBLIC_ERROR_META
}

export function getPublicErrorMeta(errorCode: PublicErrorCode): PublicErrorMeta {
  return PUBLIC_ERROR_META[errorCode]
}

export function toApiErrorCode(errorCode: string): ApiErrorCode {
  return isPublicErrorCode(errorCode) ? PUBLIC_ERROR_META[errorCode].apiCode : ApiErrorCode.INTERNAL_ERROR
}

/** 5001 / 5021 默认允许前端重试 */
export function isRetryableApiError(apiCode: ApiErrorCode): boolean {
  return apiCode === ApiErrorCode.INTERNAL_ERROR || apiCode === ApiErrorCode.UPSTREAM_FAILED
}

export interface BizErrorOptions {
  cause?: unknown
  details?: Record<string, unknown>
  httpStatus?: number
  errStyle?: ErrorDisplayStyle
  /** true 时允许 httpStatus / errStyle 覆盖 META 表默认值 */
  overrideMeta?: boolean
}

export class BizError extends Error {
  public readonly code: PublicErrorCode
  public readonly httpStatus: number
  public readonly errStyle: ErrorDisplayStyle
  public readonly details: Record<string, unknown> | undefined

  constructor(code: PublicErrorCode, message: string, options: BizErrorOptions = {}) {
    const meta = getPublicErrorMeta(code)
    super(message, { cause: options.cause })
    this.name = new.target.name
    this.code = code
    this.httpStatus =
      options.overrideMeta && options.httpStatus !== undefined ? options.httpStatus : meta.httpStatus
    this.errStyle = options.overrideMeta && options.errStyle !== undefined ? options.errStyle : meta.errStyle
    this.details = options.details
  }
}

export function createInvalidParamsError(options: BizErrorOptions = {}): BizError {
  return new BizError('BAD_REQUEST', '请求参数不合法', options)
}
