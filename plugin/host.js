// dsh-go-usage — Host half
// This file is the body of the function passed to `cordis_define` as `code.host`.
// It registers a package-private RPC handler `go-usage` that resolves the
// OpenCode Go API key through the DSH credentials service and fetches the
// subscription quota from the official OpenCode Go usage endpoint.
//
// Sandbox note: dynamic Host plugins run in a restricted VM. There is no
// `process` global and no `fetch`; network work goes through `ctx` services.
// We spawn the system `node` (which has global fetch) via the `subprocess`
// service, passing the key explicitly in the child environment.

return {
  inject: ['timer'],
  apply(ctx) {
    const credentials = ctx.get('credentials')
    const subprocess = ctx.get('subprocess')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    const cwd = sandboxPolicy !== undefined ? sandboxPolicy.workspaceRoot : undefined

    const handler = async () => {
      if (credentials === undefined || subprocess === undefined || cwd === undefined || cwd.length === 0) {
        return { ok: false, reason: 'service unavailable (credentials/subprocess/workspace)' }
      }
      let resolved
      try {
        resolved = await credentials.resolve('OPENCODE_GO_API_KEY')
      } catch {
        resolved = undefined
      }
      if (resolved === undefined || resolved.value.length === 0) {
        return { ok: false, reason: 'OPENCODE_GO_API_KEY is not configured (env var or ~/.dsh/.credentials.yaml)' }
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
        return { ok: false, reason: 'spawn failed: ' + String(error && error.message || error) }
      }
      watchdog()
      let text = ''
      const reader = handle.collected.stdout
      if (reader !== undefined) text = reader.readFrom(0).text
      if (text.startsWith('__ERR__')) return { ok: false, reason: text.slice(7) }
      try {
        const data = JSON.parse(text)
        const usage = data && data.usage
        if (usage === undefined) return { ok: false, reason: 'response missing usage field' }
        return {
          ok: true,
          usage: {
            rolling: usage.rolling || null,
            weekly: usage.weekly || null,
            monthly: usage.monthly || null,
          },
          at: Date.now(),
        }
      } catch (error) {
        return { ok: false, reason: 'parse failed: ' + String(error && error.message || error) }
      }
    }

    ctx.effect(() => harness.handle('go-usage', handler))
  },
}
