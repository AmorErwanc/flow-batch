import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

const UID = '000004550035214806040581'
const MAIN_ROLE_ID = '000005084517024538345475'
const SUPPORTING_ROLE_ID = '000005084517024538345476'

function makeAuthorizationHeader(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      authorities: JSON.stringify([{ authority: 'ROLE_SUP_CREATOR' }]),
    }),
  ).toString('base64url')
  return `metatube-${header}.${payload}.signature`
}

const AUTH_HEADERS = {
  authorization: makeAuthorizationHeader(),
  uid: UID,
}

function buildCharacterPayload(): Record<string, unknown> {
  return {
    name: '阿凯',
    gender: '男',
    age: 45,
    avatar_url: 'https://img.ideaflow.pro/flow-batch/avatar.jpg',
    banner_url: 'https://img.ideaflow.pro/flow-batch/banner.jpg',
    summary: '退休软件工程师,喜欢用生活比喻教编程',
    personality: '耐心温和,喜欢引导而不是直接给答案',
    speech_style: '爱说来,我们一步一步来',
  }
}

function buildFlowPayload(): Record<string, unknown> {
  return {
    name: '编程小屋',
    cover_url: 'https://img.ideaflow.pro/flow-batch/cover.jpg',
    summary: '放学后走进一家旧书店,遇到退休程序员阿凯',
    main_role_id: MAIN_ROLE_ID,
    supporting_role_ids: [SUPPORTING_ROLE_ID],
    opening: [
      { type: 'background', title: '背景介绍', content: '放学后你在小区角落发现了一家旧书店' },
      {
        type: 'role',
        role_id: MAIN_ROLE_ID,
        content: '哟,小朋友来找书?',
        user_btns: ['我想学编程'],
      },
    ],
    story: {
      background: '退休工程师在旧书店里教中学生理解编程思维,内容健康向上',
    },
    category: 'chat',
    publish: true,
  }
}

describe('route validation', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.LLM_API_BASE_URL = 'https://llm-api.example.test'
    process.env.LLM_API_KEY = 'llm-api-key-for-tests'

    const { buildApp } = await import('../src/http/app.js')
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('建角色拒绝非 img.ideaflow.pro 域名图片', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/flow-batch/character',
      headers: AUTH_HEADERS,
      payload: {
        ...buildCharacterPayload(),
        avatar_url: 'https://tools.ideaflow.pro/avatar.jpg',
      },
    })

    const body = response.json() as { details?: { issues?: Array<{ path?: unknown[]; message?: string }> } }
    expect(response.statusCode).toBe(400)
    expect(body.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['avatar_url'],
          message: '图片 URL 必须是 img.ideaflow.pro 域名',
        }),
      ]),
    )
  })

  it('生图拒绝非法 size 格式', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/flow-batch/image',
      headers: AUTH_HEADERS,
      payload: {
        prompt: '45 岁退休程序员,戴老花镜,慈祥微笑,写实风格',
        size: '2048',
      },
    })

    const body = response.json() as { details?: { issues?: Array<{ path?: unknown[]; message?: string }> } }
    expect(response.statusCode).toBe(400)
    expect(body.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['size'],
          message: 'size 必须是 "宽x高" 格式',
        }),
      ]),
    )
  })

  it('建作品在 publish=true 时要求 cover_url 和 summary', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/flow-batch/flow',
      headers: AUTH_HEADERS,
      payload: {
        ...buildFlowPayload(),
        cover_url: undefined,
        summary: undefined,
      },
    })

    const body = response.json() as { details?: { issues?: Array<{ path?: unknown[]; message?: string }> } }
    expect(response.statusCode).toBe(400)
    expect(body.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['cover_url'],
          message: 'publish=true 时必须提供 cover_url',
        }),
        expect.objectContaining({
          path: ['summary'],
          message: 'publish=true 时必须提供 summary',
        }),
      ]),
    )
  })

  it('建作品拒绝非 img.ideaflow.pro 域名封面', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/flow-batch/flow',
      headers: AUTH_HEADERS,
      payload: {
        ...buildFlowPayload(),
        cover_url: 'https://tools.ideaflow.pro/cover.jpg',
      },
    })

    const body = response.json() as { details?: { issues?: Array<{ path?: unknown[]; message?: string }> } }
    expect(response.statusCode).toBe(400)
    expect(body.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['cover_url'],
          message: '图片 URL 必须是 img.ideaflow.pro 域名',
        }),
      ]),
    )
  })

  it('建作品要求 opening 里的 role_id 必须属于本作品角色集', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/flow-batch/flow',
      headers: AUTH_HEADERS,
      payload: {
        ...buildFlowPayload(),
        opening: [
          { type: 'background', title: '背景介绍', content: '放学后你在小区角落发现了一家旧书店' },
          {
            type: 'role',
            role_id: '000005084517024538345499',
            content: '我是路过的配角',
            user_btns: ['继续'],
          },
        ],
      },
    })

    const body = response.json() as { details?: { issues?: Array<{ path?: unknown[]; message?: string }> } }
    expect(response.statusCode).toBe(400)
    expect(body.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['opening', 1, 'role_id'],
          message: 'role_id 必须等于 main_role_id 或 supporting_role_ids 里的某个角色',
        }),
      ]),
    )
  })

  it('建作品拒绝空的 user_btns 数组', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/flow-batch/flow',
      headers: AUTH_HEADERS,
      payload: {
        ...buildFlowPayload(),
        opening: [
          { type: 'background', title: '背景介绍', content: '放学后你在小区角落发现了一家旧书店' },
          {
            type: 'role',
            role_id: MAIN_ROLE_ID,
            content: '哟,小朋友来找书?',
            user_btns: [],
          },
        ],
      },
    })

    const body = response.json() as { details?: { issues?: Array<{ path?: unknown[]; message?: string }> } }
    expect(response.statusCode).toBe(400)
    expect(body.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['opening', 1, 'user_btns'],
        }),
      ]),
    )
  })
})
