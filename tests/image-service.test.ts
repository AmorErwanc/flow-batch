import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BizError } from '../src/lib/errors.js'
import type { DreamaAuth } from '../src/http/middleware/dreama-auth.js'
import type { GenerateImageInput } from '../src/routes/image.js'

const mocks = vi.hoisted(() => ({
  attachUpload: vi.fn(),
  createCyapiClient: vi.fn(),
}))

vi.mock('../src/services/cyapi-client.js', () => ({
  createCyapiClient: mocks.createCyapiClient,
}))

const auth: DreamaAuth = {
  authorization: 'metatube-test-token',
  uid: '000004550035214806040581',
}

function buildInput(overrides: Partial<GenerateImageInput> = {}): GenerateImageInput {
  return {
    prompt: '一张青少年模式测试图',
    aspect_ratio: '2048x2048',
    max_images: 2,
    reference_urls: [
      'https://img.ideaflow.pro/ref/a.jpg',
      'https://img.ideaflow.pro/ref/b.jpg',
    ],
    model: 'doubao-seedream-4.5',
    call_type: '青少年模式批量-测试',
    ...overrides,
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

function imageResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg' },
  })
}

describe('image-service', () => {
  beforeEach(() => {
    process.env.LLM_API_BASE_URL = 'https://tools.ideaflow.pro/llm'
    process.env.LLM_API_KEY = 'test-llm-key'
    process.env.CYAPI_BASE_URL = 'https://cyapi.ideaflow.pro'
    process.env.STUDIO_NODEAPI_BASE_URL = 'https://studio.ideaflow.pro/nodeapi/ideaflow'

    vi.useFakeTimers()
    vi.setSystemTime(1783100000000)
    mocks.attachUpload.mockReset()
    mocks.attachUpload
      .mockResolvedValueOnce('https://img.ideaflow.pro/flow-batch/000004550035214806040581/img-1.jpg')
      .mockResolvedValueOnce('https://img.ideaflow.pro/flow-batch/000004550035214806040581/img-2.jpg')
    mocks.createCyapiClient.mockReset()
    mocks.createCyapiClient.mockReturnValue({ attachUpload: mocks.attachUpload })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('调用 llm-api 生图并把 reference_urls 映射为 reference_images，再转存成 img 域名 URL', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      vi.setSystemTime(Date.now() + 5)
      const requestUrl = String(url)
      if (requestUrl.endsWith('/image/generate')) {
        return jsonResponse({
          code: 0,
          message: 'success',
          data: {
            image_urls: [
              'https://tools.ideaflow.pro/api/storage/preview?key=images%2Fgenerated%2Fa.jpg',
              'https://tools.ideaflow.pro/api/storage/preview?key=images%2Fgenerated%2Fb.jpg',
            ],
            elapsed_time: 12.3,
          },
        })
      }
      return imageResponse()
    })
    vi.stubGlobal('fetch', fetchMock)

    const { generateImage } = await import('../src/services/image-service.js')
    const output = await generateImage(buildInput(), auth)

    expect(output.image_urls).toEqual([
      'https://img.ideaflow.pro/flow-batch/000004550035214806040581/img-1.jpg',
      'https://img.ideaflow.pro/flow-batch/000004550035214806040581/img-2.jpg',
    ])
    expect(output.elapsed_ms).toBeGreaterThan(0)

    const llmCall = fetchMock.mock.calls[0]
    expect(String(llmCall?.[0])).toBe('https://tools.ideaflow.pro/llm/image/generate')
    const llmInit = llmCall?.[1] as RequestInit
    expect(llmInit.headers).toMatchObject({
      'X-API-Key': 'test-llm-key',
      'Content-Type': 'application/json',
    })
    const parsedBody = JSON.parse(String(llmInit.body)) as Record<string, unknown>
    expect(parsedBody).toMatchObject({
      model: 'doubao-seedream-4.5',
      prompt: '一张青少年模式测试图',
      aspect_ratio: '2048x2048',
      max_images: 2,
      reference_images: [
        'https://img.ideaflow.pro/ref/a.jpg',
        'https://img.ideaflow.pro/ref/b.jpg',
      ],
      call_type: '青少年模式批量-测试',
    })
    expect(parsedBody).not.toHaveProperty('generation_mode')
    expect(parsedBody).not.toHaveProperty('quality')
    expect(parsedBody).not.toHaveProperty('provider_channel')

    expect(mocks.createCyapiClient).toHaveBeenCalledWith(
      'https://cyapi.ideaflow.pro',
      'https://studio.ideaflow.pro/nodeapi/ideaflow',
    )
    expect(mocks.attachUpload).toHaveBeenCalledTimes(2)
    expect(mocks.attachUpload).toHaveBeenNthCalledWith(
      1,
      auth,
      'flow-batch/000004550035214806040581/',
      expect.any(Blob),
      expect.stringMatching(/^img-\d+-0-[0-9a-z]+\.jpg$/),
    )
    expect(mocks.attachUpload).toHaveBeenNthCalledWith(
      2,
      auth,
      'flow-batch/000004550035214806040581/',
      expect.any(Blob),
      expect.stringMatching(/^img-\d+-1-[0-9a-z]+\.jpg$/),
    )
  })

  it('gpt-image-2 分支透传 quality/background/moderation/provider_channel，且不带 generation_mode', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith('/image/generate')) {
        return jsonResponse({
          code: 0,
          data: {
            image_urls: [
              'https://tools.ideaflow.pro/api/storage/preview?key=x.png',
              'https://tools.ideaflow.pro/api/storage/preview?key=y.png',
            ],
          },
        })
      }
      return imageResponse()
    })
    vi.stubGlobal('fetch', fetchMock)

    const { generateImage } = await import('../src/services/image-service.js')
    await generateImage(
      buildInput({
        model: 'gpt-image-2',
        quality: 'high',
        background: 'opaque',
        moderation: 'low',
        provider_channel: 'kapon',
      }),
      auth,
    )

    const llmInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const parsed = JSON.parse(String(llmInit.body)) as Record<string, unknown>
    expect(parsed).toMatchObject({
      model: 'gpt-image-2',
      quality: 'high',
      background: 'opaque',
      moderation: 'low',
      provider_channel: 'kapon',
    })
    expect(parsed).not.toHaveProperty('generation_mode')
  })

  it('seedream 分支即使传了 gpt-image-2 专有字段也不会带上游', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith('/image/generate')) {
        return jsonResponse({
          code: 0,
          data: {
            image_urls: [
              'https://tools.ideaflow.pro/api/storage/preview?key=x.jpg',
              'https://tools.ideaflow.pro/api/storage/preview?key=y.jpg',
            ],
          },
        })
      }
      return imageResponse()
    })
    vi.stubGlobal('fetch', fetchMock)

    const { generateImage } = await import('../src/services/image-service.js')
    await generateImage(
      buildInput({
        model: 'doubao-seedream-4.5',
        quality: 'high',
        provider_channel: 'azure',
      }),
      auth,
    )

    const llmInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const parsed = JSON.parse(String(llmInit.body)) as Record<string, unknown>
    expect(parsed.model).toBe('doubao-seedream-4.5')
    expect(parsed).not.toHaveProperty('quality')
    expect(parsed).not.toHaveProperty('provider_channel')
    expect(parsed).not.toHaveProperty('generation_mode')
  })

  it('llm-api 返回业务失败时抛 UPSTREAM_LLM_FAILED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 1005,
          message: '模型调用失败',
          data: null,
        }),
      ),
    )

    const { generateImage } = await import('../src/services/image-service.js')
    await expect(generateImage(buildInput(), auth)).rejects.toMatchObject({
      code: 'UPSTREAM_LLM_FAILED',
    } satisfies Partial<BizError>)
    expect(mocks.attachUpload).not.toHaveBeenCalled()
  })
})
