// Captures the GAS bridge proxy function without overwriting an existing one.
// The adapter calls window.generatePdfAsBase64(templateId, data, fileName).
(() => {
  if (window.__imcGasCaptureInstalled) return;
  window.__imcGasCaptureInstalled = true;

  const install = () => {
    if (typeof window.gasBridgeCall !== 'function') return false;
    if (typeof window.generatePdfAsBase64 !== 'function') {
      window.generatePdfAsBase64 = (templateId, data, fileName) =>
        window.gasBridgeCall('generatePdfAsBase64', [templateId, data, fileName]);
    }
    return true;
  };

  if (!install()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (install() || tries >= 100) clearInterval(timer);
    }, 100);
  }
})();
