# dsh-cosplay

> 让 DeepSeek Harness 扮演任何角色 —— Cosplay mode 插件

dsh-cosplay 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness)
的角色扮演（cosplay）插件。开启角色扮演模式后，dsh 会从默认的通用 Agent 变为
指定角色对话风格的 Agent 助手，让工作流程更有趣味性与陪伴感；用户可以完全自定义
任何角色。

## 状态

**Round 1 —— 项目初始化**（当前）：

- 依据 DSH 插件开发规范完成项目骨架（bundle 清单、patch 层、源码/文档布局）
- Git 仓库初始化（MIT 开源，准备推送到 GitHub）
- 尚未编写插件代码

## 功能规划

1. **设置页新增插件设定项**：角色配置与管理（角色列表、角色卡编辑、启停）。
2. **Cosplay mode（自定义模式）**：仅当该模式开启时插件生效。
3. **任何角色皆可自定义**：角色卡驱动 persona。

详见 [docs/roadmap.md](docs/roadmap.md) 与 [docs/dsh-plugin-spec.md](docs/dsh-plugin-spec.md)。

## 目录结构

```text
dsh-cosplay/
├── package.json           # npm 包 + dsh bundle 清单（dsh.bundle.patch）
├── cordis.patch.yml       # bundle 补丁层（本轮为空占位，后续插入插件行）
├── tsconfig.json          # TypeScript → lib/ 构建配置
├── src/                   # 插件源码（占位：host/ 主机侧、client/ 浏览器侧）
├── preset/                # Cosplay 代理预设模板（安装到 $DSH_HOME/.agent-presets/）
├── docs/
│   ├── dsh-plugin-spec.md # DSH 插件开发规范实测笔记
│   └── roadmap.md         # 需求映射、设计问题、里程碑
├── LICENSE                # MIT
└── README.md
```

## 开发

```bash
pnpm install    # 安装依赖（需要网络）
pnpm build      # 编译 src → lib
pnpm typecheck  # 仅类型检查
```

## 许可

MIT — 见 [LICENSE](LICENSE)。
