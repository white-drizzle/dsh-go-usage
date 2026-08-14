// dsh-go-usage — Client half (persistent plugin bundle)
// Bundle format: window.__ModuleLoader__.load({ id, factory }). The factory
// receives a synchronous require that resolves platform modules (react, …).
// The <style> tag is injected at factory level (materialization time) so the
// module loader's style bookkeeping can claim and later remove it.
//
// The apply(ctx) below registers a centered pill in conversation.input.dock
// and polls the host route /go-usage every 60 seconds (browser fetch).
window.__ModuleLoader__.load({
	id: "dsh-go-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");

		// Inject styles at materialization so the module loader claims them.
		var style = document.createElement("style");
		style.setAttribute("data-plugin", "dsh-go-usage");
		style.textContent = [
			".dsh-tku-wrap { display:flex; justify-content:center; padding:3px 8px; }",
			".dsh-tku-row { display:flex; align-items:center; gap:16px; padding:4px 16px; font-size:12px; flex-wrap:wrap; width:fit-content; background: var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:999px; }",
			".dsh-tku-seg { display:inline-flex; align-items:center; gap:5px; }",
			".dsh-tku-label { color: var(--dsw-alias-label-secondary); }",
			".dsh-tku-num { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }",
			".dsh-tku-green { color: var(--dsw-alias-state-success-primary); }",
			".dsh-tku-amber { color: var(--dsw-alias-state-warn-primary); }",
			".dsh-tku-red { color: var(--dsw-alias-state-error-primary); }",
			".dsh-tku-dim { opacity: .55; }",
			".dsh-tku-btn { background:none; border:none; cursor:pointer; color: var(--dsw-alias-label-secondary); font-size:12px; padding:0 2px; }",
			".dsh-tku-btn:hover { color: var(--dsw-alias-label-primary); }",
		].join("\n");
		document.head.appendChild(style);

		exports.inject = ["slots", "timer"];

		exports.apply = function apply(ctx) {
			var slots = ctx.get("slots");
			if (slots === undefined) return;

			function levelOf(percent) {
				if (percent === null || percent === undefined) return "dim";
				if (percent >= 90) return "red";
				if (percent >= 70) return "amber";
				return "green";
			}

			function GoSegment(props) {
				var label = props.label;
				var item = props.item;
				if (item === null || item === undefined) {
					return React.createElement("span", { className: "dsh-tku-seg" },
						React.createElement("span", { className: "dsh-tku-label" }, label + " "),
						React.createElement("span", { className: "dsh-tku-dim" }, "—"));
				}
				var cls = item.status === "rate-limited" ? "red" : levelOf(item.percent);
				var title = label + " resets: " + new Date(item.resetsAt).toLocaleString()
					+ (item.status === "rate-limited" ? " · rate limited" : "");
				return React.createElement("span", { className: "dsh-tku-seg", title: title },
					React.createElement("span", { className: "dsh-tku-label" }, label + " "),
					React.createElement("span", { className: "dsh-tku-num dsh-tku-" + cls }, String(Math.round(item.percent)) + "%"));
			}

			function GoDock() {
				var state = React.useState(null);
				var go = state[0];
				var setGo = state[1];
				var errState = React.useState(null);
				var err = errState[0];
				var setErr = errState[1];
				var spinState = React.useState(false);
				var spin = spinState[0];
				var setSpin = spinState[1];

				var refresh = React.useCallback(function () {
					setSpin(true);
					fetch("/go-usage", { method: "GET", headers: { "Accept": "application/json" } })
						.then(function (r) { return r.json(); })
						.then(function (result) {
							setGo(result);
							setErr(null);
						})
						.catch(function (e) {
							setGo(null);
							setErr(String(e && e.message || e));
						})
						.finally(function () { setSpin(false); });
				}, []);

				React.useEffect(function () {
					refresh();
					return ctx.interval(refresh, 60000);
				}, [refresh]);

				var segs = [];
				if (go !== null && go.ok) {
					segs.push(React.createElement(GoSegment, { key: "r", label: "Go 5h", item: go.usage.rolling }));
					segs.push(React.createElement(GoSegment, { key: "w", label: "Weekly", item: go.usage.weekly }));
					segs.push(React.createElement(GoSegment, { key: "m", label: "Monthly", item: go.usage.monthly }));
				} else if (err !== null) {
					segs.push(React.createElement("span", { key: "e", className: "dsh-tku-red" }, "Go fetch failed: " + err));
				} else if (go !== null && !go.ok) {
					segs.push(React.createElement("span", { key: "e", className: "dsh-tku-dim" }, "Go " + go.reason));
				} else {
					segs.push(React.createElement("span", { key: "l", className: "dsh-tku-dim" }, "Go loading…"));
				}
				segs.push(React.createElement("button", { key: "btn", className: "dsh-tku-btn", onClick: refresh, title: "Refresh" }, spin ? "⟳" : "↻"));

				return React.createElement("div", { className: "dsh-tku-wrap" },
					React.createElement("div", { className: "dsh-tku-row" }, segs));
			}

			slots.inject("conversation.input.dock", function () {
				return slots.register(
					{ name: "conversation.input.dock", id: "go-usage", order: 15, label: "Go Usage" },
					function () { return React.createElement(GoDock); },
				);
			});
		};

		return module.exports;
	}
});
