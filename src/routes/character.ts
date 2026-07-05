/**
 * POST /flow-batch/character
 * 创建角色接口：一次调用建好，返回真实 role_id。
 *
 * 【对外 vs 内部字段】
 * 对外(良维视角):干净的业务字段(personality/speech_style),砍掉 is_ai_gen 这类
 * 合规内部标记,BFF 内部固定填 1。
 * 内部(service 视角):保留老 shape,内部字段直接映射到造梦次元下游要的字段。
 *
 * 内部行为:
 *   1. GET cyapi/cutebox/snowid → 预申请 id
 *   2. 若 timbre_id 空 → GET cyapi/cartoon/timbre?type=M/F 拉默认音色
 *   3. POST cyapi/cartoon/save
 *   4. 从 response.data.id 读回真实 role_id 返回
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createCharacter } from '../services/character-service.js'

/** 对外 schema:良维实际填的字段 */
const externalCreateCharacterSchema = z.object({
  name: z.string().min(1).max(50),
  gender: z.enum(['男', '女', '未知']),
  age: z.number().int().min(0).max(200).nullable(),
  avatar_url: z.string().url(),
  banner_url: z.string().url(),
  summary: z.string().min(1).max(500),
  personality: z.string().min(1).max(500),
  speech_style: z.string().min(1).max(500),
  timbre_id: z.string().optional(),
})

/**
 * 内部 shape(service 层吃这个):保持老字段名不动,
 * 让 service / cyapi-client 的实现和单测都不用改。
 */
export interface CreateCharacterInput {
  name: string
  gender: '男' | '女' | '未知'
  age: number | null
  avatar_url: string
  banner_url: string
  summary: string
  character: string
  locution: string
  timbre_id?: string | undefined
  is_ai_gen: 0 | 1
  banner_is_ai: 0 | 1
}

export interface CreateCharacterOutput {
  character_id: string
}

export async function characterRoute(app: FastifyInstance): Promise<void> {
  app.post('/character', async (request) => {
    const external = externalCreateCharacterSchema.parse(request.body)
    if (!request.dreamaAuth) throw new Error('unreachable: auth missing but reached handler')

    // 对外 → 内部字段映射;is_ai_gen / banner_is_ai 由 BFF 固定填 1(良维内容都是 AI 生的)
    const internal: CreateCharacterInput = {
      name: external.name,
      gender: external.gender,
      age: external.age,
      avatar_url: external.avatar_url,
      banner_url: external.banner_url,
      summary: external.summary,
      character: external.personality,
      locution: external.speech_style,
      timbre_id: external.timbre_id,
      is_ai_gen: 1,
      banner_is_ai: 1,
    }

    return await createCharacter(internal, request.dreamaAuth)
  })
}
