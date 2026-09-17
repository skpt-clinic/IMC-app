// ============================================================================
// View Loader
// Loads the SPA view partials and modal partials used by IMC Plus.
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

const EXTRA_SCRIPTS = [
  'bridge-proxy.js?v=20260917_2',
  'gas-bridge-capture.js?v=20260917_2',
  'google-docs-template-adapter-v2.js?v=20260917_2',
  'google-docs-template-adapter-fix.js?v=20260917_2',
  'patient-list-fix.js?v=20260917_2',
  'dashboard-status-fix.js?v=20260917_1',
  'address-dropdown-fix.js?v=20260917_1'
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

function ensureViewContainers() {
  const mainApp = document.getElementById('main-app');
  if (!mainApp) throw new Error('Required #main-app container is missing from index.html');

  let mainContent = document.getElementById('main-content-scroll');
  if (!mainContent) {
    mainContent = document.getElementById('views-container');
  }
  if (!mainContent) {
    mainContent = document.createElement('main');
    mainContent.id = 'main-content-scroll';
    mainContent.className = 'flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-4 md:p-6';
    mainApp.querySelector('.flex-1.flex.flex-col')?.appendChild(mainContent) || mainApp.appendChild(mainContent);
  }

  let modalContainer = document.getElementById('modals-container');
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'modals-container';
    document.body.appendChild(modalContainer);
  }

  return { mainContent, modalContainer };
}

async function loadAllPartials() {
  try {
    for (const src of EXTRA_SCRIPTS) await loadScriptOnce(src);

    const { mainContent, modalContainer } = ensureViewContainers();
    if (mainContent.dataset.viewsLoaded === 'true') return;
    mainContent.dataset.viewsLoaded = 'true';

    for (const path of VIEWS) {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
      const html = await response.text();
      if (path.includes('/modals/')) {
        modalContainer.insertAdjacentHTML('beforeend', html);
      } else {
        mainContent.insertAdjacentHTML('beforeend', html);
      }
    }

    window.dispatchEvent(new CustomEvent('imc-views-loaded'));
  } catch (error) {
    console.error('[IMC] View loading error:', error);
  }
}

// Navigation links use href="#" for styling/legacy compatibility while their
// inline onclick handlers perform SPA navigation. Prevent the browser's default
// anchor action from replacing the route hash with a bare "#" after the handler
// sets the intended hash (e.g. #/patients, #/schedule, etc.).
document.addEventListener('click', function (event) {
  const link = event.target?.closest?.('.nav-link, .nav-link-mobile');
  if (!link) return;
  if (link.getAttribute('href') === '#') {
    event.preventDefault();
  }
}, true);

window.loadAllPartials = loadAllPartials;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAllPartials, { once: true });
} else {
  loadAllPartials();
}