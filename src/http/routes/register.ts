/**
 * 路由注册总入口。
 * PR#1 只挂 /health；后续 PR 加：
 *   - PR#2 /image
 *   - PR#3 /character
 *   - PR#4 /flow
 */
import type { FastifyInstance } from 'fastify'
import { characterRoute } from '../../routes/character.js'
import { flowRoute } from '../../routes/flow.js'
import { healthRoute } from '../../routes/health.js'
import { imageRoute } from '../../routes/image.js'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoute)
  await app.register(imageRoute)
  await app.register(characterRoute)
  await app.register(flowRoute)
}
