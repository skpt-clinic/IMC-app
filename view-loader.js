// ============================================================================
// View Loader
// Loads the SPA partials and the client-side integrations required by IMC Plus.
// ============================================================================

const VIEWS = [
  'views/view-dashboard.html',
  'views/view-patient-list.html',
  'views/view-patient-detail.html',
  'views/view-service.html',
  'views/view-summary.html',
  'views/view-schedule.html',
  'views/view-admin.html',
  'views/modals/modal-patient.html',
  'views/modals/modal-schedule.html',
  'views/modals/modal-download.html'
];

// Load these once, before the view HTML is inserted.  In particular, the
// document-print adapter must be available before EMR/service views bind their
// print buttons.
const EXTRA_SCRIPTS = [
  'bridge-proxy.js?v=20260916_print3',
  'gas-bridge-capture.js?v=20260916_print3',
  'google-docs-template-adapter-v2.js?v=20260916_print3'
];

async function loadScriptOnce(src) {
  const key = src.split('?')[0];
  if (document.querySelector(`script[data-view-loader-script="${key}"]`)) return;

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.dataset.viewLoaderScript = key;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadAllPartials() {
  try {
    for (const src of EXTRA_SCRIPTS) await loadScriptOnce(src);

    const container = document.getElementById('views-container');
    if (!container) return;

    for (const path of VIEWS) {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
      container.insertAdjacentHTML('beforeend', await response.text());
    }

    // Signal that all view HTML and print integrations are ready.
    window.dispatchEvent(new CustomEvent('imc-views-loaded'));
  } catch (error) {
    console.error('[IMC] View loading error:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAllPartials, { once: true });
} else {
  loadAllPartials();
}
