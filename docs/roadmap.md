# dsh-cosplay 路线图与设计决策

## 目标（已确认）

> 完成一个针对 DeepSeek Harness 的角色扮演（cosplay）插件：
> 开启角色扮演模式后，dsh 从默认的通用 Agent 变为指定角色对话风格的 Agent 助手，
> 使工作流程更有趣味性与陪伴感；同时支持装载该插件的用户自定义任何角色。

### 功能模块

1. **设置页左侧侧边栏新增插件设定项**：角色配置与管理。
2. **新增自定义模式 Cosplay mode**：仅当该模式开启时插件生效。
3. **Git 版本管理 + GitHub MIT 开源**。

## 设计决策（Round 2 敲定，基于 DSH 0.1.0-rc.6 实测）

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **Cosplay mode = agent preset**（id `cosplay`，显示名「Cosplay 模式」） | 用户在新建会话时选择该预设（或设为默认）即开启模式；会话运行在 cosplay 预设上时，`cosplay_*` 工具与 `{{cosplay_active}}` 变量才存在 —— "仅当开启模式时插件生效"由 preset 平面天然保证 |
| D2 | **角色库 = settings 命名空间 `cosplay`** | 持久化于 `$DSH_HOME/settings.yaml` 的 `cosplay:` 段；settings 服务提供 schema 校验、热重载与 revision 栅栏写入。数据模型：`{ activeRole: string\|null, roles: RoleCard[] }`，RoleCard 字段见 src/store.js |
| D3 | **人格注入 = persona 行 + `{{cosplay_active}}` 变量** | preset 的 persona 行文本引用变量；变量由 `dsh-cosplay/preset` 行在**每次模型步骤组装时**从角色库实时求值 —— 会话中切换角色，下一个模型步骤即生效，无需重建会话 |
| D4 | **模式门控在 preset 平面** | host 核心行只做被动基础设施（settings 命名空间、cosplay 服务、预设安装）；不注册任何全局工具/提示词。cosplay_* 工具只在 cosplay 预设作用域注册 |
| D5 | **设置页 UI = `settings.section` 列表条目**（id `cosplay`，label「角色扮演」） | 与 General / Models / Plugins 同级的新设置页；客户端半区用 `__ModuleLoader__` CJS-factory 格式（与内置客户端包一致），由 package.json 的 `dsh.client` 声明自动装载 |
| D6 | **preset 随包安装 = 完整独立组合文件** | `preset/cosplay/` 是从 standard 复制并改造的完整组合（persona 注入 + cosplay-preset 行），host 核心行启动时幂等复制到 `$DSH_HOME/.agent-presets/cosplay/`（已存在不覆盖）；不做运行时组合拼接，避免脆弱性 |
| D7 | **纯 JS ESM，无构建步骤** | 插件源码直接是运行时格式（主机面普通 ESM；浏览器面 loader-factory），`pnpm build` 不再需要；依赖仅 schemastery / dsh-settings / dsh-tools / dsh-home-paths（均为盒内包） |
| D8 | 内置 2 个示例角色（小林 / 前辈酱），首次安装种子写入 | 开箱即用，用户可随时增删改 |

## 需求 → 机制映射

| 需求 | 机制 | 状态 |
| --- | --- | --- |
| Cosplay mode（模式开关） | agent preset `cosplay`（随包自动安装到用户预设根） | ✅ Round 2 |
| 角色数据模型与持久化 | settings 命名空间 `cosplay`（schema 校验 + 热重载） | ✅ Round 2 |
| 人格注入（动态生效） | persona 行 + `systemPrompt.variable('cosplay_active')` 实时求值 | ✅ Round 2（已动态原型验证） |
| cosplay_* 工具（模式门控） | preset 平面注册 `cosplay_show/list/switch/upsert/remove` | ✅ Round 2 |
| 设置页侧边栏「角色扮演」项 | client 半区注册 `settings.section`（占位页） | 🚧 Round 2 已注册，完整 CRUD UI 在 Round 3 |
| 用户自定义任意角色 | cosplay_upsert 工具 + 设置页表单（Round 3） | 🚧 |
| Git + GitHub MIT | git 已初始化（main，2 提交）；GitHub 推送待网络/凭据 | 🚧 后续轮次 |

## 验证记录（Round 2）

- ✅ `src/store.js` 纯函数：6/6 单元测试通过（node test/store.test.mjs）
- ✅ 全部源文件 `node --check` 语法通过；patch/preset YAML 解析通过
- ✅ **动态原型（真实运行时）**：`systemPrompt.variable('cosplay_active')` 在提示词组装中渲染成功；`systemPrompt.section` 进入组装；`ctx.provide('cosplay')` 服务对消费者可见；工具注册出现在工具目录
- ⚠️ 未验证（环境限制）：settings.register 实际写入 $DSH_HOME/settings.yaml、客户端 UI 实际渲染、预设 mount（`standingKeyFor`）——需在可安装插件的完整环境（有网络）中做端到端验证

## 待办（后续轮次）

- [ ] Round 3：设置页「角色扮演」完整 CRUD UI（经 settings scope 读写角色库）+ `/cosplay` 命令
- [ ] Round 4：端到端验证（真实 bundle 安装 → 新建 Cosplay 模式会话 → 扮演生效 → 切换角色即时生效）；`standingKeyFor('cosplay')` 校验
- [ ] Round 5：README/文档完善、GitHub 推送、MIT 开源发布（可选 npm publish）
- [ ] 待定：`agent-presets` 行 `roots` 注册 bundle 预设目录的可行性（替代运行时复制）；角色卡是否支持 `complete: true` 完全替换提示词
