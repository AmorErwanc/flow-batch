/**
 * POST /flow-batch/image
 * 生图接口：文生图 / 图生图，返回 img.ideaflow.pro 域名的 URL 数组。
 *
 * 内部行为（PR#2 由 codex 实现）：
 *   1. POST llm-api /image/generate → tools.ideaflow.pro/api/storage/preview URL
 *   2. 下载图片 bytes
 *   3. POST cyapi/attach/upload → img.ideaflow.pro/... URL
 *   4. 返回 img 域名 URL
 *
 * 详细 spec 见 `~/project/temp/flow-creation/docs/api-spec.md` §「接口 3」
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generateImage } from '../services/image-service.js'

const generateImageInputSchema = z.object({
  prompt: z.string().min(1, 'prompt 不能为空').max(2000),
  aspect_ratio: z.string().default('2048x2048'),
  max_images: z.coerce.number().int().min(1).max(15).default(1),
  reference_urls: z.array(z.string().url()).max(14).optional(),
  generation_mode: z.enum(['single', 'set']).optional(),
  call_type: z.string().max(64).optional(),
})

export type GenerateImageInput = z.infer<typeof generateImageInputSchema>

export interface GenerateImageOutput {
  image_urls: string[]
  elapsed_ms: number
}

export async function imageRoute(app: FastifyInstance): Promise<void> {
  app.post('/image', async (request) => {
    const input = generateImageInputSchema.parse(request.body)
    // dreama-auth 中间件已经把凭据挂到 request.dreamaAuth
    if (!request.dreamaAuth) throw new Error('unreachable: auth missing but reached handler')

    return await generateImage(input, request.dreamaAuth)
  })
}
