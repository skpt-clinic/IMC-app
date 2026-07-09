(function () {
  if (window.google && window.google.script && window.google.script.run) {
    return;
  }

  const GAS_BRIDGE_URL =
    window.GAS_BRIDGE_URL ||
    'https://script.google.com/macros/s/AKfycbxXrm3QgmEbFiNrLousaEF5kLk40fec_oYcRNPHXacdYZFI35UeVLVS5SZ1BUmUBizY/exec?view=bridge';

  const pendingCalls = new Map();
  const queuedCalls = [];
  const CALL_TIMEOUT_MS = 60000;
  let callId = 0;
  let bridgeWindow = null;
  let bridgeWindowNavigated = false;
  let bridgeReady = false;
  let isShowingConnectPrompt = false;

  function createError(payload) {
    if (!payload) return new Error('Unknown GAS bridge error');
    const error = new Error(payload.message || String(payload));
    if (payload.name) error.name = payload.name;
    if (payload.stack) error.stack = payload.stack;
    return error;
  }

  function ensureBridgeWindow() {
    if (bridgeWindow && !bridgeWindow.closed) return bridgeWindow;

    // We must use a popup because Google Apps Script set X-Frame-Options to sameorigin during redirects.
    try {
      bridgeWindow = window.open(
        'about:blank',
        'gasBridge',
        'popup=yes,width=1,height=1,left=0,top=0'
      );
    } catch (e) {
      bridgeWindow = null;
    }

    if (!bridgeWindow) return null;

    try {
      bridgeWindow.focus();
    } catch (error) {
      // Ignore focus errors on browsers that block it.
    }

    return bridgeWindow;
  }

  function navigateBridgeWindow() {
    if (!bridgeWindow || bridgeWindow.closed || bridgeWindowNavigated) return;
    try {
      bridgeWindow.location.replace(GAS_BRIDGE_URL);
      bridgeWindowNavigated = true;
    } catch (error) {
      // If replace is blocked for any reason, fall back to direct assignment.
      try {
        bridgeWindow.location.href = GAS_BRIDGE_URL;
        bridgeWindowNavigated = true;
      } catch (innerError) {
        bridgeWindowNavigated = false;
        throw innerError;
      }
    }
  }

  function prewarmBridgeWindow() {
    if (bridgeWindow && !bridgeWindow.closed) return;
    if (ensureBridgeWindow()) {
      bridgeWindowNavigated = false;
    }
  }

  function showConnectPrompt() {
    if (isShowingConnectPrompt) return;
    isShowingConnectPrompt = true;

    if (window.Swal) {
      window.Swal.fire({
        title: 'การเชื่อมต่อระบบ',
        text: 'กรุณาคลิกปุ่มด้านล่างเพื่อเชื่อมต่อกับฐานข้อมูล Google Apps Script',
        icon: 'info',
        confirmButtonText: 'เชื่อมต่อระบบ',
        confirmButtonColor: '#0d9488',
        allowOutsideClick: false,
        allowEscapeKey: false,
      }).then((result) => {
        isShowingConnectPrompt = false;
        if (result.isConfirmed) {
          const target = ensureBridgeWindow();
          if (target) {
            navigateBridgeWindow();
          } else {
            showConnectPrompt();
          }
        }
      });
    } else {
      const overlay = document.createElement('div');
      overlay.id = 'gas-connect-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      overlay.style.zIndex = '99999';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.style.color = '#fff';
      overlay.style.fontFamily = 'sans-serif';
      overlay.style.padding = '20px';
      overlay.style.textAlign = 'center';

      const title = document.createElement('h3');
      title.textContent = 'ต้องการการเชื่อมต่อกับระบบฐานข้อมูล';
      title.style.marginBottom = '15px';
      overlay.appendChild(title);

      const desc = document.createElement('p');
      desc.textContent = 'กรุณาคลิกปุ่มด้านล่างเพื่อเริ่มการเชื่อมต่อกับ Google Apps Script';
      desc.style.marginBottom = '20px';
      overlay.appendChild(desc);

      const btn = document.createElement('button');
      btn.textContent = 'เชื่อมต่อระบบ';
      btn.style.padding = '10px 20px';
      btn.style.fontSize = '16px';
      btn.style.backgroundColor = '#0d9488';
      btn.style.color = '#fff';
      btn.style.border = 'none';
      btn.style.borderRadius = '5px';
      btn.style.cursor = 'pointer';
      btn.onclick = function() {
        isShowingConnectPrompt = false;
        document.body.removeChild(overlay);
        const target = ensureBridgeWindow();
        if (target) {
          navigateBridgeWindow();
        } else {
          showConnectPrompt();
        }
      };
      overlay.appendChild(btn);
      document.body.appendChild(overlay);
    }
  }

  function flushQueue() {
    if (!bridgeReady || !bridgeWindow || bridgeWindow.closed) return;
    while (queuedCalls.length) {
      bridgeWindow.postMessage(queuedCalls.shift(), '*');
    }
  }

  function send(payload) {
    const targetWindow = ensureBridgeWindow();
    if (!targetWindow) {
      queuedCalls.push(payload);
      showConnectPrompt();
      return;
    }

    navigateBridgeWindow();

    if (!bridgeReady || targetWindow.closed) {
      queuedCalls.push(payload);
      return;
    }

    targetWindow.postMessage(payload, '*');
  }

  window.addEventListener('message', (event) => {
    if (!bridgeWindow || event.source !== bridgeWindow) return;

    const data = event.data || {};
    if (data.type === 'bridge-ready') {
      bridgeReady = true;
      flushQueue();
      return;
    }

    if (data.type !== 'bridge-response') return;

    const pending = pendingCalls.get(data.id);
    if (!pending) return;
    pendingCalls.delete(data.id);

    if (pending.timeoutId) {
      window.clearTimeout(pending.timeoutId);
    }

    if (data.ok) {
      if (typeof pending.success === 'function') pending.success(data.result);
      return;
    }

    if (typeof pending.failure === 'function') {
      pending.failure(createError(data.error));
    }
  });

  window.addEventListener('click', prewarmBridgeWindow, { once: true, capture: true });
  window.addEventListener('touchstart', prewarmBridgeWindow, { once: true, capture: true });

  function invoke(method, args, successHandler, failureHandler) {
    const id = `gas-call-${Date.now()}-${++callId}`;
    const timeoutId = window.setTimeout(() => {
      if (!pendingCalls.has(id)) return;
      pendingCalls.delete(id);
      if (typeof failureHandler === 'function') {
        failureHandler(new Error('เชื่อมต่อกับ GAS ไม่สำเร็จหรือถูกบล็อกโดยเบราว์เซอร์'));
      }
    }, CALL_TIMEOUT_MS);

    pendingCalls.set(id, { success: successHandler, failure: failureHandler, timeoutId });

    try {
      send({
        type: 'bridge-call',
        id,
        method,
        args: Array.from(args || []),
      });
    } catch (error) {
      window.clearTimeout(timeoutId);
      pendingCalls.delete(id);
      if (typeof failureHandler === 'function') {
        failureHandler(error);
      } else {
        throw error;
      }
    }
  }

  function createRunner(successHandler, failureHandler) {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'withSuccessHandler') {
            return (fn) => createRunner(fn, failureHandler);
          }
          if (prop === 'withFailureHandler') {
            return (fn) => createRunner(successHandler, fn);
          }
          if (prop === 'withUserObject') {
            return () => createRunner(successHandler, failureHandler);
          }
          if (prop === Symbol.toStringTag) return 'GasRunProxy';

          return (...args) => invoke(String(prop), args, successHandler, failureHandler);
        },
      }
    );
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner();
})();
