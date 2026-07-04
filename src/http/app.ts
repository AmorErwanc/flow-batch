/**
 * Fastify 组装：跟 dream-agent / mingle-api 骨架保持一致。
 * 组装序参考 ~/backend/conventions/api-design.md。
 */
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import { ulid } from 'ulid'

import { logger } from '../logger.js'
import { registerErrorHandler } from './error-handler.js'
import { registerResponseWrapper } from './middleware/response-wrapper.js'
import { requireDreamaSuperCreator } from './middleware/dreama-auth.js'
import { SERVICE_PREFIX } from './path-constants.js'
import { registerRoutes } from './routes/register.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    genReqId: () => `req_${ulid()}`,
    bodyLimit: 1_048_576,
  })

  // 1. 覆盖 JSON body parser（支持空 body + application/*+json 变体）
  registerJsonBodyParser(app)

  // 2. 错误处理 + 响应壳（早于路由）
  registerErrorHandler(app)
  registerResponseWrapper(app)

  // 3. 安全 + CORS
  await app.register(helmet, {
    crossOriginResourcePolicy: 'cross-origin',
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
  await app.register(cors, {
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })

  // 4. 鉴权 hook（超级创作者校验；/health 等公共路径在中间件里跳过）
  app.addHook('onRequest', requireDreamaSuperCreator)

  // 5. 业务路由挂在服务前缀下
  await app.register(
    async (scoped) => {
      await registerRoutes(scoped)
    },
    { prefix: SERVICE_PREFIX },
  )

  return app
}

function registerJsonBodyParser(server: FastifyInstance): void {
  server.removeContentTypeParser('application/json')
  server.addContentTypeParser(
    /^application\/(?:[\w.-]+\+)?json$/,
    { parseAs: 'string' },
    (_request, body, done) => {
      const rawBody = typeof body === 'string' ? body : body.toString('utf8')
      if (rawBody.length === 0) {
        done(null, {})
        return
      }
      try {
        done(null, JSON.parse(rawBody) as unknown)
      } catch (error) {
        const e = error as Error & { code?: string; statusCode?: number }
        e.code = 'FST_ERR_CTP_INVALID_JSON_BODY'
        e.statusCode = 400
        done(e)
      }
    },
  )
}
