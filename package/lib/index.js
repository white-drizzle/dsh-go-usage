// dsh-go-usage — Host half (persistent plugin form)
// A standard Cordis plugin package entry (exports.inject + exports.apply).
// Registers a JSON endpoint /go-usage on the DSH web server; the browser
// client polls it to render the OpenCode Go subscription quota pill.
//
// The API key is resolved through the DSH `credentials` service (env var →
// ~/.dsh/.credentials.yaml → .env). The outbound HTTPS call runs in a child
// `node` process with the key passed explicitly in its environment, because
// the host plugin sandbox has no fetch/process and child env scrubbing would
// strip `*KEY*` variables.

export const name = 'dsh-go-usage'

export const inject = ['webServer', 'timer']

export function apply(ctx) {
  const credentials = ctx.get('credentials')
  const subprocess = ctx.get('subprocess')
  const sandboxPolicy = ctx.get('sandboxPolicy')
  const cwd = sandboxPolicy !== undefined ? sandboxPolicy.workspaceRoot : undefined

  const handler = async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')

    const respond = (payload) => {
      res.writeHead(200)
      res.end(JSON.stringify(payload))
    }

    try {
      if (credentials === undefined || subprocess === undefined || cwd === undefined || cwd.length === 0) {
        respond({ ok: false, reason: 'service unavailable (credentials/subprocess/workspace)' })
        return
      }
      let resolved
      try {
        resolved = await credentials.resolve('OPENCODE_GO_API_KEY')
      } catch {
        resolved = undefined
      }
      if (resolved === undefined || resolved.value.length === 0) {
        respond({ ok: false, reason: 'OPENCODE_GO_API_KEY is not configured (env var or ~/.dsh/.credentials.yaml)' })
        return
      }
      let nodePath
      try {
        nodePath = await subprocess.resolveExecutable('node')
      } catch {
        nodePath = undefined
      }
      if (nodePath === undefined) nodePath = 'node'
      const script = [
        "const k = process.env.OPENCODE_GO_API_KEY;",
        "fetch('https://opencode.ai/zen/go/v1/usage', { headers: { authorization: 'Bearer ' + k } })",
        ".then(r => r.text())",
        ".then(t => console.log(t))",
        ".catch(e => console.log('__ERR__' + String(e && e.message || e)))",
      ].join('')
      const handle = subprocess.spawn({
        argv: [nodePath, '-e', script],
        cwd,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 16384 },
          stderr: { maxBytes: 16384 },
        },
        graceMs: 1000,
        env: { OPENCODE_GO_API_KEY: resolved.value },
      })
      const watchdog = ctx.timeout(() => handle.terminate(), 20000)
      let outcome
      try {
        outcome = await handle.done
      } catch (error) {
        watchdog()
        respond({ ok: false, reason: 'spawn failed: ' + String(error && error.message || error) })
        return
      }
      watchdog()
      let text = ''
      const reader = handle.collected.stdout
      if (reader !== undefined) text = reader.readFrom(0).text
      if (text.startsWith('__ERR__')) {
        respond({ ok: false, reason: text.slice(7) })
        return
      }
      let data
      try {
        data = JSON.parse(text)
      } catch (error) {
        respond({ ok: false, reason: 'parse failed: ' + String(error && error.message || error) })
        return
      }
      const usage = data && data.usage
      if (usage === undefined) {
        respond({ ok: false, reason: 'response missing usage field' })
        return
      }
      respond({
        ok: true,
        usage: {
          rolling: usage.rolling || null,
          weekly: usage.weekly || null,
          monthly: usage.monthly || null,
        },
        at: Date.now(),
      })
    } catch (error) {
      respond({ ok: false, reason: String(error && error.message || error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/go-usage', handler }))
}
