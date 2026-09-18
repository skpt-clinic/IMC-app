// ============================================================================
// IMC Plus - Google Docs Template Adapter Compatibility Fix
// Delegates to IMCDocsTemplateAdapter v2 for consistent template rendering
// ============================================================================
(() => {
  'use strict';

  async function generateIMCCoverPdf(patientId) {
    if (window.IMCDocsTemplateAdapter && typeof window.IMCDocsTemplateAdapter.generateIMCCoverPdf === 'function') {
      return window.IMCDocsTemplateAdapter.generateIMCCoverPdf(patientId);
    }
    if (window.IMCDocsTemplateAdapter && typeof window.IMCDocsTemplateAdapter.generate === 'function') {
      return window.IMCDocsTemplateAdapter.generate('imccover', patientId, true);
    }
    throw new Error('ไม่พบ IMCDocsTemplateAdapter สำหรับสร้าง IMC Cover');
  }

  window.generateIMCCoverPdf = generateIMCCoverPdf;
})();
