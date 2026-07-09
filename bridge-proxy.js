(function () {
  if (window.google && window.google.script && window.google.script.run) {
    return;
  }

  const GAS_BRIDGE_URL =
    window.GAS_BRIDGE_URL ||
    'https://script.google.com/macros/s/AKfycbxXrm3QgmEbFiNrLousaEF5kLk40fec_oYcRNPHXacdYZFI35UeVLVS5SZ1BUmUBizY/exec?view=bridge';

  const pendingCalls = new Map();
  const queuedCalls = [];
  let callId = 0;
  let bridgeFrame = null;
  let bridgeReady = false;

  function createError(payload) {
    if (!payload) return new Error('Unknown GAS bridge error');
    const error = new Error(payload.message || String(payload));
    if (payload.name) error.name = payload.name;
    if (payload.stack) error.stack = payload.stack;
    return error;
  }

  function ensureBridgeFrame() {
    if (bridgeFrame) return bridgeFrame;

    bridgeFrame = document.createElement('iframe');
    bridgeFrame.src = GAS_BRIDGE_URL;
    bridgeFrame.title = 'GAS Bridge';
    bridgeFrame.setAttribute('aria-hidden', 'true');
    bridgeFrame.tabIndex = -1;
    bridgeFrame.style.cssText =
      'position:absolute;width:0;height:0;border:0;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';

    const mount = () => {
      if (!bridgeFrame.isConnected) document.body.appendChild(bridgeFrame);
    };

    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });

    return bridgeFrame;
  }

  function flushQueue() {
    if (!bridgeReady || !bridgeFrame || !bridgeFrame.contentWindow) return;
    while (queuedCalls.length) {
      bridgeFrame.contentWindow.postMessage(queuedCalls.shift(), '*');
    }
  }

  function send(payload) {
    ensureBridgeFrame();
    if (!bridgeReady || !bridgeFrame || !bridgeFrame.contentWindow) {
      queuedCalls.push(payload);
      return;
    }
    bridgeFrame.contentWindow.postMessage(payload, '*');
  }

  window.addEventListener('message', (event) => {
    if (!bridgeFrame || event.source !== bridgeFrame.contentWindow) return;

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

    if (data.ok) {
      if (typeof pending.success === 'function') pending.success(data.result);
      return;
    }

    if (typeof pending.failure === 'function') {
      pending.failure(createError(data.error));
    }
  });

  function invoke(method, args, successHandler, failureHandler) {
    const id = `gas-call-${Date.now()}-${++callId}`;
    pendingCalls.set(id, { success: successHandler, failure: failureHandler });
    send({
      type: 'bridge-call',
      id,
      method,
      args: Array.from(args || []),
    });
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

  ensureBridgeFrame();
})();
