# DeepSeek Harness 插件开发规范（实测笔记）

> 本文档基于本机安装的 DeepSeek Harness `0.1.0-rc.6`
> （`C:\Users\xd503\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh`）实测整理，
> 作为 dsh-cosplay 开发的规范依据。官方文档位于
> [deepseek-harness/docs/user/develop/basic/publish.md](https://github.com/deepseek-ai/DeepSeek-Harness/blob/HEAD/docs/user/develop/basic/publish.md)。

## 1. 插件平面的两套机制

DSH 的能力全部由 Cordis 插件行（`cordis.yml` 中的行）构成。第三方能力通过两种
方式进入运行时：

| 机制 | 作用范围 | 落点 |
| --- | --- | --- |
| **Bundle（bundle 插件）** | 主机组合（host composition） | npm 包 + `dsh.bundle.patch` 清单，加入 profile 的 `bundles` 列表 |
| **Agent preset（代理预设）** | 单个会话（agent plane） | `$DSH_HOME/.agent-presets/<id>/` 目录（用户根）或部署自带根（system） |

- **Bundle** 负责向主机注册共享能力：注册表、设置、工具、浏览器 UI 等。
- **Agent preset** 负责单个会话的"身份"：persona、工具、提示词段落。一个 preset
  的构成就是一份 `agent.cordis.yml` 组合文件。
- "开启角色扮演模式"的天然实现是 **Cosplay agent preset**：用 `@deepseek-ai/dsh-persona`
  行把该会话的 persona 替换为角色设定，同时挂载 cosplay 专用工具行。

## 2. Bundle 插件规范

### 2.1 清单声明（package.json）

```jsonc
{
  "name": "dsh-cosplay",
  "type": "module",                 // 全部为 ESM
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./src/*": "./src/*",           // 源码随包发布，便于排障
    "./package.json": "./package.json"
  },
  "files": ["lib/", "cordis.patch.yml"],
  "license": "MIT",
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" }   // 关键：bundle 层 patch 文件
  }
}
```

- 包内插件的 peer 依赖须声明其消费的 Service 定义包（如 `@deepseek-ai/cordis`、
  `dsh-session`、`dsh-settings` 等），保证 profile 的扁平 node_modules 回退目录
  可解析它们。
- 参考实现：`@deepseek-ai/dsh-tool-todo`、`@deepseek-ai/dsh-persona`（均在 dsh
  安装目录内）。

### 2.2 Patch 文件（cordis.patch.yml）

顶层是一个 YAML 数组，元素为 loader patch 条目：

```yaml
- insert:            # 追加一行或多行
    - id: cosplay-core
      name: 'dsh-cosplay'      # npm 包名，导出 Cordis 插件
      config: { ... }          # 插件 Config（挂载时按 schema 校验）
      disabled: false
      inject: [serviceName]    # 可选：硬依赖注入

- id: <existing-row-id>   # 定向覆盖先前插入的行
  config: { ... }         # 替换该行【整个】config
  disabled: true
```

要点（源码 `cordis-plugin-include/lib/index.js` 实测）：

- 补丁**整体替换**目标行的 `config`，不做合并；同一行只在一个 bundle 层 + 用户层
  各写一次。
- `insert` 的行按添加顺序编号，同一 patch 列表内后面的条目可以定向前面插入的行。
- 匹配不到行的补丁仅告警并跳过，不报错。
- 允许 `!!js` 表达式（如 `!!js process.env.X ?? 'default'`）。
- 行顺序无装载语义：激活由服务可用性驱动。
- `dsh-base` 层以**一个** `insert` 提供全部基础行；`dsh-web-app` 层在其后按 id
  覆盖；profile 自己的 `cordis.patch.yml` 最后生效（后写胜出）。

### 2.3 Profile（装载单元）

- 位置：`$DSH_HOME/profiles/<name>/`（如 `C:\Users\xd503\.dsh\profiles\web`）。
- 结构：`package.json`（含 `dsh.profile.bundles` 有序列表 + 依赖）、
  `cordis.patch.yml`（用户自己的补丁层）、`pnpm-workspace.yaml`
  （`nodeLinker: hoisted`）。
- 组合顺序：空根 → 按 `bundles` 顺序应用各 bundle 的 patch → 用户 patch →
  CLI 附加层（`--patch`）。
- 模块解析双锚点：bundle 包先从 dsh 安装目录解析，再从 profile 目录解析；
  `$DSH_HOME/profiles/node_modules` 是 dsh 维护的扁平回退目录。
- 安装方式：`dsh plugin --profile <name> install <package>`（或
  `install_dsh_plugin` 工具：corepack pnpm add + 同步 `dsh.profile.bundles`，
  HMR 热加载无需重启）。
- 关键：bundle 包必须声明 `dsh.bundle.patch`，否则装载报错"declares no dsh.bundle"。

## 3. Agent preset 规范

### 3.1 目录与元数据

```
$DSH_HOME/.agent-presets/cosplay/
├── preset.yml          # name / description（可选 order，仅系统自带预设使用）
└── agent.cordis.yml    # 该 preset 的组合文件
```

- 用户根：`$DSH_HOME/.agent-presets/`（`dsh-agent-presets` 的 `includeUserRoot`
  默认开启）。部署自带根在安装目录 `config/agent-presets/`（只读，勿改）。
- id 规则：`[a-z0-9][a-z0-9-]*`，成为目录名。

### 3.2 组合文件关键规则

- **persona 行**：preset 通过 `@deepseek-ai/dsh-persona` 行注册
  `PERSONA_SECTION`，为该会话**遮蔽**部署默认人格。config：
  `{ text, complete?, includeRuntimeContext? }`；`text` 支持 `{{model}}`、
  `{{cwd}}` 占位符。
- **提供服务的行必须放进带 `isolate` realm 的 group**，否则服务发布进进程全局
  realm，第二个会话挂载即冲突，mount 校验会拒绝。
- **只消费的行必须留在 realm 之外**，否则解析不到宿主侧注册表。
- 验证：`agentPresets.standingKeyFor(id)` 会真实组合挂载子树，捕获四类失败
  （包无法解析 / config 无效 / 行未激活 / 服务发布进根 realm）。
- 参考实现：`config/agent-presets/standard/agent.cordis.yml`。

## 4. 浏览器 UI（设置页）

- 客户端插件通过 `slots` 服务向 Slot 注册 UI；设置页完整区块走
  `settings.section`，紧凑偏好项走 `settings.general.item`。
- 主机面插件的配置命名空间由 `ui-settings-plugins` 渲染为可展开卡片。
- 动态 Cordis 插件（`cordis_define`/`cordis_run`）是**临时、进程级**机制，用于
  开发期探测与调试；正式能力应落地为 bundle/preset 组合文件。

## 5. 构建与发布约定

- 源码 `src/`（TypeScript）→ 产物 `lib/`（ESM JS + `lib/types/*.d.ts`），
  `files` 白名单只发 `lib/`。
- `exports` 同时暴露 `./src/*`，方便排障时读源码。
- 发布：npm publish（MIT）；dsh 侧通过 profile bundles 引用包名。

## 6. 本次核实到的参考文件

| 主题 | 路径（安装目录内） |
| --- | --- |
| profile/patch 组合机制 | `node_modules/@deepseek-ai/dsh-app-boot/lib/index.js`（`profile` 段） |
| patch 语义 | `node_modules/@deepseek-ai/cordis-plugin-include/lib/index.js` |
| bundle 示例 | `node_modules/@deepseek-ai/dsh-base/cordis.patch.yml`、`dsh-web-app/cordis.patch.yml` |
| persona 行 | `node_modules/@deepseek-ai/dsh-persona/lib/index.js` |
| preset 示例 | `config/agent-presets/standard/` |
| 插件包示例 | `node_modules/@deepseek-ai/dsh-tool-todo/package.json` |
