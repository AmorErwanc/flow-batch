/**
 * 统一响应壳包壳中间件
 * 拷贝自 shared/http-envelope/response-wrapper.reference.ts，路径清单从 path-constants 读。
 */
import type { FastifyInstance } from 'fastify'
import {
  RESPONSE_UNWRAPPED_EXACT_PATHS,
  RESPONSE_UNWRAPPED_PATH_PREFIXES,
  RESPONSE_WRAPPED_EXACT_PATHS,
  RESPONSE_WRAPPED_PATH_PREFIXES,
} from '../path-constants.js'

interface ResponseEnvelope {
  code: unknown
  message: unknown
  data: unknown
}

function isResponseEnvelope(payload: unknown): payload is ResponseEnvelope {
  if (!payload || typeof payload !== 'object') {
    return false
  }
  const record = payload as Record<string, unknown>
  return 'code' in record && 'message' in record && 'data' in record
}

export function registerResponseWrapper(app: FastifyInstance): void {
  app.addHook('preSerialization', async (request, reply, payload) => {
    if (reply.statusCode >= 400) {
      return payload
    }
    if (!shouldWrapResponse(request.url)) {
      return payload
    }
    if (isResponseEnvelope(payload)) {
      return payload
    }
    return {
      code: 0,
      message: 'ok',
      data: payload ?? null,
      serverTime: Date.now(),
      requestId: request.id,
    }
  })
}

function shouldWrapResponse(url: string): boolean {
  const path = url.split('?')[0] ?? url
  if (matchesPath(path, RESPONSE_UNWRAPPED_EXACT_PATHS, RESPONSE_UNWRAPPED_PATH_PREFIXES)) {
    return false
  }
  return matchesPath(path, RESPONSE_WRAPPED_EXACT_PATHS, RESPONSE_WRAPPED_PATH_PREFIXES)
}

function matchesPath(
  path: string,
  exactPaths: readonly string[],
  pathPrefixes: readonly string[],
): boolean {
  return exactPaths.includes(path) || pathPrefixes.some((prefix) => path.startsWith(prefix))
}
