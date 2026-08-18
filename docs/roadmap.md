# dsh-cosplay 路线图与设计问题

## 目标（已确认）

> 完成一个针对 DeepSeek Harness 的角色扮演（cosplay）插件：
> 开启角色扮演模式后，dsh 从默认通用 Agent 变为指定角色对话风格的 Agent 助手，
> 使工作流程更有趣味性与陪伴感；同时支持装载该插件的用户自定义任何角色。

### 功能模块

1. **设置页侧边栏新增插件设定项**：角色配置与管理（角色列表、角色卡编辑、启停等）。
2. **新增自定义模式 Cosplay mode**：仅当该模式开启时插件生效。
3. **Git 版本管理 + GitHub MIT 开源**。

## 需求 → 机制映射（基于 docs/dsh-plugin-spec.md）

| 需求 | 采用的 DSH 机制 | 说明 |
| --- | --- | --- |
| Cosplay mode | **Agent preset**（`cosplay`） | 新会话选择该 preset 即"开启模式"；preset 内的 `dsh-persona` 行将该会话人格替换为角色设定。与系统内置 `ui-agent-preset`（General 设置里为后续会话选择默认 preset）天然衔接 |
| 角色配置与管理 UI | **Client 插件 + settings Slot** | bundle 提供客户端行，向设置页注册插件自己的设定区块（`settings.section` / 侧边栏项）；通过 host RPC（`harness.handle`）读写角色配置 |
| 角色数据持久化 | **Host 插件 + 设置/存储** | 角色库存于 `$DSH_HOME` 下（待定：`settings.yaml` 命名空间 or `dsh-storage-json`）；persona 文本由 preset 生成器从角色卡渲染 |
| 插件本体装载 | **Bundle**（`dsh.bundle.patch`） | 安装 `dsh-cosplay` 包 → profile bundles；patch 插入 host 核心行与 client UI 行 |
| 预置角色模板 | preset 目录随包发布 | `preset/cosplay/` 作为模板，由插件提供安装动作复制到 `$DSH_HOME/.agent-presets/`（或文档化手动安装步骤） |

## 待讨论的设计问题（后续对话逐项敲定）

1. **Cosplay 模式的开关形式**：
   - A. 仅靠 preset 选择（创建会话时选 Cosplay 预设）——零新增 UI，最贴合 DSH 现有模型；
   - B. 设置页加开关，按会话动态切换 persona（需要运行时改 systemPrompt 段落）；
   - C. 两者结合。
2. **角色配置的数据模型**：角色卡字段（名称、头像/Emoji、人格描述、语气、示例对话、
   行为守则、默认工具偏好等）；一份角色卡如何渲染成 persona `text`。
3. **角色库的持久化位置与格式**：`settings.yaml` 自定义命名空间 vs
   `$DSH_HOME/storages/` 下的 JSON；是否需要热重载。
4. **设置页 UI 形态**：新侧边栏一级项 vs 插件配置卡片（`ui-settings-plugins` 已能
   渲染插件命名空间）vs 两者。
5. **cosplay preset 的安装方式**：插件提供命令/工具一键写入用户 preset 根，还是
   文档化手动放置；preset 内容是否引用本 bundle 提供的工具行。
6. **与 persona 抢占的边界**：preset 的 persona 行会遮蔽部署默认人格；角色卡中
   是否允许覆盖 `complete: true`（完全替换系统提示）——影响安全与提示注入边界。
7. **GitHub 仓库**：仓库名/可见性（建议 `dsh-cosplay`，public）；npm 包名是否
   用 scope（如 `@zelinw1/dsh-cosplay`）避免与 npm 现有 `dsh-cosplay` 冲突。
8. **多语言**：角色卡与 UI 是否中英双语。

## 里程碑

- [x] Round 1：规范调研 + 项目骨架 + Git 初始化（本仓库）
- [ ] Round 2：确定 Cosplay 模式形态与角色数据模型，落地 `cordis.patch.yml` 行 + host 核心
- [ ] Round 3：设置页侧边栏/插件设定 UI + 角色 CRUD
- [ ] Round 4：cosplay preset 生成/安装 + 端到端验证（真实会话）
- [ ] Round 5：README/文档完善、GitHub 推送、MIT 开源发布（可选 npm publish）
