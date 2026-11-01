// ============================================================================
/* IMC Plus - GAS Bridge Proxy */
(() => {
  'use strict';
  if (window.__imcGasBridgeProxyInstalled) return;
  window.__imcGasBridgeProxyInstalled = true;

  const BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbxXrm3QgmEbFiNrLousaEF5kLk40fec_oYcRNPHXacdYZFI35UeVLVS5SZ1BUmUBizY/exec?view=bridge';
  let bridgeFrame = null;
  let ready = false;
  let seq = 0;
  const pending = new Map();

  function ensureFrame() {
    if (bridgeFrame && bridgeFrame.contentWindow) return;
    bridgeFrame = document.createElement('iframe');
    bridgeFrame.src = BRIDGE_URL;
    bridgeFrame.title = 'GAS Bridge';
    bridgeFrame.setAttribute('aria-hidden', 'true');
    bridgeFrame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(bridgeFrame);
    ready = false;
  }

  function postToBridgeFrames(payload) {
    // Apps Script wraps HtmlService pages in nested cross-origin frames.
    // Broadcast to the web app frame and its descendants; only Bridge.html
    // handles bridge-call, while its bridge-ready/response messages target us.
    const queue = [bridgeFrame?.contentWindow];
    const visited = new Set();
    while (queue.length) {
      const target = queue.shift();
      if (!target || visited.has(target)) continue;
      visited.add(target);
      try { target.postMessage(payload, '*'); } catch (error) {
        console.warn('[GASBridge] Could not message a frame:', error);
      }
      try {
        for (let i = 0; i < target.frames.length; i++) queue.push(target.frames[i]);
      } catch (_) {
        // Cross-origin frame enumeration may be restricted by some browsers.
      }
    }
  }

  window.addEventListener('message', event => {
    const data = event.data || {};
    if (data.type === 'bridge-ready') { ready = true; return; }
    if (data.type !== 'bridge-response') return;
    const p = pending.get(data.id); if (!p) return;
    pending.delete(data.id);
    if (data.ok) p.resolve(data.result);
    else p.reject(new Error(data.error?.message || 'GAS Bridge error'));
  });

  window.gasBridgeCall = (method, args = []) => new Promise((resolve, reject) => {
    ensureFrame();
    const id = `imc-${Date.now()}-${++seq}`;
    pending.set(id, {resolve, reject});
    const send = () => {
      if (!bridgeFrame?.contentWindow) { pending.delete(id); reject(new Error('GAS Bridge iframe unavailable')); return; }
      postToBridgeFrames({type:'bridge-call', id, method, args});
    };
    if (ready) send();
    else {
      const started = Date.now();
      const wait = setInterval(() => {
        if (ready) { clearInterval(wait); send(); }
        else if (Date.now() - started > 15000) { clearInterval(wait); pending.delete(id); reject(new Error('GAS Bridge timeout')); }
      }, 100);
    }
  });
})();
