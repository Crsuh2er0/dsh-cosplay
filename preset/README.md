# preset/ — Cosplay 代理预设（模板）

`cosplay` 是插件的"模式载体"：用户在创建会话时选择该 preset（或将其设为默认），
即开启 Cosplay mode。本目录存放**随包发布的预设模板**，由插件安装时复制到用户
预设根 `$DSH_HOME/.agent-presets/cosplay/`（也可手动放置）。

预期内容（后续轮次实现，本轮仅骨架）：

```text
preset/cosplay/
├── preset.yml           # name: Cosplay 模式 / description: ...
└── agent.cordis.yml     # 组合文件：
    ├── persona 行        # @deepseek-ai/dsh-persona，text 由角色卡渲染（{{model}}/{{cwd}} 占位）
    ├── cosplay 工具行    # 如角色速查、切角色等（挂载于 preset 作用域）
    └── 必要的工具行       # 视设计决定（沿用 standard 的子集或独立精简集）
```

设计要点（见 docs/dsh-plugin-spec.md §3 与 docs/roadmap.md）：

- persona 行必须在 preset 作用域内注册，遮蔽部署默认人格；
- 提供服务的行必须包进带 `isolate` realm 的 group；
- 预设安装后可用 `standingKeyFor('cosplay')` 做 mount 校验。

角色卡的**运行时切换**（同一会话内换角色）属于后续设计问题，尚未定案。
