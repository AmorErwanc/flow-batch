/**
 * 生图 service · PR#2 · 骨架（业务由 codex 实现）
 *
 * 流程（照 `docs/api-spec.md` §「接口 3」）：
 *   1. POST `${LLM_API_BASE_URL}/image/generate`
 *      Headers: X-API-Key: ${LLM_API_KEY}
 *      Body: {
 *        model: 'doubao-seedream-4.5',
 *        prompt, aspect_ratio, max_images,
 *        reference_images: reference_urls,
 *        generation_mode, call_type,
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
import type { DreamaAuth } from '../http/middleware/dreama-auth.js'
import type { GenerateImageInput, GenerateImageOutput } from '../routes/image.js'

export async function generateImage(
  _input: GenerateImageInput,
  _auth: DreamaAuth,
): Promise<GenerateImageOutput> {
  // TODO codex: 按上面 doc 实现
  throw new BizError('NOT_IMPLEMENTED', 'PR#2 待实现：生图 + 转存 img 域名')
}
