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

  window.loadAllPartials = async function () {
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
      if (container && html) {
        container.insertAdjacentHTML('beforeend', html);
      }
    });

    // Dispatch a custom event indicating all partials are loaded and inserted into the DOM
    window.dispatchEvent(new CustomEvent('partialsLoaded'));
  };
})();
