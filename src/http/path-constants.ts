/**
 * 路径常量集中维护。
 * 服务前缀 = `/flow-batch`（跟 Loki app label / 共享表 service 字段对齐）。
 * 响应壳白名单机制见 conventions/api-design.md。
 */

export const SERVICE_PREFIX = '/flow-batch'

/** 响应包壳白名单（命中 WRAPPED 且不命中 UNWRAPPED 才包壳）*/
export const RESPONSE_WRAPPED_EXACT_PATHS: readonly string[] = [`${SERVICE_PREFIX}/health`]
export const RESPONSE_WRAPPED_PATH_PREFIXES: readonly string[] = [`${SERVICE_PREFIX}/`]

/** 响应壳例外（不包）：swagger / metrics 保持裸返 */
export const RESPONSE_UNWRAPPED_EXACT_PATHS: readonly string[] = [
  `${SERVICE_PREFIX}/metrics`,
  `${SERVICE_PREFIX}/docs`,
]
export const RESPONSE_UNWRAPPED_PATH_PREFIXES: readonly string[] = [`${SERVICE_PREFIX}/docs/`]

/** 鉴权跳过白名单（public 路径不需要超级创作者） */
export const AUTH_PUBLIC_PATHS: readonly string[] = [
  `${SERVICE_PREFIX}/health`,
  `${SERVICE_PREFIX}/docs`,
  `${SERVICE_PREFIX}/metrics`,
]
export const AUTH_PUBLIC_PATH_PREFIXES: readonly string[] = [`${SERVICE_PREFIX}/docs/`]
