/**
 * dsh-cosplay — 主机侧核心插件（组合行 id: cosplay-core）。
 *
 * 职责：
 *   1. 注册 settings 命名空间 `cosplay`（角色库持久化，$DSH_HOME/settings.yaml，
 *      热重载、按 revision 栅栏写入）；
 *   2. 提供 `cosplay` 服务（角色 CRUD / 激活 / 状态），供 preset 行与后续
 *      客户端 UI 消费；
 *   3. 幂等安装 Cosplay 代理预设到 $DSH_HOME/.agent-presets/cosplay/。
 *
 * 本行是主机平面（全局）基础设施：不注册任何模型工具、不注入任何提示词，
 * 因此普通会话（非 Cosplay 模式）完全不受影响 —— 模式门控在 preset 平面上。
 */
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EMPTY_STATE,
  normalizeState,
  applySeeding,
  upsertRole,
  removeRole,
  setActiveRole,
  findRole,
} from './store.js'

export const name = 'cosplay-core'

const RoleCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().optional(),
  description: z.string(),
  style: z.string().optional(),
  rules: z.string().optional(),
  greeting: z.string().optional(),
  sample: z.string().optional(),
})

const CosplaySettingsSchema = z.object({
  activeRole: z.string().nullable().default(null),
  roles: z.array(RoleCardSchema).default([]),
})

export const Config = z.object({
  /** 装载时是否自动把 Cosplay 预设安装到用户预设根（缺省 true）。 */
  autoInstallPreset: z.boolean().default(true),
})

const PRESET_ID = 'cosplay'
const PRESET_SOURCE = fileURLToPath(new URL('../preset/cosplay', import.meta.url))

export function apply(ctx, config) {
  ctx.inject(['settings'], async (settingsCtx) => {
    const ns = settingsNamespace('cosplay')
    const scope = settingsCtx.settings.register(ns, CosplaySettingsSchema)

    const read = () => normalizeState(settingsCtx.settings.get(ns))
    const write = async (next) => {
      await settingsCtx.settings.replace(ns, next)
      return next
    }

    // 首次安装种子：角色库为空时写入内置示例角色并激活第一个。
    const current = read()
    const seeded = applySeeding(current)
    if (seeded.roles.length !== current.roles.length) {
      await settingsCtx.settings.replace(ns, seeded)
    }

    const service = {
      /** 当前完整状态（已规整）。 */
      state: () => read(),
      /** 角色摘要列表（含激活标记）。 */
      list: () => read().roles.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji ?? '', active: r.id === read().activeRole })),
      /** 当前激活角色卡片；未激活返回 null。 */
      active: () => (read().activeRole ? findRole(read(), read().activeRole) ?? null : null),
      /** 创建 / 更新角色。 */
      upsert: async (card) => write(upsertRole(read(), card)),
      /** 删除角色。 */
      remove: async (id) => write(removeRole(read(), id)),
      /** 切换激活角色；null 退出扮演。 */
      setActive: async (id) => write(setActiveRole(read(), id)),
      /** 幂等安装 Cosplay 预设；返回 'exists' | 'installed' | 'skipped'。 */
      installPreset: () => ensureCosplayPreset(),
      scope,
    }

    const disposeService = ctx.provide('cosplay', service)
    void disposeService

    if (config.autoInstallPreset) {
      void service.installPreset().catch((error) => {
        console.error(`[dsh-cosplay] 安装 Cosplay 预设失败: ${error.message}`)
      })
    }
  })
}

/**
 * 把包内 preset/cosplay 模板幂等安装到 $DSH_HOME/.agent-presets/cosplay/。
 * 已存在（含用户自行修改过）时不覆盖。
 */
async function ensureCosplayPreset() {
  const dest = path.join(dshHomePath('.agent-presets'), PRESET_ID)
  const marker = path.join(dest, 'agent.cordis.yml')
  try {
    await fs.access(marker)
    return 'exists'
  } catch {
    /* 目录尚不存在，继续安装 */
  }
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.cp(PRESET_SOURCE, dest, { recursive: true })
  return 'installed'
}
