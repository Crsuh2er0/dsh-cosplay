# dsh-cosplay

> 让 DeepSeek Harness 扮演任何角色 —— Cosplay 模式插件

dsh-cosplay 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)
的角色扮演（cosplay）插件。在设置页打开开关后，dsh 会从默认的通用 Agent 变为
指定角色对话风格的 Agent 助手，让工作流程更有趣味性与陪伴感；用户可以完全自定义
任何角色。

## 状态

**Round 3 —— 全局开关形态（当前）**：设置页开关 + 角色库 CRUD 界面 + 全局工具已实现；
核心机制经真实运行时动态原型验证。端到端（真实安装 → 浏览器渲染）待有网络环境验证。

## 工作原理

- **全局开关**：设置页「角色扮演」页打开开关即开启模式（默认关闭，opt-in）；
  开启后所有会话（含子代理）统一扮演，关闭后下一轮对话即回退默认人格。
- **实时生效**：插件注册全局人格段 `cosplay-persona`，内容由 `{{cosplay_active}}`
  变量在**每次模型步骤**从角色库求值 —— 开关切换与角色切换无需重建会话。
- **角色库**：持久化于 `$DSH_HOME/settings.yaml` 的 `cosplay:` 段（schema 校验、
  热重载）；内置小林、前辈酱两个示例角色。
- **工具软禁用**：`cosplay_switch` 在开关关闭时提示先开启；角色库管理
  （`cosplay_show/list/upsert/remove`）始终可用。

## 功能模块

1. **设置页侧边栏「角色扮演」**：新增设置页，承载全局开关与角色管理（列表 /
   激活 / 新建 / 编辑 / 删除）。
2. **Cosplay mode（开关）**：设置页开关开启即生效；也可在对话中用
   `cosplay_switch` 切换角色。
3. **自定义任意角色**：设置页表单或 `cosplay_upsert` 工具随时创建/修改角色卡
   （名称 / 头像 / 设定 / 语气 / 守则 / 开场白 / 示例对话）。

## 目录结构

```text
dsh-cosplay/
├── package.json           # npm 包：dsh.bundle.patch（bundle 层）+ dsh.client（浏览器半区）
├── cordis.patch.yml       # 主机组合补丁：插入 cosplay-core 行（唯一入口）
├── src/
│   ├── store.js           # 角色库纯函数：状态规整 / CRUD / 种子 / persona 渲染（零依赖）
│   ├── index.js           # 主机核心：settings 命名空间 + cosplay 服务 + 全局人格段
│   │                      #   + {{cosplay_active}} 变量 + 全局 cosplay_* 工具
│   └── client.js          # 浏览器半区：设置页「角色扮演」（开关 + 角色 CRUD）
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
- 动态原型（真实运行时）验证：人格段 + 变量组装、空串回退、开关逐模型步骤实时求值、
  服务提供、工具注册
- 端到端（真实 bundle 安装 → 开关 → 扮演会话 → 设置页渲染）待有网络环境验证（Round 4）

## 许可

MIT — 见 [LICENSE](LICENSE)。
