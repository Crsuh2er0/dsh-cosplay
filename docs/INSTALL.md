# 安装与端到端验证指南

## 安装（本地 link 方式，无需发布到 npm）

在目标 profile 目录执行（以 web profile 为例）：

```powershell
# 1. 进入 profile
cd $env:USERPROFILE\.dsh\profiles\web

# 2. 以 link 方式加入本插件（源码即运行时，无需构建）
corepack pnpm add dsh-cosplay@link:F:/dsh-cosplay

# 3. 把 bundle 名加入 dsh.profile.bundles（编辑该目录下的 package.json）
#    "dsh": { "profile": { "bundles": [ "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-cosplay" ] } }

# 4. 重启 dsh web 服务（HMR 若未自动装载 bundle 层则必须重启）
```

> 依赖说明：`dsh-cosplay` 的运行时依赖仅 `@deepseek-ai/schemastery`（pnpm 从
> registry 安装）；peer 依赖（`@deepseek-ai/dsh-settings` / `dsh-tools` /
> `dsh-system-prompt` / `dsh-home-paths` / `cordis`）由 dsh 安装的扁平回退目录
> （`$DSH_HOME/profiles/node_modules`）在运行时解析，无需在 profile 单独安装。

## 端到端验证清单

### 主机侧（装载是否成功）

- [ ] dsh 启动日志无 `N row(s) did not activate` 报错、无 `Cannot find package dsh-cosplay`
- [ ] 工具目录出现 `cosplay_show / cosplay_list / cosplay_switch / cosplay_upsert / cosplay_remove`
- [ ] `$DSH_HOME/settings.yaml` 出现 `cosplay:` 段（enabled/activeRole/roles，含种子角色）
- [ ] 在任意会话中调用 `cosplay_switch`：开关未开启时返回"请先在设置页…打开开关"

### 浏览器侧（设置页）

- [ ] 设置（侧边栏底部齿轮）→ 左侧导航出现「角色扮演」项（与 General / Models / Plugins 同级）
- [ ] 页面显示主开关（默认关闭）与角色库（小林 / 前辈酱）
- [ ] 打开开关 → 新建会话对话，模型以角色口吻回复（下一轮生效）
- [ ] 「新建角色」→ 填写角色卡 → 保存 → 列表出现；「设为当前」后对话切换为该角色
- [ ] 关闭开关 → 下一轮对话回退默认人格

### 数据落盘

- [ ] 设置页所有操作后，`$DSH_HOME/settings.yaml` 的 `cosplay:` 段同步更新且重启后保留

## 隔离验证环境（不触碰主实例）

本仓库开发时使用了独立 profile `web-e2e` 与独立端口，避免影响正在运行的主实例：

```powershell
# 目录：$env:USERPROFILE\.dsh\profiles\web-e2e（bundle 列表 = base + web-app + dsh-cosplay）
dsh --profile web-e2e --port 3081
# 浏览器打开 http://127.0.0.1:3081 即可验证设置页；与主实例共享 settings.yaml
# （建议只查看设置，不在该实例中打开会话，避免双实例并发写会话日志）
```

### 修改代码后重跑 e2e 实例

插件以"实体复制"方式装进 e2e profile，改代码后需**同步 + 重启**：

```powershell
# 一键：同步 F:\dsh-cosplay → e2e profile 并重启 3081（前台阻塞，Ctrl+C 停止）
powershell -ExecutionPolicy Bypass -File .\scripts\e2e-restart.ps1

# 或手动两步：
# 1) robocopy F:\dsh-cosplay "$env:USERPROFILE\.dsh\profiles\web-e2e\node_modules\dsh-cosplay" /E /XD .git node_modules
# 2) 杀掉 3081 旧进程后：dsh --profile web-e2e --port 3081
```

> 客户端 bundle 在启动时构建，改 client.js 也必须重启（不要只刷新页面）。
> 若 e2e 实例由 agent 会话托管，脚本会把它停掉——重启后告知 agent 即可。

## 发布（后续轮次）

- [ ] `npm.cmd pack` 生成 tarball（已可离线执行）
- [ ] 推送到 GitHub（MIT）后视需要发布 npm：`npm publish`（`prepublishOnly` 会先跑检查）
