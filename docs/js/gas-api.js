(function () {
  'use strict';

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

  /** iframe + form POST — หลีกเลี่ยง CORS ของ Google Apps Script */
  function gasCall(action, args) {
    return new Promise(function (resolve, reject) {
      const requestId = newRequestId();
      const iframeName = 'gasfrm_' + requestId;
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.title = 'gas-api';
      iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(iframe);

      const timeout = setTimeout(function () {
        cleanup();
        reject(new Error('API timeout'));
      }, 90000);

      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        if (form.parentNode) form.parentNode.removeChild(form);
      }

      function onMessage(ev) {
        const data = ev.data;
        if (!data || data.requestId !== requestId) return;
        cleanup();
        if (data.ok) resolve(data.result);
        else reject(new Error(data.error || 'API error'));
      }
      window.addEventListener('message', onMessage);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = window.GAS_API_URL;
      form.target = iframeName;
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify({
        action: action,
        args: args || [],
        sessionToken: getStoredSessionToken(),
        client: 'pages',
        requestId: requestId
      });
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
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
