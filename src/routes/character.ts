/**
 * POST /flow-batch/character
 * 创建角色接口：一次调用建好，返回真实 role_id。
 *
 * 内部行为（PR#3 由 codex 实现）：
 *   1. GET cyapi/cutebox/snowid → 预申请 id（后端会忽略并另分配，只当作请求体的 id 字段）
 *   2. 若 timbre_id 空 → GET cyapi/cartoon/timbre?type=M/F 拉默认音色
 *   3. POST cyapi/cartoon/save
 *   4. 从 response.data.id 读回真实 role_id 返回（不是 step 1 预申请那个）
 *
 * 详细 spec 见 `~/project/temp/flow-creation/docs/api-spec.md` §「接口 1」
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createCharacter } from '../services/character-service.js'

const createCharacterInputSchema = z.object({
  name: z.string().min(1).max(50),
  gender: z.enum(['男', '女', '未知']),
  age: z.number().int().min(0).max(200).nullable(),
  avatar_url: z.string().url(),
  banner_url: z.string().url(),
  summary: z.string().min(1).max(500),
  character: z.string().min(1).max(500),
  locution: z.string().min(1).max(500),
  timbre_id: z.string().optional(),
  is_ai_gen: z.union([z.literal(0), z.literal(1)]).default(1),
  banner_is_ai: z.union([z.literal(0), z.literal(1)]).default(1),
})

export type CreateCharacterInput = z.infer<typeof createCharacterInputSchema>

export interface CreateCharacterOutput {
  character_id: string
}

export async function characterRoute(app: FastifyInstance): Promise<void> {
  app.post('/character', async (request) => {
    const input = createCharacterInputSchema.parse(request.body)
    if (!request.dreamaAuth) throw new Error('unreachable: auth missing but reached handler')

    return await createCharacter(input, request.dreamaAuth)
  })
}
