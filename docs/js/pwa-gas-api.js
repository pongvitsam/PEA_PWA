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

  function gasCallJsonp(action, args) {
    const requestId = newRequestId();
    const argsJson = JSON.stringify(args || []);

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
        reject(new Error('API script load failed (403?) — ลองรีเฟรชหน้า'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Form POST ครั้งเดียว + poll สถานะ (เร็วกว่าหั่นชิ้นหลายรอบ)
   * postMessage ถ้าใช้ได้จะจบทันที — poll เป็นสำรองเมื่อ iframe โดน 403
   */
  function gasCallPostJob(action, args) {
    const jobId = newRequestId();
    const payload = {
      action: action,
      args: args || [],
      sessionToken: getStoredSessionToken(),
      requestId: jobId,
      jobId: jobId,
      client: 'pages'
    };

    return new Promise(function (resolve, reject) {
      const iframeName = '_gasFrame_' + jobId.replace(/[^\w]/g, '');
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = window.GAS_API_URL;
      form.target = iframeName;
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify(payload);
      form.appendChild(input);
      document.body.appendChild(form);

      let done = false;
      const started = Date.now();
      const maxMs = 180000;
      let pollDelay = 600;

      function finishOk(result) {
        if (done) return;
        done = true;
        cleanup();
        resolve(result);
      }
      function finishErr(err) {
        if (done) return;
        done = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
      function cleanup() {
        if (timer) clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        try { if (form.parentNode) form.parentNode.removeChild(form); } catch (e) {}
        try { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch (e) {}
      }

      function onMessage(ev) {
        const data = ev && ev.data;
        if (!data || (data.jobId !== jobId && data.requestId !== jobId)) return;
        if (data.ok) finishOk(data.result);
        else finishErr(data.error || 'API error');
      }

      function schedulePoll() {
        if (done) return;
        timer = setTimeout(function () {
          if (done) return;
          if (Date.now() - started > maxMs) {
            finishErr(new Error('API timeout'));
            return;
          }
          gasCallJsonp('getApiJobStatus', [jobId]).then(function (st) {
            if (done) return;
            if (st && st.status === 'done') finishOk(st.result);
            else if (st && st.status === 'error') finishErr(st.error || 'API error');
            else if (st && st.status === 'running') {
              pollDelay = 500;
              schedulePoll();
            } else {
              pollDelay = Math.min(1500, pollDelay + 200);
              schedulePoll();
            }
          }).catch(function () {
            schedulePoll();
          });
        }, pollDelay);
      }

      let timer = null;
      window.addEventListener('message', onMessage);
      form.submit();
      // เริ่ม poll หลังส่งแล้วเล็กน้อย — ให้เซิร์ฟเวอร์มีเวลาทำงาน
      pollDelay = 800;
      schedulePoll();
    });
  }

  function gasCall(action, args) {
    const argsJson = JSON.stringify(args || []);
    if (argsJson.length > 4500) {
      return gasCallPostJob(action, args);
    }
    return gasCallJsonp(action, args);
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
