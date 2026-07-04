/**
 * 统一错误处理器（BizError / ZodError / Fastify 框架错误 → 统一错误壳）
 * 拷贝自 shared/http-envelope/error-handler.reference.ts，import 路径改成本项目。
 */
import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import {
  BizError,
  createInvalidParamsError,
  isRetryableApiError,
  toApiErrorCode,
  type ApiErrorCode,
  type ErrorDisplayStyle,
  type PublicErrorCode,
} from '../lib/errors.js'

export interface HttpClientError extends Error {
  code?: string
  statusCode?: number
}

export interface ErrorEnvelope {
  code: ApiErrorCode
  message: string
  data: null
  requestId: string
  details: {
    errorCode: string
    errStyle: ErrorDisplayStyle
    [key: string]: unknown
  }
  retryable: boolean
  serverTime: number
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof BizError) {
      void reply.status(error.httpStatus).send(toEnvelope(error, request.id))
      return
    }

    if (error instanceof ZodError) {
      const bizError = createInvalidParamsError({
        details: { issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) },
      })
      void reply.status(bizError.httpStatus).send(toEnvelope(bizError, request.id))
      return
    }

    if (isHttpClientError(error)) {
      const bizError = toBizErrorFromHttpClientError(error)
      request.log.warn({ error, request_id: request.id }, '客户端请求格式错误')
      void reply.status(bizError.httpStatus).send(toEnvelope(bizError, request.id))
      return
    }

    request.log.error({ error, request_id: request.id }, '未处理异常')
    void reply.status(500).send(
      buildErrorEnvelope({
        errorCode: 'INTERNAL_SERVER_ERROR',
        message: '服务内部错误',
        requestId: request.id,
        errStyle: 'page',
      }),
    )
  })
}

function toEnvelope(error: BizError, requestId: string): ErrorEnvelope {
  return buildErrorEnvelope({
    errorCode: error.code,
    message: error.message,
    requestId,
    errStyle: error.errStyle,
    ...(error.details !== undefined ? { details: error.details } : {}),
  })
}

export function buildErrorEnvelope(input: {
  errorCode: PublicErrorCode
  message: string
  requestId: string
  errStyle: ErrorDisplayStyle
  details?: Record<string, unknown>
}): ErrorEnvelope {
  const code = toApiErrorCode(input.errorCode)
  return {
    code,
    message: input.message,
    data: null,
    requestId: input.requestId,
    details: {
      errorCode: input.errorCode,
      errStyle: input.errStyle,
      ...input.details,
    },
    retryable: isRetryableApiError(code),
    serverTime: Date.now(),
  }
}

/* ─────────── Fastify 框架错误 → BizError 映射 ─────────── */

export function toBizErrorFromHttpClientError(error: HttpClientError): BizError {
  const code = typeof error.code === 'string' ? error.code : ''
  const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500

  if (isPayloadTooLargeErrorCode(code)) {
    return new BizError('PAYLOAD_TOO_LARGE', getPayloadTooLargeMessage(code), { cause: error })
  }
  if (code === 'FST_ERR_NOT_FOUND') {
    return new BizError('ROUTE_NOT_FOUND', '路由不存在', { cause: error })
  }
  if (isInvalidArgumentErrorCode(code) || statusCode === 400 || error instanceof SyntaxError) {
    return new BizError('INVALID_ARGUMENT', getClientErrorMessage(error), { cause: error })
  }
  if (statusCode >= 400 && statusCode < 500) {
    return new BizError('INVALID_ARGUMENT', getClientErrorMessage(error), { cause: error })
  }
  return new BizError('INTERNAL_SERVER_ERROR', '服务内部错误', { cause: error })
}

function isHttpClientError(error: unknown): error is HttpClientError & { statusCode: number } {
  if (!(error instanceof Error)) return false
  const statusCode = (error as HttpClientError).statusCode
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
}

function isPayloadTooLargeErrorCode(code: string): boolean {
  return [
    'FST_ERR_CTP_BODY_TOO_LARGE',
    'FST_REQ_FILE_TOO_LARGE',
    'FST_FILES_LIMIT',
    'FST_FIELDS_LIMIT',
    'FST_PARTS_LIMIT',
  ].includes(code)
}

function isInvalidArgumentErrorCode(code: string): boolean {
  return code === 'FST_ERR_BAD_URL' || code === 'FST_ERR_VALIDATION' || code.startsWith('FST_ERR_CTP_')
}

function getPayloadTooLargeMessage(code: string): string {
  return code === 'FST_REQ_FILE_TOO_LARGE' ? '上传文件超出大小限制' : '请求体超出大小限制'
}

function getClientErrorMessage(error: HttpClientError): string {
  if (error.code === 'FST_ERR_BAD_URL') {
    return '请求 URL 不合法'
  }
  if (error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
    return '请求体为空,请传 {} 或不带 Content-Type'
  }
  if (error.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || error instanceof SyntaxError) {
    return '请求体 JSON 格式无效'
  }
  return '请求参数无效'
}
