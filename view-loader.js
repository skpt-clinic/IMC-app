(function () {
  const PARTIALS = [
    { containerId: 'main-content-scroll', file: 'views/view-dashboard.html' },
    { containerId: 'main-content-scroll', file: 'views/view-patient-list.html' },
    { containerId: 'main-content-scroll', file: 'views/view-patient-detail.html' },
    { containerId: 'main-content-scroll', file: 'views/view-service.html' },
    { containerId: 'main-content-scroll', file: 'views/view-schedule.html' },
    { containerId: 'main-content-scroll', file: 'views/view-summary.html' },
    { containerId: 'main-content-scroll', file: 'views/view-admin.html' },
    { containerId: 'modals-container', file: 'views/modals/modal-patient.html' },
    { containerId: 'modals-container', file: 'views/modals/modal-schedule.html' },
    { containerId: 'modals-container', file: 'views/modals/modal-download.html' }
  ];

  const EXTRA_SCRIPTS = [
    'bridge-proxy.js?v=20260916_docs1',
    'gas-bridge-capture.js?v=20260916_docs1',
    'google-docs-template-adapter.js?v=20260916_docs1'
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  window.loadAllPartials = async function () {
    try {
      for (const src of EXTRA_SCRIPTS) await loadScript(src);
    } catch (err) {
      console.error('Failed to initialize Google Docs template adapter:', err);
    }

    const promises = PARTIALS.map(async (item) => {
      try {
        const res = await fetch(item.file + '?v=20260913_4');
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${item.file}`);
        const html = await res.text();
        return { ...item, html };
      } catch (err) {
        console.error('Failed to load partial:', item.file, err);
        return { ...item, html: '' };
      }
    });

    const results = await Promise.all(promises);
    results.forEach(({ containerId, html }) => {
      const container = document.getElementById(containerId);
      if (container && html) container.insertAdjacentHTML('beforeend', html);
    });

    window.dispatchEvent(new CustomEvent('partialsLoaded'));
  };
})();
