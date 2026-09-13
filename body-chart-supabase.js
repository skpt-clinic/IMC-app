(function () {
  'use strict';

  const BODY_CHART_BUCKET = 'body-charts';
  const BODY_CHART_TEMPLATE_URL = new URL('Body%20Chart.jpg', document.baseURI).href;
  const BODY_CHART_MAX_BYTES = 5 * 1024 * 1024;

  function getCanvasDataUrl(padName) {
    const pad = typeof signaturePads !== 'undefined' && signaturePads[padName];
    return pad && !pad.isEmpty() ? pad.toDataURL('image/png') : '';
  }

  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/png';
    const binary = atob(parts[1] || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function uploadDrawing(dataUrl, patientId, visitCount, kind) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return '';
    if (!window.supabaseClient) throw new Error('Supabase client ยังไม่พร้อมใช้งาน');

    const blob = dataUrlToBlob(dataUrl);
    if (blob.size > BODY_CHART_MAX_BYTES) throw new Error(`${kind} มีขนาดเกิน 5 MB`);

    const safePatient = String(patientId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
    const safeVisit = String(visitCount || '0').replace(/[^A-Za-z0-9_-]/g, '_');
    const fileName = `${kind}-${safeVisit}-${Date.now()}.png`;
    const path = `${safePatient}/${fileName}`;

    const { error } = await window.supabaseClient.storage
      .from(BODY_CHART_BUCKET)
      .upload(path, blob, { contentType: 'image/png', upsert: false, cacheControl: '3600' });

    if (error) throw new Error(`อัปโหลด ${kind} ไม่สำเร็จ: ${error.message}`);
    return path;
  }

  async function signedUrl(path) {
    const { data, error } = await window.supabaseClient.storage
      .from(BODY_CHART_BUCKET)
      .createSignedUrl(path, 3600);
    if (error) throw error;
    return data && data.signedUrl ? data.signedUrl : '';
  }

  async function resolveImageSource(value) {
    if (!value) return '';
    const text = String(value).trim();
    if (!text) return '';
    if (text.startsWith('data:image/')) return text;
    if (/^https?:\/\//i.test(text)) return text;
    if (text.startsWith(BODY_CHART_BUCKET + '/')) return await signedUrl(text.slice(BODY_CHART_BUCKET.length + 1));
    return text;
  }

  async function drawImageOnCanvas(canvasId, source, fallbackToTemplate) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const canvasWidth = canvas.offsetWidth || canvas.width;
    const canvasHeight = canvas.offsetHeight || canvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let src = '';
    try { src = await resolveImageSource(source); } catch (e) { console.warn('ไม่สามารถสร้าง signed URL:', e); }
    if (!src && fallbackToTemplate) src = BODY_CHART_TEMPLATE_URL;
    if (!src) return;

    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvasWidth - w) / 2;
        const y = (canvasHeight - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        resolve();
      };
      img.onerror = () => {
        if (fallbackToTemplate && src !== BODY_CHART_TEMPLATE_URL) {
          const retry = new Image();
          retry.onload = () => {
            const scale = Math.min(canvasWidth / retry.width, canvasHeight / retry.height);
            const w = retry.width * scale;
            const h = retry.height * scale;
            retry.crossOrigin = 'anonymous';
            ctx.drawImage(retry, (canvasWidth - w) / 2, (canvasHeight - h) / 2, w, h);
            resolve();
          };
          retry.onerror = resolve;
          retry.src = BODY_CHART_TEMPLATE_URL;
        } else resolve();
      };
      img.src = src;
    });
  }

  window.loadBodyChartImage = async function (canvasId, value) {
    await drawImageOnCanvas(canvasId, value, true);
  };

  window.initializeOpdCanvases = function (record = null) {
    setTimeout(async () => {
      initializeSignaturePad('bodyChartCanvas', 'bodyChart');
      initializeSignaturePad('therapistSignatureCanvas', 'therapist');
      initializeSignaturePad('patientSignatureCanvas', 'patient');

      const bodyValue = record && (record.BodyChartDrawingUrl || record.BodyChartDrawingBase64);
      await window.loadBodyChartImage('bodyChartCanvas', bodyValue);
      if (record && record.TherapistSignatureBase64) loadCanvasImage('therapistSignatureCanvas', record.TherapistSignatureBase64);
      if (record && record.PatientSignatureBase64) loadCanvasImage('patientSignatureCanvas', record.PatientSignatureBase64);
    }, 100);
  };

  window.refreshBodyChart = async function () {
    showLoading('กำลังโหลด Body Chart...');
    initializeSignaturePad('bodyChartCanvas', 'bodyChart');
    await window.loadBodyChartImage('bodyChartCanvas', null);
    Swal.close();
  };

  window.clearCanvas = function (padName) {
    const pad = typeof signaturePads !== 'undefined' && signaturePads[padName];
    if (pad) pad.clear();
    if (padName === 'bodyChart') window.loadBodyChartImage('bodyChartCanvas', null);
  };

  window.handleOpdFormSubmit = async function (onSuccessCallback) {
    showLoading('กำลังบันทึก OPD Card...');
    try {
      const record = getOpdFormData();
      const patientId = record.PatientID || (typeof currentPatient !== 'undefined' && currentPatient && currentPatient.PatientID);
      const visitCount = record.VisitCount || 0;

      const bodyData = getCanvasDataUrl('bodyChart');
      const therapistData = getCanvasDataUrl('therapist');
      const patientData = getCanvasDataUrl('patient');

      if (bodyData) {
        record.BodyChartDrawingUrl = `${BODY_CHART_BUCKET}/` + await uploadDrawing(bodyData, patientId, visitCount, 'body-chart');
      }
      if (therapistData) {
        record.TherapistSignatureUrl = `${BODY_CHART_BUCKET}/` + await uploadDrawing(therapistData, patientId, visitCount, 'therapist-signature');
      }
      if (patientData) {
        record.PatientSignatureUrl = `${BODY_CHART_BUCKET}/` + await uploadDrawing(patientData, patientId, visitCount, 'patient-signature');
      }

      record.BodyChartDrawingBase64 = '';
      record.TherapistSignatureBase64 = '';
      record.PatientSignatureBase64 = '';

      google.script.run.withSuccessHandler(response => {
        if (response.status === 'success') {
          showSuccessToast(response.message);
          google.script.run.updateScheduleStatus(record.PatientID, record.VisitCount);
          onSaveSuccess();
          if (typeof onSuccessCallback === 'function') onSuccessCallback();
          else showHistory('OPD');
        } else {
          showError(response);
        }
      }).withFailureHandler(showError).saveOpdRecord(record);
    } catch (error) {
      Swal.close();
      showError({ message: error.message || 'ไม่สามารถบันทึกรูปภาพ OPD ได้' });
    }
  };

  window.supabaseImageStorage = {
    bucket: BODY_CHART_BUCKET,
    templateUrl: BODY_CHART_TEMPLATE_URL,
    uploadDrawing,
    signedUrl,
    resolveImageSource
  };
})();
