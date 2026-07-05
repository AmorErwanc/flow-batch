/**
 * POST /flow-batch/flow
 * ⭐ 核心接口 · 一键创建作品:一次调用把作品从 0 建到"提审中"。
 *
 * 【对外 vs 内部字段】
 * 对外(良维视角):
 *   - 从 header 兜底作品所属人,不重复要 user_id
 *   - 主角/配角显式分开(main_role_id / supporting_role_ids)
 *   - "开场剧本" 叫 opening,类型枚举里"背景交代" 叫 background
 *   - 内容分类叫 category(chat/story/game 语义值),不暴露 24 位雪花 id
 *   - 剧情 AI 参数由 BFF 兜默认,不外露
 * 内部(service / builder 视角):保留老 shape(role_ids/greetings/system/tag_id/update_note)
 * 让 pipe-save-builder 的实现和 40+ 引用 payload.xxx 的地方都不用改。
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createFlow } from '../services/flow-service.js'
import { imgIdeaflowUrlSchema } from './schema-helpers.js'

/** 对外 opening 三种 type(background 就是内部的 system) */
const backgroundOpeningSchema = z.object({
  type: z.literal('background'),
  content: z.string().min(1),
  title: z.string().optional(),
})
const narrationOpeningSchema = z.object({
  type: z.literal('narration'),
  content: z.string().min(1),
})
const roleOpeningSchema = z.object({
  type: z.literal('role'),
  content: z.string().min(1),
  role_id: z.string().length(24),
  /** 用户回复按钮文案数组,支持多个;按钮点击后走同一路径(不做真分支) */
  user_btns: z.array(z.string().min(1)).min(1).max(20).optional(),
})
const openingSchema = z.discriminatedUnion('type', [
  backgroundOpeningSchema,
  narrationOpeningSchema,
  roleOpeningSchema,
])

/** 预设对话轮 */
const presetTurnSchema = z.object({
  reply: z.string().min(1).max(1000),
  buttons: z.array(z.string().min(1)).min(1).max(20),
})

/** 对外 story:AI 参数由 BFF 兜默认,不外露 */
const externalStorySchema = z.object({
  background: z.string().min(1).max(2000),
})

/** 语义化的分类枚举 → 24 位雪花 tag_id 映射(BFF 内部转换) */
const CATEGORY_TO_TAG_ID: Record<'chat' | 'story' | 'game', string> = {
  chat: '000003882999195270660097',
  story: '000003882999195270660097', // TODO: 待补真实剧情标签 id;暂用聊天,不阻塞良维
  game: '000003882999195270660097',  // TODO: 同上
}

/** 对外 schema */
const externalCreateFlowSchema = z.object({
  name: z.string().min(1).max(100),
  cover_url: imgIdeaflowUrlSchema.optional(),
  summary: z.string().min(1).max(500).optional(),
  main_role_id: z.string().length(24),
  supporting_role_ids: z.array(z.string().length(24)).max(9).optional(),
  opening: z.array(openingSchema).min(1).max(10),
  preset_turns: z.array(presetTurnSchema).max(20).default([]),
  story: externalStorySchema,
  category: z.enum(['chat', 'story', 'game']).default('chat'),
  publish: z.boolean().default(true),
}).superRefine((input, ctx) => {
  if (input.publish && !input.cover_url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cover_url'],
      message: 'publish=true 时必须提供 cover_url',
    })
  }

  if (input.publish && !input.summary) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['summary'],
      message: 'publish=true 时必须提供 summary',
    })
  }

  const roleIds = new Set([input.main_role_id, ...(input.supporting_role_ids ?? [])])
  input.opening.forEach((opening, index) => {
    if (opening.type === 'role' && !roleIds.has(opening.role_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opening', index, 'role_id'],
        message: 'role_id 必须等于 main_role_id 或 supporting_role_ids 里的某个角色',
      })
    }
  })
})

/** 内部 greeting 三种 type(system = 对外的 background) */
export type Greeting =
  | { type: 'system'; content: string; title?: string | undefined }
  | { type: 'narration'; content: string }
  | { type: 'role'; content: string; role_id: string; user_btns?: string[] | undefined }

export interface PresetTurn {
  reply: string
  buttons: string[]
}

export interface StoryConfig {
  background: string
  llm_config?: {
    model?: string
    temperature?: number
    top_p?: number
    max_tokens?: number
  }
}

/**
 * 内部 shape(service / builder 吃这个):保持老字段名不动,
 * 让 pipe-save-builder 的 40+ 引用 payload.xxx 的地方都不用改。
 */
export interface CreateFlowInput {
  user_id: string
  name: string
  cover_url?: string | undefined
  summary?: string | undefined
  role_ids: string[]
  greetings: Greeting[]
  preset_turns: PresetTurn[]
  story: StoryConfig
  tag_id?: string | undefined
  publish: boolean
  update_note?: string | undefined
}

export interface CreateFlowOutput {
  pipe_id: string
  publish_status: 'submitted' | 'draft'
  studio_url: string
}

export async function flowRoute(app: FastifyInstance): Promise<void> {
  app.post('/flow', async (request) => {
    const external = externalCreateFlowSchema.parse(request.body)
    if (!request.dreamaAuth) throw new Error('unreachable: auth missing but reached handler')

    // 对外 → 内部字段映射
    // - user_id 从 header Uid 兜底(不让良维在 body 重复传)
    // - main_role_id + supporting_role_ids → role_ids(第 1 个是主角)
    // - opening[i].type='background' → greetings[i].type='system'(其他 type 保持)
    // - category → tag_id(枚举映射,不让良维填 24 位雪花)
    // - AI 参数走 BFF 默认,update_note 走"初始发布"
    const internal: CreateFlowInput = {
      user_id: request.dreamaAuth.uid,
      name: external.name,
      cover_url: external.cover_url,
      summary: external.summary,
      role_ids: [external.main_role_id, ...(external.supporting_role_ids ?? [])],
      greetings: external.opening.map((o) =>
        o.type === 'background' ? { type: 'system', content: o.content, title: o.title } : o,
      ),
      preset_turns: external.preset_turns,
      story: { background: external.story.background },
      tag_id: CATEGORY_TO_TAG_ID[external.category],
      publish: external.publish,
    }

    return await createFlow(internal, request.dreamaAuth)
  })
}
