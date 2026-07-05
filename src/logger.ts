import pino, { type LoggerOptions } from 'pino'
import { getConfig } from './config.js'

const config = getConfig()

const isDev = config.NODE_ENV !== 'production'

const MILLISECONDS_TO_NANOSECONDS = 1_000_000n

/** pino-loki 期望 19 位纳秒时间戳，避免它自己拿 ISO 字符串换算成 NaN 让 Loki 拒收 */
function lokiTimestamp(): string {
  return `,"time":"${BigInt(Date.now()) * MILLISECONDS_TO_NANOSECONDS}"`
}

const baseOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
  base: {
    app: config.LOKI_LABELS_APP,
    env: config.LOKI_LABELS_ENV,
  },
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
        batching: false,
        // 送 19 位纳秒时间戳，pino-loki 会原样透传，不做算术，避免 NaN
        replaceTimestamp: false,
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

const timestamp = config.LOKI_HOST ? lokiTimestamp : pino.stdTimeFunctions.isoTime

export const logger = transportOptions
  ? pino({ ...baseOptions, timestamp, transport: transportOptions })
  : pino({ ...baseOptions, timestamp })
