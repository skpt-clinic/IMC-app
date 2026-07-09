(function () {
  if (window.google && window.google.script && window.google.script.run) {
    return;
  }

  const GAS_BRIDGE_URL =
    window.GAS_BRIDGE_URL ||
    'https://script.google.com/macros/s/AKfycbxXrm3QgmEbFiNrLousaEF5kLk40fec_oYcRNPHXacdYZFI35UeVLVS5SZ1BUmUBizY/exec?view=bridge';

  const pendingCalls = new Map();
  const queuedCalls = [];
  const CALL_TIMEOUT_MS = 20000;
  let callId = 0;
  let bridgeWindow = null;
  let bridgeWindowNavigated = false;
  let bridgeReady = false;

  function createError(payload) {
    if (!payload) return new Error('Unknown GAS bridge error');
    const error = new Error(payload.message || String(payload));
    if (payload.name) error.name = payload.name;
    if (payload.stack) error.stack = payload.stack;
    return error;
  }

  function ensureBridgeWindow() {
    if (bridgeWindow && !bridgeWindow.closed) return bridgeWindow;

    bridgeWindow = window.open(
      'about:blank',
      'gasBridge',
      'popup=yes,width=1,height=1,left=0,top=0'
    );

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

  function flushQueue() {
    if (!bridgeReady || !bridgeWindow || bridgeWindow.closed) return;
    while (queuedCalls.length) {
      bridgeWindow.postMessage(queuedCalls.shift(), '*');
    }
  }

  function send(payload) {
    const targetWindow = ensureBridgeWindow();
    if (!targetWindow) {
      throw new Error('ไม่สามารถเปิดหน้าต่างเชื่อมต่อกับ GAS ได้ กรุณาอนุญาตป๊อปอัปหรือเปิดจากหน้า GAS');
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

  window.addEventListener('pointerdown', prewarmBridgeWindow, { once: true, capture: true });
  window.addEventListener('focusin', prewarmBridgeWindow, { once: true, capture: true });

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
