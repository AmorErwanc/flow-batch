import { z } from 'zod'

const IMG_IDEAFLOW_HOST = 'img.ideaflow.pro'

function isImgIdeaflowUrl(value: string): boolean {
  try {
    return new URL(value).hostname === IMG_IDEAFLOW_HOST
  } catch {
    return false
  }
}

export const imgIdeaflowUrlSchema = z
  .string()
  .url()
  .refine(isImgIdeaflowUrl, `图片 URL 必须是 ${IMG_IDEAFLOW_HOST} 域名`)
