import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DreamaAuth } from '../src/http/middleware/dreama-auth.js'
import type { CreateCharacterInput } from '../src/routes/character.js'
import { createCharacter } from '../src/services/character-service.js'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  createCyapiClient: vi.fn(),
  client: {
    applySnowId: vi.fn(),
    listTimbres: vi.fn(),
    saveCartoon: vi.fn(),
  },
}))

vi.mock('../src/config.js', () => ({
  getConfig: mocks.getConfig,
}))

vi.mock('../src/services/cyapi-client.js', () => ({
  createCyapiClient: mocks.createCyapiClient,
}))

const AUTH: DreamaAuth = {
  authorization: 'metatube-test-token',
  uid: '000004550035214806040581',
}

const PRE_ID = '000005100000000000000001'
const SAVED_ID = '000005100000000000000999'

function buildInput(overrides: Partial<CreateCharacterInput> = {}): CreateCharacterInput {
  return {
    name: '阿凯',
    gender: '男',
    age: 45,
    avatar_url: 'https://img.ideaflow.pro/flow-batch/avatar.png',
    banner_url: 'https://img.ideaflow.pro/flow-batch/banner.png',
    summary: '退休工程师',
    character: '耐心温和',
    locution: '善于用生活比喻讲清楚问题',
    is_ai_gen: 1,
    banner_is_ai: 0,
    ...overrides,
  }
}

function savedBody(): Record<string, unknown> {
  const body = mocks.client.saveCartoon.mock.calls[0]?.[1]
  expect(body).toBeDefined()
  return body as Record<string, unknown>
}

describe('character-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockReturnValue({
      CYAPI_BASE_URL: 'https://cyapi.example.test',
      STUDIO_NODEAPI_BASE_URL: 'https://studio.example.test/nodeapi/ideaflow',
    })
    mocks.createCyapiClient.mockReturnValue(mocks.client)
    mocks.client.applySnowId.mockResolvedValue(PRE_ID)
    mocks.client.listTimbres.mockResolvedValue([
      {
        id: 'default-timbre-id',
        name: '默认音色',
        timbreVal: 'default_voice',
        audio: 'https://img.ideaflow.pro/voice.mp3',
        type: 'M',
      },
    ])
    mocks.client.saveCartoon.mockResolvedValue({ id: SAVED_ID })
  })

  it.each([
    ['男', 'M'],
    ['女', 'F'],
    ['未知', 'all'],
  ] as const)('未传音色时按性别 %s 拉默认音色 type=%s', async (gender, timbreType) => {
    await createCharacter(buildInput({ gender }), AUTH)

    expect(mocks.client.listTimbres).toHaveBeenCalledWith(AUTH, timbreType)
    expect(savedBody().timbreId).toBe('default-timbre-id')
  })

  it('传入音色时不拉默认音色', async () => {
    await createCharacter(buildInput({ timbre_id: 'manual-timbre-id' }), AUTH)

    expect(mocks.client.listTimbres).not.toHaveBeenCalled()
    expect(savedBody().timbreId).toBe('manual-timbre-id')
  })

  it('未传音色时取音色列表第一个', async () => {
    mocks.client.listTimbres.mockResolvedValue([
      {
        id: 'first-timbre-id',
        name: '第一个音色',
        timbreVal: 'first_voice',
        audio: 'https://img.ideaflow.pro/first.mp3',
        type: 'F',
      },
      {
        id: 'second-timbre-id',
        name: '第二个音色',
        timbreVal: 'second_voice',
        audio: 'https://img.ideaflow.pro/second.mp3',
        type: 'F',
      },
    ])

    await createCharacter(buildInput({ gender: '女' }), AUTH)

    expect(savedBody().timbreId).toBe('first-timbre-id')
  })

  it('返回保存接口给出的真实角色 id', async () => {
    const result = await createCharacter(buildInput(), AUTH)

    expect(result).toEqual({ character_id: SAVED_ID })
    expect(result.character_id).not.toBe(PRE_ID)
  })

  it('按 CartoonParam 映射保存请求体', async () => {
    await createCharacter(buildInput(), AUTH)

    expect(mocks.client.saveCartoon).toHaveBeenCalledWith(AUTH, {
      type: 'normal',
      id: PRE_ID,
      name: '阿凯',
      gender: '男',
      avatar: 'https://img.ideaflow.pro/flow-batch/avatar.png',
      banner: 'https://img.ideaflow.pro/flow-batch/banner.png',
      summary: '退休工程师',
      character: '耐心温和',
      locution: '善于用生活比喻讲清楚问题',
      timbreId: 'default-timbre-id',
      isAiGenerated: '1',
      bannerIsAiGenerated: '0',
    })
  })
})
