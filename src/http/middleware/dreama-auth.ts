/**
 * 造梦次元统一鉴权中间件 · 超级创作者版
 *
 * 校验良维每次调 BFF 时是否具备"超级创作者"权限：
 *   1. Authorization + Uid 双 header 必填
 *   2. 本地解析 JWT payload → 校验 authorities 里含 `ROLE_SUP_CREATOR`
 *   3. **不做 JWT 签名校验** —— 下游 studio/cyapi 调用会自然校验 token 真实性；
 *      伪造 authorities 也过不了下游那一步，BFF 层这里只做角色 gate
 *   4. 通过 → 把 { authorization, uid } 挂到 request.dreamaAuth 供下游 fetch 转发
 *
 * 参考 dream-agent `src/http/middleware/auth.ts` 的 hasSuperCreatorRole / requireSuperCreator。
 */

import type { FastifyRequest } from 'fastify'
import { BizError } from '../../lib/errors.js'

const SUPER_CREATOR_ROLE = 'ROLE_SUP_CREATOR'

export interface DreamaAuth {
  /** 良维传入的 Authorization header 原文（含 `metatube-` 前缀）*/
  authorization: string
  /** 良维的 24 位长用户 id */
  uid: string
}

declare module 'fastify' {
  interface FastifyRequest {
    dreamaAuth?: DreamaAuth
  }
}

/** 从 header 里读出裁掉两端空格的字符串；空/数组取第一个 */
function readHeader(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  const normalized = raw?.trim()
  return normalized ? normalized : undefined
}

/** JWT payload base64url 解码 → 对象 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  // 造梦次元 token 前缀 `metatube-`，剥掉再解 JWT 三段
  const jwt = token.startsWith('metatube-') ? token.slice('metatube-'.length) : token
  const parts = jwt.split('.')
  const encodedPayload = parts[1]
  if (!encodedPayload) return null

  try {
    const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadJson) as unknown
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

/** 从 JWT authorities 字段（JSON string）里抽出角色数组 */
function extractRoles(token: string): string[] {
  const payload = decodeJwtPayload(token)
  const authorities = payload?.authorities
  if (typeof authorities !== 'string') return []

  try {
    const parsed = JSON.parse(authorities) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return undefined
        const { authority } = item as { authority?: unknown }
        return typeof authority === 'string' ? authority : undefined
      })
      .filter((role): role is string => role !== undefined)
  } catch {
    return []
  }
}

/** 判断 token 里有没有超级创作者角色 */
export function hasSuperCreatorRole(token: string): boolean {
  return extractRoles(token).includes(SUPER_CREATOR_ROLE)
}

/**
 * onRequest 钩子：所有需要鉴权的路由都过一遍。
 * `/flow-batch/health` 等公开路径在 shouldSkipAuth 里跳过。
 */
export async function requireDreamaSuperCreator(request: FastifyRequest): Promise<void> {
  if (shouldSkipAuth(request)) {
    return
  }

  const authorization = readHeader(request.headers.authorization)
  const uid = readHeader(request.headers['uid'])

  if (!authorization || !uid) {
    throw new BizError('DREAMA_TOKEN_MISSING', '缺少 Authorization 或 Uid 请求头')
  }

  if (!hasSuperCreatorRole(authorization)) {
    // 不对外暴露"需要超级创作者"这个概念，跟 dream-agent 保持一致
    throw new BizError('DREAMA_TOKEN_INVALID', '登录已过期或权限不足')
  }

  request.dreamaAuth = { authorization, uid }
}

/** 需要跳过鉴权的路径 */
const PUBLIC_PATHS = new Set<string>([
  '/flow-batch/health',
  '/flow-batch/docs',
  '/flow-batch/metrics',
])
const PUBLIC_PATH_PREFIXES: readonly string[] = ['/flow-batch/docs/']

function shouldSkipAuth(request: FastifyRequest): boolean {
  if (request.method === 'OPTIONS') return true
  const path = request.url.split('?')[0] ?? request.url
  if (PUBLIC_PATHS.has(path)) return true
  return PUBLIC_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
}
