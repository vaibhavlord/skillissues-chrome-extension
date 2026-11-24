(() => {
  const origin = "https://skillissuescompiler.vercel.app";
  const params = new URLSearchParams(location.search);
  if (location.origin !== origin || location.pathname !== "/" || params.get("cp") !== "1") return;

  const allowed = new Set(["compiler-state", "stage-submission", "open-bundled-compiler"]);
  function notify(channel, detail = {}) {
    document.dispatchEvent(new CustomEvent(channel, { detail: JSON.stringify(detail) }));
  }

  document.addEventListener("skillissues-cp:extension-request", (event) => {
    if (typeof event.detail !== "string") return;
    let data;
    try { data = JSON.parse(event.detail); } catch { return; }
    if (typeof data?.id !== "string" || !allowed.has(data.message?.type)) return;

    const respond = (result) => notify("skillissues-cp:extension-response", { id: data.id, result });
    try {
      chrome.runtime.sendMessage(data.message).then(respond, (error) => {
        respond({ ok: false, error: error.message });
      });
    } catch {
      respond({ ok: false, error: "Refresh the compiler after reloading the Skill Issues CP extension." });
    }
  });

  const path = params.get("problem");
  chrome.storage.onChanged.addListener((changes, area) => {
    if (path && area === "local" && changes["problem:" + path]) {
      notify("skillissues-cp:extension-changed");
    }
  });
})();
