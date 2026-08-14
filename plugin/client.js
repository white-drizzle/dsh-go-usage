// dsh-go-usage — Client half
// This file is the body of the function passed to `cordis_define` as `code.client`.
// It registers a centered pill in the `conversation.input.dock` slot (the row
// above the composer) showing the OpenCode Go quota: 5-hour / weekly / monthly
// usage percentages, auto-refreshed every 60 seconds with a manual refresh button.
//
// Sandbox note: dynamic Client plugins run in the browser without JSX; all UI
// must use React.createElement. Theme colors come from DSH CSS variables.

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(`
      .dsh-tku-wrap { display:flex; justify-content:center; padding:3px 8px; }
      .dsh-tku-row { display:flex; align-items:center; gap:16px; padding:4px 16px; font-size:12px; flex-wrap:wrap; width:fit-content; background: var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:999px; }
      .dsh-tku-seg { display:inline-flex; align-items:center; gap:5px; }
      .dsh-tku-label { color: var(--dsw-alias-label-secondary); }
      .dsh-tku-num { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
      .dsh-tku-green { color: var(--dsw-alias-state-success-primary); }
      .dsh-tku-amber { color: var(--dsw-alias-state-warn-primary); }
      .dsh-tku-red { color: var(--dsw-alias-state-error-primary); }
      .dsh-tku-dim { opacity: .55; }
      .dsh-tku-btn { background:none; border:none; cursor:pointer; color: var(--dsw-alias-label-secondary); font-size:12px; padding:0 2px; }
      .dsh-tku-btn:hover { color: var(--dsw-alias-label-primary); }
    `)

    function levelOf(percent) {
      if (percent === null || percent === undefined) return 'dim'
      if (percent >= 90) return 'red'
      if (percent >= 70) return 'amber'
      return 'green'
    }

    function GoSegment(props) {
      const label = props.label
      const item = props.item
      if (item === null || item === undefined) {
        return React.createElement('span', { className: 'dsh-tku-seg' },
          React.createElement('span', { className: 'dsh-tku-label' }, label + ' '),
          React.createElement('span', { className: 'dsh-tku-dim' }, '—'))
      }
      const cls = item.status === 'rate-limited' ? 'red' : levelOf(item.percent)
      const title = label + ' resets: ' + new Date(item.resetsAt).toLocaleString()
        + (item.status === 'rate-limited' ? ' · rate limited' : '')
      return React.createElement('span', { className: 'dsh-tku-seg', title },
        React.createElement('span', { className: 'dsh-tku-label' }, label + ' '),
        React.createElement('span', { className: 'dsh-tku-num dsh-tku-' + cls }, String(Math.round(item.percent)) + '%'))
    }

    function GoDock(props) {
      const [go, setGo] = React.useState(null)
      const [err, setErr] = React.useState(null)
      const [spin, setSpin] = React.useState(false)
      const refresh = React.useCallback(() => {
        setSpin(true)
        host.call('go-usage', {}).then((result) => {
          setGo(result)
          setErr(null)
        }).catch((e) => {
          setGo(null)
          setErr(String(e && e.message || e))
        }).finally(() => setSpin(false))
      }, [])
      React.useEffect(() => {
        refresh()
        return ctx.interval(refresh, 60000)
      }, [refresh])

      const segs = []
      if (go !== null && go.ok) {
        segs.push(React.createElement(GoSegment, { key: 'r', label: 'Go 5h', item: go.usage.rolling }))
        segs.push(React.createElement(GoSegment, { key: 'w', label: 'Weekly', item: go.usage.weekly }))
        segs.push(React.createElement(GoSegment, { key: 'm', label: 'Monthly', item: go.usage.monthly }))
      } else if (err !== null) {
        segs.push(React.createElement('span', { key: 'e', className: 'dsh-tku-red' }, 'Go fetch failed: ' + err))
      } else if (go !== null && !go.ok) {
        segs.push(React.createElement('span', { key: 'e', className: 'dsh-tku-dim' }, 'Go ' + go.reason))
      } else {
        segs.push(React.createElement('span', { key: 'l', className: 'dsh-tku-dim' }, 'Go loading…'))
      }
      segs.push(React.createElement('button', { key: 'btn', className: 'dsh-tku-btn', onClick: refresh, title: 'Refresh' }, spin ? '⟳' : '↻'))
      return React.createElement('div', { className: 'dsh-tku-wrap' },
        React.createElement('div', { className: 'dsh-tku-row' }, segs))
    }

    slots.inject('conversation.input.dock', () => slots.register(
      { name: 'conversation.input.dock', id: 'go-usage', order: 15, label: 'Go Usage' },
      (props) => React.createElement(GoDock, props),
    ))
  },
}
