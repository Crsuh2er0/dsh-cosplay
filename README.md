# dsh-cosplay

> 让 DeepSeek Harness 扮演任何角色 —— Cosplay mode 插件

dsh-cosplay 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)
的角色扮演（cosplay）插件。开启角色扮演模式后，dsh 会从默认的通用 Agent 变为
指定角色对话风格的 Agent 助手，让工作流程更有趣味性与陪伴感；用户可以完全自定义
任何角色。

## 状态

**Round 2 —— 核心实现（当前）**：主机侧核心、Cosplay 模式预设、角色库数据模型
与 `cosplay_*` 工具已完成并通过验证；设置页「角色扮演」入口已注册（完整管理界面
在下一轮）。

## 工作原理

- **Cosplay mode = agent preset**：安装插件后，`$DSH_HOME/.agent-presets/cosplay/`
  自动出现「Cosplay 模式」预设。新建会话时选择它即开启模式。
- **人格注入**：预设的 persona 行引用 `{{cosplay_active}}` 变量，该变量由插件在
  每个模型步骤实时从角色库求值 —— 会话中切换角色，下一轮对话即生效。
- **角色库**：持久化在 `$DSH_HOME/settings.yaml` 的 `cosplay:` 段（schema 校验、
  热重载）；内置小林、前辈酱两个示例角色。
- **模式门控**：`cosplay_*` 工具只存在于 cosplay 预设作用域，普通会话完全不受影响。

## 功能模块

1. **Cosplay mode**：选择「Cosplay 模式」预设即开启（🚧 Round 2 已实现）。
2. **设置页侧边栏「角色扮演」**：新增设置页（🚧 入口已注册，完整角色管理 UI 下一轮）。
3. **自定义任意角色**：`cosplay_upsert` 工具 + 设置页表单（下一轮）。

## 目录结构

```text
dsh-cosplay/
├── package.json           # npm 包：dsh.bundle.patch（bundle 层）+ dsh.client（浏览器半区）
├── cordis.patch.yml       # 主机组合补丁：插入 cosplay-core 行
├── src/
│   ├── store.js           # 角色库纯函数（零依赖，可独立测试）
│   ├── index.js           # 主机核心：settings 命名空间 + cosplay 服务 + 预设自动安装
│   ├── preset.js          # Cosplay 预设行：{{cosplay_active}} 变量 + cosplay_* 工具
│   └── client.js          # 浏览器半区：设置页「角色扮演」入口（__ModuleLoader__ 格式）
├── preset/cosplay/        # Cosplay 模式预设模板（自动安装到用户预设根）
│   ├── preset.yml
│   └── agent.cordis.yml   # = standard 完整组合 + persona 注入 + cosplay-preset 行
├── test/store.test.mjs    # 纯函数单元测试（6 用例）
└── docs/                  # 规范笔记与路线图
```

## 开发

```bash
npm test        # 运行角色库单元测试（node，零依赖）
npm run check   # 全部源文件语法检查
```

## 验证状态

- 角色库纯函数 6/6 测试通过；语法与 YAML 校验通过
- 动态原型（真实运行时）验证：persona 变量渲染、提示词段落、服务提供、工具注册
- 端到端（真实 bundle 安装 → 扮演会话）待有网络环境后验证（Round 4）

## 许可

MIT — 见 [LICENSE](LICENSE)。
