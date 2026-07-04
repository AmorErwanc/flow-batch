import pino, { type LoggerOptions } from 'pino'
import { getConfig } from './config.js'

const config = getConfig()

const isDev = config.NODE_ENV !== 'production'

const baseOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
  base: {
    app: config.LOKI_LABELS_APP,
    env: config.LOKI_LABELS_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}

/** 生产用 pino-loki，本地开发走 pino-pretty */
const transportOptions = config.LOKI_HOST
  ? {
      target: 'pino-loki',
      options: {
        host: config.LOKI_HOST,
        labels: {
          app: config.LOKI_LABELS_APP,
          env: config.LOKI_LABELS_ENV,
        },
        batching: true,
        interval: 5,
      },
    }
  : isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: false,
          translateTime: 'SYS:standard',
        },
      }
    : undefined

export const logger = transportOptions
  ? pino({ ...baseOptions, transport: transportOptions })
  : pino(baseOptions)
