/**
 * POST /flow-batch/image
 * 生图接口:文生图 / 图生图,返回 img.ideaflow.pro 域名的 URL 数组。
 *
 * 【对外 vs 内部字段】
 * 对外:size(值格式 "2048x2048",名字跟值对齐)
 * 内部:aspect_ratio(llm-api 上游的字段名)
 *
 * 内部行为:
 *   1. POST llm-api /image/generate → tools.ideaflow.pro/api/storage/preview URL
 *   2. 下载图片 bytes
 *   3. POST cyapi/attach/upload → img.ideaflow.pro/... URL
 *   4. 返回 img 域名 URL
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generateImage } from '../services/image-service.js'

/** 对外 schema */
const externalGenerateImageSchema = z.object({
  prompt: z.string().min(1, 'prompt 不能为空').max(2000),
  size: z.string().regex(/^\d+x\d+$/, 'size 必须是 "宽x高" 格式').default('2048x2048'),
  max_images: z.coerce.number().int().min(1).max(15).default(1),
  reference_urls: z.array(z.string().url()).max(14).optional(),
  model: z.enum(['doubao-seedream-4.5', 'gpt-image-2']).default('doubao-seedream-4.5'),
  // 下面 4 个仅 gpt-image-2 生效；传给 seedream 会被忽略
  quality: z.enum(['low', 'medium', 'high']).optional(),
  background: z.enum(['auto', 'opaque']).optional(),
  moderation: z.enum(['auto', 'low']).optional(),
  provider_channel: z
    .enum(['auto', 'kapon', 'wuyin', 'aiclound', 'azure', 'azure:westus3', 'azure:polandcentral', 'azure:uaenorth'])
    .optional(),
  call_type: z.string().max(64).optional(),
})

/**
 * 内部 shape(service 层吃这个):保持 aspect_ratio 名字对齐 llm-api 上游,
 * 让 image-service 和单测都不用改。
 */
export interface GenerateImageInput {
  prompt: string
  aspect_ratio: string
  max_images: number
  reference_urls?: string[] | undefined
  model: 'doubao-seedream-4.5' | 'gpt-image-2'
  quality?: 'low' | 'medium' | 'high' | undefined
  background?: 'auto' | 'opaque' | undefined
  moderation?: 'auto' | 'low' | undefined
  provider_channel?:
    | 'auto'
    | 'kapon'
    | 'wuyin'
    | 'aiclound'
    | 'azure'
    | 'azure:westus3'
    | 'azure:polandcentral'
    | 'azure:uaenorth'
    | undefined
  call_type?: string | undefined
}

export interface GenerateImageOutput {
  image_urls: string[]
  elapsed_ms: number
}

export async function imageRoute(app: FastifyInstance): Promise<void> {
  app.post('/image', async (request) => {
    const external = externalGenerateImageSchema.parse(request.body)
    if (!request.dreamaAuth) throw new Error('unreachable: auth missing but reached handler')

    const internal: GenerateImageInput = {
      prompt: external.prompt,
      aspect_ratio: external.size,
      max_images: external.max_images,
      reference_urls: external.reference_urls,
      model: external.model,
      quality: external.quality,
      background: external.background,
      moderation: external.moderation,
      provider_channel: external.provider_channel,
      call_type: external.call_type,
    }

    return await generateImage(internal, request.dreamaAuth)
  })
}
