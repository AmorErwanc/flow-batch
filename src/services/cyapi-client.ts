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
  pipeAdd(auth: DreamaAuth, body: { user_id: string; name: string }): Promise<{ id: string; globalAttrId: string }>
  pipeSave(auth: DreamaAuth, body: unknown): Promise<void>
  pipeUpdate(auth: DreamaAuth, body: Record<string, unknown>): Promise<void>
  pipeInitchat(auth: DreamaAuth, pipeId: string): Promise<void>
  pipeCreatorSubmit(auth: DreamaAuth, pipeId: string): Promise<void>
  riskControlTxtBatch(auth: DreamaAuth, texts: string[]): Promise<{ rejected: string[] }>
  // 图片转存用：
  attachUpload(auth: DreamaAuth, keyPath: string, file: Blob, filename: string): Promise<string>
}

interface UpstreamEnvelope<T> {
  code: number
  msg: string
  data: T
}

type UpstreamKind = 'cyapi' | 'studio'

interface RequestOptions {
  auth: DreamaAuth
  method?: 'GET' | 'POST'
  path: string
  body?: unknown
  form?: FormData
  resourceNotFoundOnBusinessError?: boolean
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function joinUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}/${path.replace(/^\/+/, '')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  return readString(record[key])
}

function readFirstStringField(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = readStringField(record, key)
    if (value !== undefined) return value
  }
  return undefined
}

function readRecordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key]
  return isRecord(value) ? value : undefined
}

function readRecordArrayField(record: Record<string, unknown>, key: string): Record<string, unknown>[] | undefined {
  const value = record[key]
  if (!Array.isArray(value)) return undefined
  return value.filter(isRecord)
}

function cyapiHeaders(auth: DreamaAuth, json = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: auth.authorization,
    Uid: auth.uid,
    c: 'web_creator',
    env: 'ideaflow',
    pg: '7',
    draft: '1',
  }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

function studioHeaders(auth: DreamaAuth): Record<string, string> {
  return {
    Authorization: auth.authorization,
    Uid: auth.uid,
    c: 'web_creator',
    draft: '1',
    env: 'ideaflow',
    'Content-Type': 'application/json',
  }
}

function upstreamFailureCode(kind: UpstreamKind): 'UPSTREAM_CYAPI_FAILED' | 'UPSTREAM_STUDIO_FAILED' {
  return kind === 'cyapi' ? 'UPSTREAM_CYAPI_FAILED' : 'UPSTREAM_STUDIO_FAILED'
}

function upstreamName(kind: UpstreamKind): string {
  return kind === 'cyapi' ? 'cyapi' : 'studio'
}

function toBodyPreview(body: string): string {
  return body.length > 1000 ? `${body.slice(0, 1000)}...` : body
}

async function parseEnvelope<T>(response: Response, url: string): Promise<UpstreamEnvelope<T>> {
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    throw new BizError('UPSTREAM_ERROR', '下游返回非 JSON 响应', {
      cause: error,
      details: { upstream: { url, status: response.status, body: toBodyPreview(text) } },
    })
  }

  if (!isRecord(parsed) || typeof parsed.code !== 'number') {
    throw new BizError('UPSTREAM_ERROR', '下游响应壳格式异常', {
      details: { upstream: { url, status: response.status, body: parsed } },
    })
  }

  return {
    code: parsed.code,
    msg: readFirstStringField(parsed, ['msg', 'message']) ?? '',
    data: parsed.data as T,
  }
}

async function requestEnvelope<T>(
  kind: UpstreamKind,
  baseUrl: string,
  options: RequestOptions,
): Promise<T> {
  const url = joinUrl(baseUrl, options.path)
  const headers =
    kind === 'cyapi' ? cyapiHeaders(options.auth, options.form === undefined) : studioHeaders(options.auth)

  let response: Response
  try {
    const init: RequestInit = {
      method: options.method ?? (options.body || options.form ? 'POST' : 'GET'),
      headers,
    }
    const requestBody = options.form ?? (options.body ? JSON.stringify(options.body) : undefined)
    if (requestBody !== undefined) init.body = requestBody
    response = await fetch(url, init)
  } catch (error) {
    throw new BizError('UPSTREAM_ERROR', `调用下游 ${upstreamName(kind)} 失败`, {
      cause: error,
      details: { upstream: { url } },
    })
  }

  if (response.status === 401) {
    throw new BizError('DREAMA_TOKEN_INVALID', '登录已过期或权限不足', {
      details: { upstream: { url, status: response.status } },
    })
  }

  const envelope = await parseEnvelope<T>(response, url)
  if (!response.ok || envelope.code !== 0) {
    if (options.resourceNotFoundOnBusinessError && envelope.msg.includes('不存在')) {
      throw new BizError('RESOURCE_NOT_FOUND', '资源不存在', {
        details: { upstream_msg: envelope.msg, upstream: { url, status: response.status } },
      })
    }

    throw new BizError(upstreamFailureCode(kind), `下游 ${upstreamName(kind)} 返回失败`, {
      details: { upstream_msg: envelope.msg, upstream_code: envelope.code, upstream: { url, status: response.status } },
    })
  }

  return envelope.data
}

function mapTimbre(raw: Record<string, unknown>): AudioTimbre {
  return {
    id: readStringField(raw, 'id') ?? '',
    name: readStringField(raw, 'name') ?? '',
    timbreVal: readFirstStringField(raw, ['timbreVal', 'timbre_val']) ?? '',
    audio: readStringField(raw, 'audio') ?? '',
    type: readStringField(raw, 'type') ?? '',
  }
}

function mapCartoonDetail(raw: Record<string, unknown>, timbre: Record<string, unknown> | undefined): CartoonDetail {
  const id = readStringField(raw, 'id')
  const name = readStringField(raw, 'name')
  if (!id || !name) {
    throw new BizError('RESOURCE_NOT_FOUND', '角色不存在')
  }

  const detail: CartoonDetail = {
    id,
    name,
    avatar: readStringField(raw, 'avatar') ?? '',
    banner: readStringField(raw, 'banner') ?? '',
    gender: readStringField(raw, 'gender') ?? '未知',
    timbreId: readFirstStringField(raw, ['timbreId', 'timbre_id']) ?? readStringField(timbre ?? {}, 'id') ?? '',
    character: readStringField(raw, 'character') ?? '',
    locution: readStringField(raw, 'locution') ?? '',
    age: readNumber(raw.age) ?? null,
    type: readStringField(raw, 'type') ?? 'normal',
  }
  const timbreVal = readFirstStringField(timbre ?? {}, ['timbreVal', 'timbre_val'])
  if (timbreVal) detail.timbreVal = timbreVal
  const timbreAudio = readStringField(timbre ?? {}, 'audio')
  if (timbreAudio) detail.timbreAudio = timbreAudio
  return detail
}

function findGlobalAttrId(data: Record<string, unknown>): string | undefined {
  const direct = readFirstStringField(data, ['globalAttrId', 'global_attr_id'])
  if (direct) return direct

  const attrs = readRecordArrayField(data, 'attrs') ?? readRecordArrayField(data, 'attr') ?? []
  const globalAttr = attrs.find((item) => readStringField(item, 'schema') === 'wrapper')
  return globalAttr ? readStringField(globalAttr, 'id') : undefined
}

function isRejectedRiskItem(item: Record<string, unknown>): boolean {
  return item.rejected === true || item.reject === true || item.hit === true || item.blocked === true
}

function readRiskText(item: Record<string, unknown>, fallback: string | undefined): string | undefined {
  return readFirstStringField(item, ['text', 'content', 'value', 'originalText', 'originText']) ?? fallback
}

function normalizeRejectedTexts(values: unknown[], sourceTexts: string[]): string[] {
  const rejected = new Set<string>()
  values.forEach((value, index) => {
    if (typeof value === 'string' && value.length > 0) {
      rejected.add(value)
      return
    }
    if (isRecord(value) && isRejectedRiskItem(value)) {
      const text = readRiskText(value, sourceTexts[index])
      if (text) rejected.add(text)
    }
  })
  return [...rejected]
}

function parseRiskCheckResult(data: unknown, sourceTexts: string[]): { rejected: string[] } {
  if (Array.isArray(data)) {
    return { rejected: normalizeRejectedTexts(data, sourceTexts) }
  }

  if (!isRecord(data)) return { rejected: [] }
  const rejected = data.rejected
  if (Array.isArray(rejected)) {
    return { rejected: normalizeRejectedTexts(rejected, sourceTexts) }
  }

  return { rejected: [] }
}

export function createCyapiClient(baseUrl: string, studioBaseUrl: string): CyapiClient {
  const cyapiBaseUrl = normalizeBaseUrl(baseUrl)
  const studioNodeapiBaseUrl = normalizeBaseUrl(studioBaseUrl)

  return {
    async applySnowId(auth) {
      const data = await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
        auth,
        path: '/cutebox/snowid',
      })
      const id = readString(data)
      if (!id) throw new BizError('UPSTREAM_CYAPI_FAILED', '下游 cyapi 未返回雪花 id')
      return id
    },

    async listTimbres(auth, type) {
      const params = new URLSearchParams({ type })
      const data = await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
        auth,
        path: `/cartoon/timbre?${params.toString()}`,
      })
      if (!Array.isArray(data)) {
        throw new BizError('UPSTREAM_CYAPI_FAILED', '下游 cyapi 音色列表格式异常')
      }
      return data.filter(isRecord).map(mapTimbre)
    },

    async saveCartoon(auth, body) {
      const data = await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
        auth,
        path: '/cartoon/save',
        body,
      })
      if (!isRecord(data)) throw new BizError('UPSTREAM_CYAPI_FAILED', '下游 cyapi 建角色返回格式异常')
      const id = readStringField(data, 'id')
      if (!id) throw new BizError('UPSTREAM_CYAPI_FAILED', '下游 cyapi 未返回真实角色 id')
      return { id }
    },

    async getCartoonDetail(auth, cartoonId) {
      const detail = await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
        auth,
        path: `/cartoon/detail/${encodeURIComponent(cartoonId)}`,
        resourceNotFoundOnBusinessError: true,
      })
      if (!isRecord(detail)) throw new BizError('RESOURCE_NOT_FOUND', '角色不存在')

      const params = new URLSearchParams({ cartoonId })
      const timbre = await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
        auth,
        path: `/cartoon/timbre/detail?${params.toString()}`,
      })
      return mapCartoonDetail(detail, isRecord(timbre) ? timbre : undefined)
    },

    async pipeAdd(auth, body) {
      const data = await requestEnvelope<unknown>('studio', studioNodeapiBaseUrl, {
        auth,
        path: '/pipe/add',
        body,
      })
      if (!isRecord(data)) throw new BizError('UPSTREAM_STUDIO_FAILED', '下游 studio 建作品返回格式异常')
      const pipeRecord = readRecordField(data, 'pipe')
      const id = readStringField(data, 'id') ?? (pipeRecord ? readStringField(pipeRecord, 'id') : undefined)
      const globalAttrId = findGlobalAttrId(data)
      if (!id || !globalAttrId) {
        throw new BizError('UPSTREAM_STUDIO_FAILED', '下游 studio 未返回作品 id 或全局配置 id')
      }
      return { id, globalAttrId }
    },

    async pipeSave(auth, body) {
      await requestEnvelope<unknown>('studio', studioNodeapiBaseUrl, {
        auth,
        path: '/pipe/save',
        body,
      })
    },

    async pipeUpdate(auth, body) {
      await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
        auth,
        path: '/pipe/update',
        body,
      })
    },

    async pipeInitchat(auth, pipeId) {
      await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
        auth,
        method: 'POST',
        path: `/pipe/initchat/${encodeURIComponent(pipeId)}`,
      })
    },

    async pipeCreatorSubmit(auth, pipeId) {
      await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
        auth,
        method: 'POST',
        path: `/pipe/creator/submit/${encodeURIComponent(pipeId)}`,
      })
    },

    async riskControlTxtBatch(auth, texts) {
      if (texts.length === 0) return { rejected: [] }

      // 造梦次元此接口 body 结构未通过 devtools 抓包，按最常见格式送。
      // 联调阶段若失败会走降级放行，据实际错误再纠正 body。
      const body = { texts }

      try {
        const data = await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
          auth,
          method: 'POST',
          path: '/risk/control/txt/batch',
          body,
        })
        return parseRiskCheckResult(data, texts)
      } catch (error) {
        // 风控接口暂不 block 提审；只有明确命中才由上层抛 CONTENT_REJECTED。
        if (error instanceof BizError && error.code === 'DREAMA_TOKEN_INVALID') throw error
        console.warn('riskControlTxtBatch failed, allow submit temporarily', error)
        return { rejected: [] }
      }
    },

    async attachUpload(auth, keyPath, file, filename) {
      const form = new FormData()
      form.append('mFile', file, filename)
      const params = new URLSearchParams({ keyPath })
      const data = await requestEnvelope<unknown>('cyapi', cyapiBaseUrl, {
        auth,
        path: `/attach/upload?${params.toString()}`,
        form,
      })
      if (!isRecord(data)) throw new BizError('UPSTREAM_CYAPI_FAILED', '下游 cyapi 上传返回格式异常')
      const list = data.list
      if (!Array.isArray(list)) throw new BizError('UPSTREAM_CYAPI_FAILED', '下游 cyapi 上传未返回文件 URL')
      const firstUrl = readString(list[0])
      if (!firstUrl) throw new BizError('UPSTREAM_CYAPI_FAILED', '下游 cyapi 上传未返回文件 URL')
      return firstUrl
    },
  }
}
