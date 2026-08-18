# dsh-cosplay 路线图与设计决策

## 目标（已确认）

> 完成一个针对 DeepSeek Harness 的角色扮演（cosplay）插件：
> 开启角色扮演模式后，dsh 从默认的通用 Agent 变为指定角色对话风格的 Agent 助手，
> 使工作流程更有趣味性与陪伴感；同时支持装载该插件的用户自定义任何角色。

### 功能模块

1. **设置页左侧侧边栏新增插件设定项**：角色配置与管理。
2. **新增自定义模式 Cosplay mode**：仅当该模式开启时插件生效。
3. **Git 版本管理 + GitHub MIT 开源**。

## 设计决策（Round 3 与用户讨论后敲定）

> 开发流程约定：先讨论对齐、再小步落地、每轮验证；不一次做完。

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **模式形态 = 全局设置开关**（非独立预设） | 用户提出独立模式无法与其他自定义模式（preset）组合——一个会话只能运行一个 preset，故放弃 Round 2 的预设形态。**纯全局开关**：开关 ON → 所有会话（含子代理，已确认）统一扮演 |
| D2 | **角色库 = settings 命名空间 `cosplay`** | `$DSH_HOME/settings.yaml` 的 `cosplay:` 段；schema 校验、热重载、revision 栅栏。数据模型：`{ enabled: bool, activeRole: string\|null, roles: RoleCard[] }`，RoleCard 字段见 src/store.js |
| D3 | **人格注入 = 全局追加人格段 + `{{cosplay_active}}` 变量** | 段名 `cosplay-persona`（≠ persona 段名 `deployment:persona`，无同名冲突），order = PERSONA_ORDER+1；变量每次模型步骤组装求值：开→角色卡，关→**空串静默回退**。开/关/换角色下一模型步骤即生效（已实测） |
| D4 | **工具软禁用** | 全局注册 `cosplay_show/list/switch/upsert/remove`；`cosplay_switch` 在开关关闭时返回"请先开启"；角色库管理工具（list/show/upsert/remove）始终可用 |
| D5 | **默认关闭（opt-in）** | 安装后默认不扮演，用户主动开启；内置示例角色（小林 / 前辈酱）种子写入，角色库管理在关闭时也可用 |
| D6 | **不安装、不依赖任何预设** | 独立「Cosplay 模式」预设已移除（用户确认）；无 preset 行、无 preset/ 目录 |
| D7 | **设置页「角色扮演」= `settings.section` 条目** | 与 General / Models / Plugins 同级；承载开关 + 角色 CRUD；数据通道 `ctx.settingsScope.bind({namespace:'cosplay'})`（dsh-client-ui-settings 的 Host 传输）+ `useSyncExternalStore` |
| D8 | **纯 JS ESM，无构建步骤** | 主机面普通 ESM；浏览器面 `__ModuleLoader__` CJS-factory（经 `dsh.client` 声明装载）；依赖 schemastery + 4 个盒内 peer 包 |

## 需求 → 机制映射

| 需求 | 机制 | 状态 |
| --- | --- | --- |
| Cosplay mode（开关） | settings `cosplay.enabled` 全局开关 + 变量每次组装求值 | ✅ Round 3 |
| 角色数据模型与持久化 | settings 命名空间 `cosplay` | ✅ Round 3 |
| 人格注入（实时生效） | 全局追加段 `cosplay-persona` + `{{cosplay_active}}` | ✅ Round 3（动态原型实测） |
| cosplay_* 工具 | 全局注册 + switch 软禁用 | ✅ Round 3 |
| 设置页「角色扮演」（开关 + CRUD） | client 半区 `settings.section` + settingsScope | 🚧 代码已写，浏览器渲染待端到端验证 |
| 用户自定义任意角色 | cosplay_upsert 工具 + 设置页表单 | ✅（工具）/ 🚧（表单渲染待验证） |
| Git + GitHub MIT | git 已初始化（main）；GitHub 推送待网络/凭据 | 🚧 后续轮次 |

## 验证记录

- ✅ `src/store.js` 纯函数：6/6 单元测试通过（含 enabled 门控语义）
- ✅ 全部源文件 `node --check`；patch YAML / package.json 校验通过
- ✅ **动态原型（真实运行时）**：`{{probe_active}}` 变量关闭时渲染空串——组装不报错、段落存在但无角色内容；开启时角色卡渲染；开关状态**每次组装实时求值**（模拟 mid-conversation 切换）
- ✅ 导出核验：`PERSONA_ORDER`(0) / `PERSONA_SECTION`(`deployment:persona`) 来自 dsh-system-prompt；`settingsNamespace` / `defineTool` / schemastery 均已核验
- ⚠️ 未验证（环境限制）：settings.register 实际写盘、设置页浏览器渲染、工具在真实会话中的可调用性——需可安装插件的完整环境（有网络）端到端验证

## 待办（后续轮次）

- [ ] Round 4：端到端验证（真实 bundle 安装 → 开关 → 扮演生效 → 切角色即时生效 → 设置页渲染）
- [ ] Round 5：README/文档完善、GitHub 推送、MIT 开源发布（可选 npm publish）
- [ ] 可选：`/cosplay` 斜杠命令（快速查看/切换角色）；设置页空态引导；更多内置角色
