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

  function setGeoFields(form, geo) {
    if (!form || !geo) return;
    form.__pendingGeo = geo;
    GEO_FIELDS.forEach(k => {
      const input = form.querySelector('[name="' + k + '"]');
      if (input) input.value = geo[k] ?? '';
    });
    const result = form.querySelector('[data-geo-result]');
    if (result) {
      result.textContent = geo.GeoLocationTimestamp;
      result.style.color = '#166534';
    }
    const button = form.querySelector('[data-geo-capture-button]');
    if (button) {
      button.textContent = '✓ บันทึกพิกัดแล้ว (กดใหม่เพื่ออัปเดต)';
    }
  }

  // The button is rendered immediately after the Service Type block by app.js.
  // GPS is requested only from this explicit click.
  document.addEventListener('click', async function (event) {
    const button = event.target.closest('[data-geo-capture-button]');
    if (!button) return;

    const form = button.closest('form');
    if (!form) return;

    button.disabled = true;
    button.textContent = 'กำลังบันทึกพิกัด...';
    const result = form.querySelector('[data-geo-result]');
    if (result) {
      result.textContent = 'กำลังขอพิกัดจากอุปกรณ์...';
      result.style.color = '#374151';
    }

    try {
      const geo = await captureLocation();
      setGeoFields(form, geo);
    } catch (err) {
      if (result) {
        result.textContent = 'ไม่สามารถบันทึกพิกัดได้: ' + (err.message || err);
        result.style.color = '#b91c1c';
      }
      button.textContent = '📍 บันทึกพิกัดประทับเวลา';
    } finally {
      button.disabled = false;
    }
  });

  // OPD and SOAP collect the hidden geolocation fields directly from their forms.\n})();\n