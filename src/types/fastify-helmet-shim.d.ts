declare module '@fastify/helmet' {
  import type { FastifyPluginAsync } from 'fastify'

  const helmet: FastifyPluginAsync<Record<string, unknown>>
  export default helmet
}
