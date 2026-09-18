// ============================================================================
// IMC Plus - Google Docs Template Adapter Compatibility Fix
// Delegates to ClinicalPrintTemplates / IMCDocsTemplateAdapter v2
// ============================================================================
(() => {
  'use strict';

  async function generateIMCCoverPdf(patientId) {
    if (window.ClinicalPrintTemplates && typeof window.ClinicalPrintTemplates.printDocument === 'function') {
      return window.ClinicalPrintTemplates.printDocument('imccover', patientId);
    }
    if (window.IMCDocsTemplateAdapter && typeof window.IMCDocsTemplateAdapter.generateIMCCoverPdf === 'function') {
      return window.IMCDocsTemplateAdapter.generateIMCCoverPdf(patientId);
    }
    if (window.IMCDocsTemplateAdapter && typeof window.IMCDocsTemplateAdapter.generate === 'function') {
      return window.IMCDocsTemplateAdapter.generate('imccover', patientId, true);
    }
    throw new Error('ไม่พบระบบสร้างเอกสารสำหรับสร้าง IMC Cover');
  }

  window.generateIMCCoverPdf = generateIMCCoverPdf;
})();
