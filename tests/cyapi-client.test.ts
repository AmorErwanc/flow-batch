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
    expect(JSON.parse(String(init.body))).toEqual({ texts: ['安全文本', '违规文本', '兜底文本'] })
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

  it('登录失效不降级，继续抛给上层处理', async () => {
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
