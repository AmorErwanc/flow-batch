/**
 * 生图 service · PR#2 · 骨架（业务由 codex 实现）
 *
 * 流程（照 `docs/api-spec.md` §「接口 3」）：
 *   1. POST `${LLM_API_BASE_URL}/image/generate`
 *      Headers: X-API-Key: ${LLM_API_KEY}
 *      Body: {
 *        model: 'doubao-seedream-4.5' | 'gpt-image-2',
 *        prompt, aspect_ratio, max_images,
 *        reference_images: reference_urls,
 *        call_type,
 *        // gpt-image-2 专有: quality / background / moderation / provider_channel
 *      }
 *      → response.data.image_urls[]（tools 域名 URL）
 *
 *   2. 对每个 tools URL：
 *      a. GET 下载图片 → Buffer
 *      b. POST `${CYAPI_BASE_URL}/attach/upload?keyPath=flow-batch/${uid}/`
 *         Headers: Authorization + Uid（透传 auth）
 *         multipart/form-data，字段名 `mFile`（不是 file），value 是 Blob(Buffer, mimeType)
 *         → response.data.list[0]（img.ideaflow.pro 域名 URL）
 *
 *   3. 返回 img 域名 URL 数组 + elapsed_ms
 *
 * 错误映射：
 *   - llm-api 非 2xx → throw new BizError('UPSTREAM_LLM_FAILED', 'llm-api 生图失败', { details: { status, body } })
 *   - attach/upload 401 → throw new BizError('DREAMA_TOKEN_INVALID', '登录已过期')
 *   - attach/upload 其他非 2xx → throw new BizError('UPSTREAM_CYAPI_FAILED', ...)
 *   - fetch 网络错 / timeout → throw new BizError('UPSTREAM_ERROR', ...)
 */
import { BizError } from '../lib/errors.js'
import { getConfig } from '../config.js'
import type { DreamaAuth } from '../http/middleware/dreama-auth.js'
import type { GenerateImageInput, GenerateImageOutput } from '../routes/image.js'
import { createCyapiClient } from './cyapi-client.js'
import { ulid } from 'ulid'

interface LlmImageGenerateResponse {
  code: number
  message?: string
  msg?: string
  data?: {
    image_urls?: unknown
    elapsed_time?: unknown
  } | null
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function toBodyPreview(body: string): string {
  return body.length > 1000 ? `${body.slice(0, 1000)}...` : body
}

async function readJsonResponse(response: Response, url: string): Promise<LlmImageGenerateResponse> {
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    throw new BizError('UPSTREAM_LLM_FAILED', 'llm-api 生图失败', {
      cause: error,
      details: { upstream: { url, status: response.status, body: toBodyPreview(text) } },
    })
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BizError('UPSTREAM_LLM_FAILED', 'llm-api 生图失败', {
      details: { upstream: { url, status: response.status, body: parsed } },
    })
  }

  return parsed as LlmImageGenerateResponse
}

async function fetchLlmImages(input: GenerateImageInput): Promise<string[]> {
  const config = getConfig()
  const url = `${normalizeBaseUrl(config.LLM_API_BASE_URL)}/image/generate`
  let response: Response

  const upstreamBody: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    aspect_ratio: input.aspect_ratio,
    max_images: input.max_images,
    reference_images: input.reference_urls,
    call_type: input.call_type,
  }
  if (input.model === 'gpt-image-2') {
    if (input.quality !== undefined) upstreamBody.quality = input.quality
    if (input.background !== undefined) upstreamBody.background = input.background
    if (input.moderation !== undefined) upstreamBody.moderation = input.moderation
    if (input.provider_channel !== undefined) upstreamBody.provider_channel = input.provider_channel
  }

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key': config.LLM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
    })
  } catch (error) {
    throw new BizError('UPSTREAM_LLM_FAILED', 'llm-api 生图失败', {
      cause: error,
      details: { upstream: { url } },
    })
  }

  const body = await readJsonResponse(response, url)
  if (!response.ok || body.code !== 0) {
    throw new BizError('UPSTREAM_LLM_FAILED', 'llm-api 生图失败', {
      details: {
        upstream_msg: body.message ?? body.msg ?? '',
        upstream_code: body.code,
        upstream: { url, status: response.status, body },
      },
    })
  }

  if (!Array.isArray(body.data?.image_urls) || !body.data.image_urls.every((item) => typeof item === 'string')) {
    throw new BizError('UPSTREAM_LLM_FAILED', 'llm-api 生图失败', {
      details: { upstream_msg: 'image_urls 格式异常', upstream: { url, status: response.status, body } },
    })
  }

  return body.data.image_urls
}

async function downloadImageAsBlob(url: string): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new BizError('UPSTREAM_LLM_FAILED', '下载生图结果失败', {
      cause: error,
      details: { upstream: { url } },
    })
  }

  if (!response.ok) {
    throw new BizError('UPSTREAM_LLM_FAILED', '下载生图结果失败', {
      details: { upstream: { url, status: response.status } },
    })
  }

  const buf = Buffer.from(await response.arrayBuffer())
  return new Blob([buf], { type: 'image/jpeg' })
}

export async function generateImage(
  input: GenerateImageInput,
  auth: DreamaAuth,
): Promise<GenerateImageOutput> {
  const config = getConfig()
  const t0 = Date.now()
  const toolsUrls = await fetchLlmImages(input)
  const client = createCyapiClient(config.CYAPI_BASE_URL, config.STUDIO_NODEAPI_BASE_URL)
  const imageUrls: string[] = []

  // 顺序转存，避免批量并发打到 attach/upload 限流。
  for (const [index, toolsUrl] of toolsUrls.entries()) {
    const blob = await downloadImageAsBlob(toolsUrl)
    const filename = `img-${Date.now()}-${index}-${ulid().toLowerCase()}.jpg`
    const uploadedUrl = await client.attachUpload(auth, `flow-batch/${auth.uid}/`, blob, filename)
    imageUrls.push(uploadedUrl)
  }

  return {
    image_urls: imageUrls,
    elapsed_ms: Date.now() - t0,
  }
}
