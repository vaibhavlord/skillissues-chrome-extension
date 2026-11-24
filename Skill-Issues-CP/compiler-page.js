(() => {
  const origin = "https://skillissuescompiler.vercel.app";
  if (location.origin !== origin || location.pathname !== "/"
    || new URLSearchParams(location.search).get("cp") !== "1") return;

  window.addEventListener("message", ({ source, origin: senderOrigin, data }) => {
    if (source !== window || senderOrigin !== origin || data?.channel !== "skillissues-cp:request"
      || typeof data.id !== "string") return;
    document.dispatchEvent(new CustomEvent("skillissues-cp:extension-request", {
      detail: JSON.stringify({ id: data.id, message: data.message }),
    }));
  });

  document.addEventListener("skillissues-cp:extension-response", (event) => {
    if (typeof event.detail !== "string") return;
    let data;
    try { data = JSON.parse(event.detail); } catch { return; }
    window.postMessage({ channel: "skillissues-cp:response", id: data.id, result: data.result }, origin);
  });
  document.addEventListener("skillissues-cp:extension-changed", () => {
    window.postMessage({ channel: "skillissues-cp:changed" }, origin);
  });
})();
