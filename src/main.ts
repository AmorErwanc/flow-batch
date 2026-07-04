import { getConfig } from './config.js'
import { buildApp } from './http/app.js'
import { logger } from './logger.js'

async function main(): Promise<void> {
  const config = getConfig()
  const app = await buildApp()
  await app.listen({ host: '0.0.0.0', port: config.PORT })
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'flow-batch up')

  let shutdownStarted = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownStarted) return
    shutdownStarted = true
    logger.info({ signal }, 'shutting down')
    try {
      await app.close()
      logger.info('shutdown complete')
      process.exit(0)
    } catch (error) {
      logger.error({ error }, 'shutdown error')
      process.exit(1)
    }
  }

  process.on('SIGTERM', (signal) => void shutdown(signal))
  process.on('SIGINT', (signal) => void shutdown(signal))
}

main().catch((error: unknown) => {
  logger.error({ error }, 'startup failed')
  process.exit(1)
})
