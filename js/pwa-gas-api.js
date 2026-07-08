(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  function getStoredSessionToken() {
    try {
      const raw = localStorage.getItem('pwa_token');
      if (!raw) return null;
      const t = JSON.parse(raw);
      return t.sessionToken || null;
    } catch (e) { return null; }
  }

  function newRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  /** JSONP — หลีกเลี่ยง CORS และ 403 จาก iframe บน googleusercontent echo */
  function gasCall(action, args) {
    const requestId = newRequestId();
    const argsJson = JSON.stringify(args || []);
    if (argsJson.length > 6000) {
      return Promise.reject(new Error('ข้อมูลใหญ่เกินไป — ใช้ลิงก์ Apps Script เดิม'));
    }

    return new Promise(function (resolve, reject) {
      const cbName = '_gasJsonp_' + requestId.replace(/[^\w]/g, '');
      let script = null;

      const timeout = setTimeout(function () {
        cleanup();
        reject(new Error('API timeout'));
      }, 90000);

      function cleanup() {
        clearTimeout(timeout);
        delete window[cbName];
        if (script && script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = function (data) {
        if (!data || (data.requestId && data.requestId !== requestId)) return;
        cleanup();
        if (data.ok) resolve(data.result);
        else reject(new Error(data.error || 'API error'));
      };

      const params = new URLSearchParams();
      params.set('api', '1');
      params.set('action', action);
      params.set('args', argsJson);
      params.set('callback', cbName);
      params.set('requestId', requestId);
      params.set('_', String(Date.now()));
      const tok = getStoredSessionToken();
      if (tok) params.set('sessionToken', tok);

      script = document.createElement('script');
      script.src = window.GAS_API_URL + '?' + params.toString();
      script.onerror = function () {
        cleanup();
        reject(new Error('API script load failed (403?)'));
      };
      document.head.appendChild(script);
    });
  }

  function createGasRunner() {
    let onSuccess = null;
    let onFailure = null;
    const chain = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (cb) { onSuccess = cb; return chain; };
        }
        if (prop === 'withFailureHandler') {
          return function (cb) { onFailure = cb; return chain; };
        }
        return function (...callArgs) {
          gasCall(String(prop), callArgs)
            .then(function (r) { if (onSuccess) onSuccess(r); })
            .catch(function (e) { if (onFailure) onFailure(e); });
        };
      }
    });
    return chain;
  }

  window.pwaGasCall = gasCall;
  window.google = {
    script: {
      get run() { return createGasRunner(); }
    }
  };
})();
