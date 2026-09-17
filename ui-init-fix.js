// ============================================================================
// UI initialization race-condition fix
// Loaded after app.js so it can safely harden helpers that depend on modular
// views being present in the DOM.
// ============================================================================
(function () {
  'use strict';

  function install() {
    if (typeof window.setupAllergyCheckboxes === 'function') {
      window.setupAllergyCheckboxes = function () {
        const container = document.getElementById('allergies-container');
        if (!container) {
          console.warn('[UIInitFix] allergies-container is not mounted yet; skipping allergy checkbox setup.');
          return false;
        }

        const options = Array.isArray(window.allergyOptions)
          ? window.allergyOptions
          : ['Falling doing ambulation', 'Dypnea on exertion', 'Wight bearing', 'Over exercise', 'ยา Phenytoin'];

        container.innerHTML = options.map(opt =>
          `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="Allergies" value="${opt}"><label class="form-check-label text-sm">${opt}</label></div>`
        ).join('');
        container.insertAdjacentHTML('beforeend', '<div class="mt-2"><input type="text" id="AllergiesOther" class="form-control form-control-sm" placeholder="อื่นๆ ระบุ..."></div>');
        return true;
      };
      window.__imcAllergyCheckboxFixInstalled = true;
    }
  }

  install();

  // Views are loaded asynchronously. Retry after they are mounted so the
  // patient registration modal gets its allergy controls without throwing.
  window.addEventListener('imc-views-loaded', function () {
    install();
    if (typeof window.setupAllergyCheckboxes === 'function') {
      window.setupAllergyCheckboxes();
    }
  });

  [0, 100, 500, 1000].forEach(delay => setTimeout(install, delay));
})();
