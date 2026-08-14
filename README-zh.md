# dsh-go-usage

一个 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 动态 Cordis 插件：在 Web 界面中实时显示你的 **OpenCode Go 订阅额度**——输入框上方居中显示一个胶囊条，展示 5 小时 / 周 / 月三个额度窗口的已用百分比，每 60 秒自动刷新。

> 说明：这是一个动态插件（运行时通过 `cordis_define` 定义）。本仓库**不包含任何密钥、令牌或个人数据**。

## 功能

- 显示 [OpenCode Go](https://opencode.ai/docs/go/) 订阅的三个额度窗口：
  - `Go 5h` — 5 小时滚动窗口（$12 用量）
  - `周` — 每周（$30 用量）
  - `月` — 每月（$60 用量）
- **实时颜色提示**：绿色 `< 70%`、橙色 `70–90%`、红色 `≥ 90%` 或 `rate-limited`（已达上限）
- **悬停提示**：每个窗口显示重置时间
- **自动刷新**：每 60 秒一次，另有手动刷新按钮（↻）
- **主题自适应**：使用 DSH 主题 CSS 变量，自动适配深色/浅色模式
- 密钥通过 DSH `credentials` 服务解析，**不会出现在界面、日志或本仓库中**

## 环境要求

- 正在运行的 DSH（DeepSeek Harness）实例及 Web 界面
- 已订阅 OpenCode Go，并持有其 API Key
- 系统 `PATH` 中有 Node.js（Host 端用它发起带认证的请求；任意支持全局 `fetch` 的现代 Node 均可）

## 配置密钥

插件按以下顺序解析 API Key（由 DSH `credentials` 服务处理）：

1. 进程环境变量 `OPENCODE_GO_API_KEY`
2. `~/.dsh/.credentials.yaml`（推荐）
3. `.env` 文件

示例凭据文件：

```yaml
OPENCODE_GO_API_KEY: <your-opencode-go-api-key>
```

或在启动 DSH 前设置环境变量：

```bash
export OPENCODE_GO_API_KEY=<your-opencode-go-api-key>
```

## 安装

这是一个**动态 Cordis 插件**——通过 DSH 的 `cordis_define` / `cordis_run` 工具在运行时创建并激活，无需构建步骤或安装到仓库。

1. 打开 DSH Web 界面中的任意会话。
2. 让 agent 创建插件，并给它本仓库的两份源码：
   - Host 端：[`plugin/host.js`](plugin/host.js)
   - Client 端：[`plugin/client.js`](plugin/client.js)
3. agent 会执行 `cordis_define`（新建插件，`idPrefix` 如 `gous`），然后执行 `cordis_run` 激活。
4. 按提示在界面中批准 Client 端激活。

激活后，额度胶囊条会出现在每个会话输入框上方的行中。

> 小技巧：也可以让 agent 直接读取本仓库的 raw 文件：
> `https://raw.githubusercontent.com/<owner>/dsh-go-usage/main/plugin/host.js` 与 `.../plugin/client.js`

## 工作原理

```
┌────────────────────────────────────────────────────────────┐
│  Client（浏览器）          conversation.input.dock 插槽     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Go 5h 0% · 周 20% · 月 11%   ↻                     │  │
│  └──────────────────────────────────────────────────────┘  │
│     │ host.call('go-usage')  （每 60 秒）                   │
└─────┼──────────────────────────────────────────────────────┘
      ▼
┌────────────────────────────────────────────────────────────┐
│  Host（DSH 进程）                                            │
│  credentials.resolve('OPENCODE_GO_API_KEY')                  │
│      → subprocess: node -e "fetch('https://opencode.ai/      │
│        zen/go/v1/usage', { headers: { authorization:         │
│        'Bearer …' } })"                                      │
│      → 解析 { usage: { rolling, weekly, monthly } }          │
└────────────────────────────────────────────────────────────┘
```

- **Client 端**：注册到 `conversation.input.dock` 插槽，每 60 秒轮询一次 Host RPC。
- **Host 端**：通过 `credentials` 服务解析密钥，再用 `subprocess` 服务启动系统 `node` 调用官方接口 `https://opencode.ai/zen/go/v1/usage`（沙箱内没有 `fetch`/`process`；密钥通过显式子进程环境传入，绕开 DSH 的凭据环境变量脱敏）。

### API

插件使用的是 OpenCode 官方额度接口（与 OpenCode 控制台相同）：

```
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <OPENCODE_GO_API_KEY>
```

```json
{
  "usage": {
    "rolling":  { "status": "ok", "percent": 0,  "resetsAt": "2026-08-14T12:25:11.803Z" },
    "weekly":   { "status": "ok", "percent": 20, "resetsAt": "2026-08-17T00:00:00.803Z" },
    "monthly":  { "status": "ok", "percent": 11, "resetsAt": "2026-09-09T10:22:03.803Z" }
  }
}
```

`status` 为 `"ok"` 或 `"rate-limited"`；`percent` 为该窗口美元限额中已使用的比例。

## 隐私与安全

- **本仓库无任何机密**：不含 API Key、令牌、用户名、机器路径或任何个人数据。
- 密钥只存在于你的机器上（`~/.dsh/.credentials.yaml` 或环境变量），并通过 DSH `credentials` 服务读取。
- 密钥仅发送至 `https://opencode.ai`（Bearer 头），不会发给插件作者或任何第三方。
- 界面只显示百分比，密钥永远不会传到浏览器。

## 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| 胶囊一直显示 `Go 加载中…` | Client 无法访问 Host RPC；检查插件 Run 卡片状态 |
| 提示 `OPENCODE_GO_API_KEY 未配置` | 把密钥写入 `~/.dsh/.credentials.yaml` 或环境变量，然后点 ↻ |
| 提示 `spawn 失败` | `PATH` 中没有 Node.js；安装 Node 或调整 Host 端的可执行文件解析 |
| 类似 `HTTP 401` 的错误 | 密钥无效或订阅未生效 |

## 许可证

MIT — 见 [LICENSE](LICENSE)。
