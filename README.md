# dsh-go-usage

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) dynamic Cordis plugin that shows your **OpenCode Go subscription quota** in the web GUI — a centered pill above the composer showing the 5-hour / weekly / monthly usage percentages, auto-refreshed every 60 seconds.

> Status: dynamic plugin (defined at runtime via `cordis_define`). No keys, tokens, or personal data are included in this repository.

## Features

- **Three quota windows** of the [OpenCode Go](https://opencode.ai/docs/go/) subscription:
  - `Go 5h` — rolling 5-hour window ($12 of usage)
  - `Weekly` — $30 of usage
  - `Monthly` — $60 of usage
- **Live color coding**: green `< 70%`, amber `70–90%`, red `≥ 90%` or `rate-limited`
- **Hover tooltip** on each window shows its reset time
- **Auto-refresh** every 60 seconds, plus a manual refresh button (↻)
- **Theme-aware** styling using DSH CSS variables (light/dark mode)
- API key is resolved through the DSH `credentials` service — it never appears in the UI, logs, or this repository

## Requirements

- A running DSH (DeepSeek Harness) instance with the web GUI
- An OpenCode Go subscription and its API key
- Node.js available on `PATH` (used by the Host half to make the authenticated request; any modern Node with global `fetch` works)

## Configuration

The plugin resolves the API key in this order (handled by the DSH `credentials` service):

1. Process environment variable `OPENCODE_GO_API_KEY`
2. `~/.dsh/.credentials.yaml` (recommended)
3. `.env` files

Example credentials file:

```yaml
OPENCODE_GO_API_KEY: <your-opencode-go-api-key>
```

Or set the environment variable before starting DSH:

```bash
export OPENCODE_GO_API_KEY=<your-opencode-go-api-key>
```

## Installation

There are two ways to run this plugin.

### A. Persistent install (auto-loads on every DSH start, recommended)

1. Copy the `package/` directory of this repository into your DSH profile's
   `node_modules` as `dsh-go-usage`:
   ```bash
   # example for the default web profile
   cp -r package ~/.dsh/profiles/web/node_modules/dsh-go-usage
   ```
2. Append one row to the user patch file `~/.dsh/cordis.patch.yml`:
   ```yaml
   - insert:
       - id: go-usage
         name: 'dsh-go-usage'
   ```
3. Restart DSH. The pill appears in the composer dock of every session and
   survives restarts. (For a non-default profile, adjust the path in step 1
   accordingly.)

### B. Dynamic plugin (runtime-defined via the agent)

1. Open a session in the DSH web GUI.
2. Tell the agent to create the plugin and provide the code from this repository:
   - Host half: [`plugin/host.js`](plugin/host.js)
   - Client half: [`plugin/client.js`](plugin/client.js)
3. The agent will run `cordis_define` (a new plugin with an `idPrefix` like `gous`), then `cordis_run` to activate it.
4. Approve the client activation in the GUI when prompted.

> Tip: the agent can also read the two files directly from this repository's raw URLs:
> `https://raw.githubusercontent.com/<owner>/dsh-go-usage/main/plugin/host.js` and `.../plugin/client.js`

Note: dynamic plugins live in process memory only and disappear when DSH restarts.

## How it works

```
┌────────────────────────────────────────────────────────────┐
│  Client (browser)         conversation.input.dock slot      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Go 5h 0% · Weekly 20% · Monthly 11%   ↻            │  │
│  └──────────────────────────────────────────────────────┘  │
│     │ host.call('go-usage')  (every 60s)                   │
└─────┼──────────────────────────────────────────────────────┘
      ▼
┌────────────────────────────────────────────────────────────┐
│  Host (DSH process)                                          │
│  credentials.resolve('OPENCODE_GO_API_KEY')                  │
│      → subprocess: node -e "fetch('https://opencode.ai/      │
│        zen/go/v1/usage', { headers: { authorization:         │
│        'Bearer …' } })"                                      │
│      → parse { usage: { rolling, weekly, monthly } }         │
└────────────────────────────────────────────────────────────┘
```

- **Client**: registers in the `conversation.input.dock` slot, polls the Host RPC every 60 s.
- **Host**: resolves the key via the `credentials` service, then spawns the system `node` through the `subprocess` service to call the official endpoint `https://opencode.ai/zen/go/v1/usage` (the sandbox has no `fetch`/`process`, and the key is passed explicitly in the child environment so it survives DSH's credential-scrubbing).

### API

The plugin consumes the official OpenCode Go usage endpoint (same one the OpenCode console uses):

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

`status` is `"ok"` or `"rate-limited"`; `percent` is the share of the window's dollar limit already used.

## Privacy & security

- **No secrets in this repository**: no API keys, tokens, usernames, machine paths, or personal data are committed.
- The key lives only on your machine (`~/.dsh/.credentials.yaml` or your environment) and is read through the DSH `credentials` service.
- The key is only transmitted to `https://opencode.ai` (Bearer header), never to the plugin author or any third party.
- The UI renders percentages only; the key never crosses to the browser.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Pill shows `Go loading…` forever | The client can't reach the Host RPC; check the Run card state of the plugin |
| `OPENCODE_GO_API_KEY is not configured` | Add the key to `~/.dsh/.credentials.yaml` or the environment, then click ↻ |
| `spawn failed` | Node.js is not on `PATH`; install Node or adjust the Host half's executable resolution |
| `HTTP 401` style errors | The key is invalid or the subscription is not active |

## License

MIT — see [LICENSE](LICENSE).
