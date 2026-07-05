import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DreamaAuth } from '../src/http/middleware/dreama-auth.js'
import { BizError } from '../src/lib/errors.js'
import { createCyapiClient } from '../src/services/cyapi-client.js'

const AUTH: DreamaAuth = {
  authorization: 'metatube-test-token',
  uid: '000004550035214806040581',
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

function createClient() {
  return createCyapiClient('https://cyapi.example.test', 'https://studio.example.test/nodeapi/ideaflow')
}

describe('cyapi-client riskControlTxtBatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('空文本列表不请求下游', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await createClient().riskControlTxtBatch(AUTH, [])

    expect(result).toEqual({ rejected: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('按 texts body 请求风控接口，并解析数组形态的命中结果', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        code: 0,
        msg: 'ok',
        data: [
          { text: '安全文本', rejected: false },
          { text: '违规文本', rejected: true, reason: 'risk' },
          { hit: true },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await createClient().riskControlTxtBatch(AUTH, ['安全文本', '违规文本', '兜底文本'])

    expect(result).toEqual({ rejected: ['违规文本', '兜底文本'] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cyapi.example.test/risk/control/txt/batch')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: AUTH.authorization,
      Uid: AUTH.uid,
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init.body))).toEqual({
      txtList: ['安全文本', '违规文本', '兜底文本'],
      type: 'ugc_review',
    })
  })

  it('兼容对象里 rejected 数组的响应形态', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 0,
          msg: 'ok',
          data: { rejected: ['违规文本'] },
        }),
      ),
    )

    const result = await createClient().riskControlTxtBatch(AUTH, ['违规文本'])

    expect(result).toEqual({ rejected: ['违规文本'] })
  })

  it('风控接口业务失败时降级放行', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 1001,
          msg: 'body format invalid',
          data: null,
        }),
      ),
    )

    const result = await createClient().riskControlTxtBatch(AUTH, ['待检查文本'])

    expect(result).toEqual({ rejected: [] })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('登录失效不降级，继续抛给上层处理 (风控)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          code: 401,
          msg: 'unauthorized',
          data: null,
        }, { status: 401 }),
      ),
    )

    await expect(createClient().riskControlTxtBatch(AUTH, ['待检查文本'])).rejects.toMatchObject({
      code: 'DREAMA_TOKEN_INVALID',
    } satisfies Partial<BizError>)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('cyapi-client applySnowIds 拆批', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('n <= 50 一次请求拿完', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse({
        code: 0,
        data: Array.from({ length: 40 }, (_, i) => `id-${i}`),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const ids = await createClient().applySnowIds(AUTH, 40)

    expect(ids).toHaveLength(40)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('n=40')
  })

  it('n = 51 拆两批(50 + 1)', async () => {
    const responses = [
      Array.from({ length: 50 }, (_, i) => `batch1-${i}`),
      Array.from({ length: 1 }, (_, i) => `batch2-${i}`),
    ]
    let callIdx = 0
    const fetchMock = vi.fn(async () => {
      const body = responses[callIdx]
      callIdx += 1
      return jsonResponse({ code: 0, data: body })
    })
    vi.stubGlobal('fetch', fetchMock)

    const ids = await createClient().applySnowIds(AUTH, 51)

    expect(ids).toHaveLength(51)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('n=50')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('n=1')
  })

  it('50 轮预设需要 213 个 id 拆 5 批(50*4 + 13)', async () => {
    // 50 * 4 + 13 = 213 → 4 批 50 + 1 批 13
    const batchSizes = [50, 50, 50, 50, 13]
    let callIdx = 0
    const fetchMock = vi.fn(async () => {
      const size = batchSizes[callIdx] as number
      callIdx += 1
      const data = Array.from({ length: size }, (_, i) => `b${callIdx}-${i}`)
      return jsonResponse({ code: 0, data })
    })
    vi.stubGlobal('fetch', fetchMock)

    const ids = await createClient().applySnowIds(AUTH, 213)

    expect(ids).toHaveLength(213)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('批量数量不匹配抛 UPSTREAM_CYAPI_FAILED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 0, data: ['only-one'] })),
    )

    await expect(createClient().applySnowIds(AUTH, 50)).rejects.toMatchObject({
      code: 'UPSTREAM_CYAPI_FAILED',
    } satisfies Partial<BizError>)
  })

  it('n <= 0 不请求下游', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await createClient().applySnowIds(AUTH, 0)).toEqual([])
    expect(await createClient().applySnowIds(AUTH, -5)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
