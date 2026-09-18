// Geolocation capture for OPD / SOAP records.
// Location is captured ONLY when the user explicitly clicks the button.
// No automatic GPS capture on patient/service selection.

(function () {
  'use strict';

  const GEO_FIELDS = ['GeoLatitude','GeoLongitude','GeoAddress','GeoLocationTimestamp','GeoTimestamp'];
  let pendingGeo = null;

  function thaiNow() {
    return new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
  }

  function formatAddress(a) {
    if (!a) return '';
    const house = a.house_number || '';
    const road = a.road || '';
    const sub = a.suburb || a.village || a.town || '';
    const district = a.city_district || a.county || '';
    const province = a.state || a.province || '';
    const postcode = a.postcode || '';
    return [
      house && 'บ้านเลขที่ ' + house,
      road && 'ถ.' + road,
      sub && 'ต.' + sub,
      district && 'อ.' + district,
      province && 'จังหวัด' + province,
      postcode
    ].filter(Boolean).join(' ');
  }

  async function reverseGeocode(lat, lon) {
    const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
      encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon) + '&accept-language=th';
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('ไม่สามารถค้นหาที่อยู่จากพิกัดได้');
    const data = await res.json();
    return formatAddress(data.address) || data.display_name || '';
  }

  function getPosition(options) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง'));
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function captureLocation() {
    let pos;
    try {
      pos = await getPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
    } catch (e) {
      pos = await getPosition({
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0
      });
    }

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const timestamp = new Date(pos.timestamp || Date.now()).toISOString();
    const address = await reverseGeocode(lat, lon);
    const display = 'พิกัด ' + (address || ('ละติจูด ' + lat.toFixed(6) + ' ลองจิจูด ' + lon.toFixed(6))) +
      ' เวลา ' + thaiNow() + ' น.';

    pendingGeo = {
      GeoLatitude: lat,
      GeoLongitude: lon,
      GeoAddress: address,
      GeoLocationTimestamp: display,
      GeoTimestamp: timestamp
    };
    return pendingGeo;
  }

  function setGeoFields(form, geo, formType) {
    if (!form || !geo) return;
    form.__pendingGeo = geo;
    GEO_FIELDS.forEach(k => {
      const input = form.querySelector('[name="' + k + '"]');
      if (input) input.value = geo[k] ?? '';
    });

    // Support both the original GAS markup and the newer delegated markup.
    const prefix = formType === 'soap' ? 'soap' : '';
    const display = document.getElementById(prefix ? 'soapGeoLocationDisplay' : 'geoLocationDisplay');
    if (display) {
      display.value = geo.GeoLocationTimestamp || '';
      display.textContent = geo.GeoLocationTimestamp || '';
      display.style.color = '#166534';
    }

    const result = form.querySelector('[data-geo-result]');
    if (result) {
      result.textContent = geo.GeoLocationTimestamp || '';
      result.style.color = '#166534';
    }

    const button = form.querySelector('[data-geo-capture-button]');
    if (button) {
      button.textContent = '✓ บันทึกพิกัดแล้ว (กดใหม่เพื่ออัปเดต)';
    }
  }

  // Original GAS forms call captureGeoLocation('opd'|'soap') directly from the button.
  // Keep that exact UI contract while using Supabase/browser geolocation underneath.
  window.captureGeoLocation = async function (formType) {
    const form = document.getElementById(formType === 'soap' ? 'soap-note-form' : 'opd-form');
    if (!form) {
      if (window.Swal) Swal.fire('แจ้งเตือน', 'ไม่พบฟอร์มสำหรับบันทึกพิกัด', 'warning');
      return;
    }

    const prefix = formType === 'soap' ? 'soap' : '';
    const button = form.querySelector('button[onclick*="captureGeoLocation"]') || form.querySelector('[data-geo-capture-button]');
    const display = document.getElementById(prefix ? 'soapGeoLocationDisplay' : 'geoLocationDisplay');

    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = 'กำลังบันทึกพิกัด...';
    }
    if (display) {
      display.value = 'กำลังขอพิกัดจากอุปกรณ์...';
      display.textContent = 'กำลังขอพิกัดจากอุปกรณ์...';
    }

    try {
      const geo = await captureLocation();
      setGeoFields(form, geo, formType);
    } catch (err) {
      if (display) {
        display.value = 'ไม่สามารถบันทึกพิกัดได้: ' + (err.message || err);
        display.textContent = 'ไม่สามารถบันทึกพิกัดได้: ' + (err.message || err);
      }
      if (window.Swal) Swal.fire('ไม่สามารถบันทึกพิกัด', err.message || String(err), 'error');
      if (button) button.textContent = button.dataset.originalText || 'ลงพิกัดและเวลา';
    } finally {
      if (button) button.disabled = false;
    }
  };

  // Keep support for delegated buttons if any remain in older cached markup.
  document.addEventListener('click', async function (event) {
    const button = event.target.closest('[data-geo-capture-button]');
    if (!button) return;
    if (button.getAttribute('onclick')) return;

    const form = button.closest('form');
    if (!form) return;

    const formType = form.id === 'soap-note-form' ? 'soap' : 'opd';
    await window.captureGeoLocation(formType);
  });

  // OPD and SOAP collect the hidden geolocation fields directly from their forms.
})();
