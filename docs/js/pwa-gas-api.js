(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  /** GET ยาวเกินนี้มักได้ 403 จาก script.google.com / macros/echo */
  var JSONP_URL_SOFT_LIMIT = 1600;

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

  /** ไม่ส่ง sessionToken ซ้ำใน args — มีใน query/body แล้ว */
  function compactArgs_(args) {
    const a = Array.isArray(args) ? args.slice() : [];
    const tok = getStoredSessionToken();
    if (tok && a.length && a[a.length - 1] === tok) a.pop();
    return a;
  }

  function buildJsonpUrl_(action, argsJson, requestId, cbName) {
    const params = new URLSearchParams();
    params.set('api', '1');
    params.set('action', action);
    params.set('args', argsJson);
    params.set('callback', cbName);
    params.set('requestId', requestId);
    params.set('_', String(Date.now()));
    const tok = getStoredSessionToken();
    if (tok) params.set('sessionToken', tok);
    return window.GAS_API_URL + '?' + params.toString();
  }

  function gasCallJsonp_(action, argsJson, requestId) {
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

      script = document.createElement('script');
      script.src = buildJsonpUrl_(action, argsJson, requestId, cbName);
      script.onerror = function () {
        cleanup();
        reject(new Error('API script load failed (403?) — ลองรีเฟรชหน้า'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * POST ผ่านป๊อปอัป — ใช้เมื่อ JSONP URL ยาวหรือโหลดสคริปต์ 403
   * doPost(client:'pages') ตอบกลับด้วย postMessage (รวม opener)
   */
  function gasCallPopupPost_(action, args, requestId) {
    return new Promise(function (resolve, reject) {
      if (!window.GAS_API_URL) {
        reject(new Error('ไม่พบ GAS_API_URL'));
        return;
      }

      let settled = false;
      const popupName = 'gas_api_' + requestId.replace(/[^\w]/g, '');
      let popup = null;

      const timeout = setTimeout(function () {
        finishErr(new Error('API timeout'));
      }, 90000);

      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        try {
          if (popup && !popup.closed) popup.close();
        } catch (e) {}
      }

      function finishOk(result) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      }

      function finishErr(err) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err || 'API error')));
      }

      function onMessage(ev) {
        const d = ev && ev.data;
        if (!d || d.type !== 'GAS_API_DONE') return;
        if (d.requestId && d.requestId !== requestId) return;
        if (d.ok) finishOk(d.result);
        else finishErr(new Error(d.error || 'API error'));
      }

      window.addEventListener('message', onMessage);

      popup = window.open('', popupName, 'width=360,height=220,menubar=no,toolbar=no,location=yes,status=no');
      if (!popup) {
        finishErr(new Error('เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองใหม่'));
        return;
      }

      const payload = {
        action: action,
        args: args || [],
        sessionToken: getStoredSessionToken(),
        requestId: requestId,
        client: 'pages'
      };
      const payloadStr = JSON.stringify(payload);
      const actionUrl = String(window.GAS_API_URL).replace(/"/g, '');

      try {
        const doc = popup.document;
        doc.open();
        doc.write(
          '<!doctype html><html><head><meta charset="utf-8"><title>PEA API</title></head><body>' +
          '<p style="font-family:sans-serif;padding:12px">กำลังดำเนินการ...</p>' +
          '<form id="gasPostForm" method="POST" accept-charset="UTF-8"></form>' +
          '<script>(function(){' +
          'var f=document.getElementById("gasPostForm");' +
          'f.action=' + JSON.stringify(actionUrl) + ';' +
          'var i=document.createElement("input");i.type="hidden";i.name="payload";' +
          'i.value=' + JSON.stringify(payloadStr) + ';' +
          'f.appendChild(i);f.submit();' +
          '})();<\/script></body></html>'
        );
        doc.close();
      } catch (e) {
        finishErr(new Error('เปิดช่องทาง API ไม่สำเร็จ — อนุญาตป๊อปอัปแล้วลองใหม่'));
      }
    });
  }

  /**
   * JSONP เป็นหลัก — หลีกเลี่ยง iframe→macros/echo
   * ถ้า URL ยาวหรือ JSONP 403 จะใช้ POST ผ่านป๊อปอัปแทน
   */
  function gasCall(action, args) {
    const requestId = newRequestId();
    const compact = compactArgs_(args);
    const argsJson = JSON.stringify(compact || []);

    if (argsJson.length > 50000) {
      return Promise.reject(new Error('คำขอนี้ใหญ่เกินไป'));
    }

    const probeCb = '_gasJsonp_' + requestId.replace(/[^\w]/g, '');
    const urlLen = buildJsonpUrl_(action, argsJson, requestId, probeCb).length;
    if (urlLen > JSONP_URL_SOFT_LIMIT || argsJson.length > 2500) {
      return gasCallPopupPost_(action, compact, requestId);
    }

    return gasCallJsonp_(action, argsJson, requestId).catch(function (err) {
      const msg = (err && err.message) ? err.message : String(err || '');
      if (/script load failed|403/i.test(msg)) {
        return gasCallPopupPost_(action, compact, requestId);
      }
      throw err;
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
