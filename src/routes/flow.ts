/**
 * POST /flow-batch/flow
 * ⭐ 核心接口 · 一键创建作品：一次调用把作品从 0 建到"提审中"。
 *
 * 内部行为（6 步，PR#4 先做前 4 步骨架 + save body 拼装，PR#5 补 pipe/update + 风控）：
 *   1. POST studio/pipe/add {user_id, name}                    → 拿 pipe_id
 *   2. POST studio/pipe/save {user_id, owner_id, time, data, hash} ← save body 由 pipe-save-builder 拼
 *   3. [PR#5] POST cyapi/pipe/update {userId, pipe: {...}}     → 补 cyapi 主表 name/cover/summary
 *   4. POST cyapi/pipe/initchat/{pipe_id}                      → 生成初始 TTS
 *   5. [PR#5] POST cyapi/risk/control/txt/batch                → 内容风控预检
 *   6. publish=true 时才调：POST cyapi/pipe/creator/submit/{pipe_id} → 提审
 *
 * 详细 spec 见 `~/project/temp/flow-creation/docs/api-spec.md` §「接口 2」
 * pipe-save-builder 的拼装逻辑参考 `~/project/temp/flow-creation/test-run/stage-b-save.mjs`
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createFlow } from '../services/flow-service.js'

/** 三种 greeting type */
const systemGreetingSchema = z.object({
  type: z.literal('system'),
  content: z.string().min(1),
  title: z.string().optional(),
})
const narrationGreetingSchema = z.object({
  type: z.literal('narration'),
  content: z.string().min(1),
})
const roleGreetingSchema = z.object({
  type: z.literal('role'),
  content: z.string().min(1),
  role_id: z.string().min(1),
  /** 用户回复按钮文案数组，支持多个（按钮之间同路径，不做真分支） */
  user_btns: z.array(z.string().min(1)).max(20).optional(),
})

const greetingSchema = z.discriminatedUnion('type', [
  systemGreetingSchema,
  narrationGreetingSchema,
  roleGreetingSchema,
])

/** 每轮预设（阿凯说一句话 + 多个用户可选按钮） */
const presetTurnSchema = z.object({
  reply: z.string().min(1).max(1000),
  buttons: z.array(z.string().min(1)).min(1).max(20),
})

/** 剧情配置 */
const storySchema = z.object({
  background: z.string().min(1).max(2000),
  llm_config: z
    .object({
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      top_p: z.number().min(0).max(1).optional(),
      max_tokens: z.number().int().min(1).max(8192).optional(),
    })
    .optional(),
})

const createFlowInputSchema = z.object({
  user_id: z.string().length(24),
  name: z.string().min(1).max(100),
  cover_url: z.string().url().optional(),
  summary: z.string().min(1).max(500).optional(),
  role_ids: z.array(z.string().length(24)).min(1).max(10),
  greetings: z.array(greetingSchema).min(1).max(10),
  preset_turns: z.array(presetTurnSchema).max(20).default([]),
  story: storySchema,
  /** 内容分类标签 id（默认良维用「聊天」类） */
  tag_id: z.string().length(24).optional(),
  publish: z.boolean().default(true),
})

export type CreateFlowInput = z.infer<typeof createFlowInputSchema>
export type Greeting = z.infer<typeof greetingSchema>
export type PresetTurn = z.infer<typeof presetTurnSchema>
export type StoryConfig = z.infer<typeof storySchema>

export interface CreateFlowOutput {
  pipe_id: string
  publish_status: 'submitted' | 'draft'
  studio_url: string
}

export async function flowRoute(app: FastifyInstance): Promise<void> {
  app.post('/flow', async (request) => {
    const input = createFlowInputSchema.parse(request.body)
    if (!request.dreamaAuth) throw new Error('unreachable: auth missing but reached handler')

    return await createFlow(input, request.dreamaAuth)
  })
}
