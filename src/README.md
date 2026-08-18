# src/ — 源码布局（规划）

TypeScript 源码，构建产物输出到 `lib/`（见根目录 tsconfig.json）。
当前为占位，无实现；依赖安装（`pnpm install`，需网络）后可用
`pnpm build` / `pnpm typecheck`。

```text
src/
├── index.ts            # 包入口（占位）
├── host/               # 主机侧：cosplay 核心服务、角色库读写、工具（规划）
│   └── ...
└── client/             # 浏览器侧：设置页设定区块 / 侧边栏项（规划）
    └── ...
```

主机侧与浏览器侧的拆分依据（见 docs/dsh-plugin-spec.md）：

- 文件、持久化、工具注册 → Host；
- 设置页 Slot UI、主题 → Client；
- Client→Host 通信用 `harness.handle` / `host.call`（仅 JSON）。
