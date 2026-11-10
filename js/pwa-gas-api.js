(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  /** GET ยาวเกินนี้มักได้ 403 จาก script.google.com / macros/echo */
  var JSONP_URL_SOFT_LIMIT = 1600;
  var DEFAULT_TIMEOUT_MS = 120000;
  var MOBILE_TIMEOUT_MS = 45000;
  var IOS_TIMEOUT_MS = 35000;
  var IOS_JSONP_FIRST_MS = 10000;
  var UPLOAD_TIMEOUT_MS = 600000;
  var UPLOAD_ACTIONS_ = {
    beginPdfDirectUpload: 1,
    finalizePdfDirectUpload: 1,
    beginPdfChunkUpload: 1,
    savePdfUploadChunk: 1,
    finalizePdfChunkUpload: 1,
    saveSiteDoc: 1,
    saveSiteDocChunk: 1,
    saveInspectionFileComment: 1,
    uploadInspectionFormTemplate: 1,
    saveProjectDoc: 1
  };

  function isIOS_() {
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    try {
      if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  function isMobile_() {
    return isIOS_() || /Android|Mobile/i.test(navigator.userAgent || '');
  }

  function timeoutForAction_(action) {
    if (UPLOAD_ACTIONS_[action]) return UPLOAD_TIMEOUT_MS;
    if (isIOS_()) return IOS_TIMEOUT_MS;
    if (isMobile_()) return MOBILE_TIMEOUT_MS;
    return DEFAULT_TIMEOUT_MS;
  }

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

  function gasCallJsonp_(action, argsJson, requestId, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const cbName = '_gasJsonp_' + requestId.replace(/[^\w]/g, '');
      let script = null;
      const waitMs = timeoutMs || DEFAULT_TIMEOUT_MS;
      let settled = false;

      const timeout = setTimeout(function () {
        finishErr(new Error('API timeout'));
      }, waitMs);

      function cleanup() {
        clearTimeout(timeout);
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
        script = null;
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

      window[cbName] = function (data) {
        if (!data || (data.requestId && data.requestId !== requestId)) return;
        if (data.ok) finishOk(data.result);
        else finishErr(new Error(data.error || 'API error'));
      };

      try {
        script = document.createElement('script');
        script.async = true;
        script.src = buildJsonpUrl_(action, argsJson, requestId, cbName);
        script.onerror = function () {
          finishErr(new Error('API script load failed (403?) — ลองรีเฟรชหน้า'));
        };
        (document.head || document.documentElement).appendChild(script);
      } catch (e) {
        finishErr(e);
      }
    });
  }

  /**
   * POST ผ่าน iframe ซ่อน — ใช้เมื่อ JSONP URL ยาวหรือโหลดสคริปต์ 403
   * doPost(client:'pages') ตอบกลับด้วย postMessage ไปยัง parent/top
   * iOS Safari: อย่าใช้ iframe ขนาด 0 (มักไม่รัน JS ในเฟรม)
   */
  function gasCallPopupPost_(action, args, requestId, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!window.GAS_API_URL) {
        reject(new Error('ไม่พบ GAS_API_URL'));
        return;
      }

      let settled = false;
      const frameName = 'gas_api_frame_' + requestId.replace(/[^\w]/g, '');
      let iframe = null;
      let form = null;
      const waitMs = timeoutMs || DEFAULT_TIMEOUT_MS;

      const timeout = setTimeout(function () {
        finishErr(new Error('API timeout'));
      }, waitMs);

      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        try {
          if (form && form.parentNode) form.parentNode.removeChild(form);
        } catch (e) {}
        try {
          if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch (e2) {}
        form = null;
        iframe = null;
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

      const payload = {
        action: action,
        args: args || [],
        sessionToken: getStoredSessionToken(),
        requestId: requestId,
        client: 'pages'
      };

      try {
        iframe = document.createElement('iframe');
        iframe.name = frameName;
        iframe.setAttribute('aria-hidden', 'true');
        iframe.setAttribute('title', 'gas-api');
        // iOS: เฟรม 0x0 / display:none มักไม่ execute สคริปต์ postMessage
        iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:0;top:0;opacity:0.01;border:0;pointer-events:none;';
        document.body.appendChild(iframe);

        form = document.createElement('form');
        form.method = 'POST';
        form.action = String(window.GAS_API_URL);
        form.target = frameName;
        form.acceptCharset = 'UTF-8';
        form.style.cssText = 'position:fixed;width:1px;height:1px;left:0;top:0;opacity:0;border:0;';
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'payload';
        input.value = JSON.stringify(payload);
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      } catch (e) {
        finishErr(new Error('เปิดช่องทาง API ไม่สำเร็จ'));
      }
    });
  }

  function withTimeout_(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error(label || 'API timeout'));
      }, ms);
      promise.then(function (v) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      }, function (e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(e);
      });
    });
  }

  /**
   * iOS: ลอง JSONP สั้นๆ ก่อน แล้วค่อย iframe — กันค้างนิ่งเมื่อ Safari ไม่ยิง onerror
   */
  function gasCallIos_(action, compact, argsJson, requestId, waitMs) {
    var jsonpWait = Math.min(IOS_JSONP_FIRST_MS, waitMs);
    return withTimeout_(
      gasCallJsonp_(action, argsJson, requestId, jsonpWait),
      jsonpWait + 500,
      'API timeout'
    ).catch(function () {
      var left = Math.max(8000, waitMs - jsonpWait);
      return gasCallPopupPost_(action, compact, requestId + 'p', left);
    });
  }

  /**
   * JSONP เป็นหลัก
   * ถ้า URL ยาวหรือ JSONP 403 จะใช้ POST ผ่าน iframe ซ่อนแทน (ไม่เด้งหน้าต่าง)
   */
  function gasCall(action, args) {
    const requestId = newRequestId();
    const compact = compactArgs_(args);
    const argsJson = JSON.stringify(compact || []);
    const waitMs = timeoutForAction_(action);

    if (argsJson.length > 50000) {
      return Promise.reject(new Error('คำขอนี้ใหญ่เกินไป'));
    }

    const probeCb = '_gasJsonp_' + requestId.replace(/[^\w]/g, '');
    const urlLen = buildJsonpUrl_(action, argsJson, requestId, probeCb).length;
    if (urlLen > JSONP_URL_SOFT_LIMIT || argsJson.length > 2500) {
      return gasCallPopupPost_(action, compact, requestId, waitMs);
    }

    if (isIOS_()) {
      return gasCallIos_(action, compact, argsJson, requestId, waitMs);
    }

    return gasCallJsonp_(action, argsJson, requestId, waitMs).catch(function (err) {
      const msg = (err && err.message) ? err.message : String(err || '');
      if (/script load failed|403|API timeout/i.test(msg)) {
        return gasCallPopupPost_(action, compact, requestId, waitMs);
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
