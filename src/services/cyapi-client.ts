/**
 * cyapi 下游客户端 · 骨架（PR#3/#4 由 codex 补齐）
 *
 * 封装造梦次元 cyapi 系列接口调用，统一：
 *   - 通用 header（c/env/pg/draft）
 *   - Authorization + Uid 透传
 *   - 错误映射（401 → DREAMA_TOKEN_INVALID，其他非 2xx → UPSTREAM_CYAPI_FAILED）
 */
import { BizError } from '../lib/errors.js'
import type { DreamaAuth } from '../http/middleware/dreama-auth.js'

/** 角色完整详情（从 GET /cartoon/detail/{id} 返回）*/
export interface CartoonDetail {
  id: string
  name: string
  avatar: string
  banner: string
  gender: string
  timbreId: string
  timbreVal?: string
  timbreAudio?: string
  character: string
  locution: string
  age: number | null
  type: string
}

export interface AudioTimbre {
  id: string
  name: string
  timbreVal: string
  audio: string
  type: string
}

/** TODO codex: 具体实现由 PR#3/#4 补 */
export interface CyapiClient {
  applySnowId(auth: DreamaAuth): Promise<string>
  listTimbres(auth: DreamaAuth, type: 'M' | 'F' | 'all'): Promise<AudioTimbre[]>
  saveCartoon(auth: DreamaAuth, body: Record<string, unknown>): Promise<{ id: string }>
  getCartoonDetail(auth: DreamaAuth, cartoonId: string): Promise<CartoonDetail>
  // Flow 用：
  pipeAdd(auth: DreamaAuth, body: { user_id: string; name: string }): Promise<{ id: string }>
  pipeSave(auth: DreamaAuth, body: Record<string, unknown>): Promise<void>
  pipeUpdate(auth: DreamaAuth, body: Record<string, unknown>): Promise<void>
  pipeInitchat(auth: DreamaAuth, pipeId: string): Promise<void>
  pipeCreatorSubmit(auth: DreamaAuth, pipeId: string): Promise<void>
  riskControlTxtBatch(auth: DreamaAuth, texts: string[]): Promise<{ rejected: string[] }>
  // 图片转存用：
  attachUpload(auth: DreamaAuth, keyPath: string, file: Blob, filename: string): Promise<string>
}

export function createCyapiClient(_baseUrl: string, _studioBaseUrl: string): CyapiClient {
  throw new BizError('NOT_IMPLEMENTED', 'PR#3/#4 待实现：cyapi-client')
}
