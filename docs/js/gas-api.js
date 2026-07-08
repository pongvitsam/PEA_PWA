(function () {
  function getStoredSessionToken() {
    try {
      const raw = localStorage.getItem('pwa_token');
      if (!raw) return null;
      const t = JSON.parse(raw);
      return t.sessionToken || null;
    } catch (e) { return null; }
  }

  async function gasCall(action, args) {
    const res = await fetch(window.GAS_API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, args: args || [], sessionToken: getStoredSessionToken() })
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('API response ไม่ถูกต้อง'); }
    if (!data.ok) throw new Error(data.error || 'API error');
    return data.result;
  }

  function createGasRunner() {
    let onSuccess = null;
    let onFailure = null;
    const runner = {
      withSuccessHandler(cb) { onSuccess = cb; return runner; },
      withFailureHandler(cb) { onFailure = cb; return runner; }
    };
    return new Proxy(runner, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return function (...args) {
          gasCall(String(prop), args)
            .then(r => { if (onSuccess) onSuccess(r); })
            .catch(e => { if (onFailure) onFailure(e); });
        };
      }
    });
  }

  window.google = window.google || {};
  Object.defineProperty(window.google, 'script', {
    get() { return { get run() { return createGasRunner(); } }; },
    configurable: true
  });
})();
