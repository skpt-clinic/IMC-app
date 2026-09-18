// ================================================================
// GEOLOCATION SUPPORT - OPD/SOAP service selection + document stamp
// Captures GPS after service type selection and again before save.
// Saves GeoLatitude, GeoLongitude, GeoAddress, GeoLocationTimestamp.
// ================================================================
(function () {
  'use strict';

  const CACHE_MS = 2 * 60 * 1000;
  let capturePromise = null;

  function getPosition(options) {
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext) return reject(new Error('ระบบต้องเปิดผ่าน HTTPS จึงจะใช้พิกัดได้'));
      if (!navigator.geolocation) return reject(new Error('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง'));
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function getCurrentLocation() {
    let pos;
    try {
      pos = await getPosition({ enableHighAccuracy:false, timeout:8000, maximumAge:CACHE_MS });
    } catch (e) {
      pos = await getPosition({ enableHighAccuracy:true, timeout:12000, maximumAge:0 });
    }
    const lat=Number(pos.coords.latitude), lon=Number(pos.coords.longitude);
    const iso=new Date(pos.timestamp || Date.now()).toISOString();
    let address='';
    try {
      const u='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&zoom=18&addressdetails=1';
      const res=await fetch(u,{headers:{Accept:'application/json'}});
      if(res.ok){
        const j=await res.json();
        address=formatThaiAddress(j.address||{});
      }
    } catch(e){ console.warn('[IMC] reverse geocode unavailable',e); }

    return {
      GeoLatitude:lat,
      GeoLongitude:lon,
      GeoAddress:address,
      GeoLocationTimestamp:formatStamp(address,lat,lon,iso),
      GeoTimestamp:new Date().toISOString()
    };
  }

  function formatThaiAddress(a){
    const house=a.house_number || a.house || '';
    const road=a.road || a.pedestrian || a.footway || '';
    const sub=a.village || a.suburb || a.neighbourhood || a.quarter || '';
    const tambon=a.town || a.municipality || a.city_district || a.subdistrict || '';
    const amphoe=a.county || a.district || '';
    const province=a.state || a.province || '';
    const postcode=a.postcode || '';
    const parts=[];
    if(house) parts.push('บ้านเลขที่ '+house);
    if(road) parts.push('ถ.'+road);
    if(sub) parts.push(sub);
    if(tambon) parts.push('ต.'+tambon);
    if(amphoe) parts.push('อ.'+amphoe);
    if(province) parts.push('จังหวัด'+province);
    if(postcode) parts.push(postcode);
    return parts.join(' ');
  }

  function formatStamp(address,lat,lon,iso){
    const d=new Date(iso);
    const parts=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d);
    const get=k=>parts.find(x=>x.type===k)?.value||'';
    const date=get('day')+'/'+get('month')+'/'+get('year');
    const time=get('hour')+':'+get('minute')+':'+get('second');
    const place=address || ('พิกัด '+lat.toFixed(6)+', '+lon.toFixed(6));
    return 'พิกัด '+place.replace(/^พิกัด\s*/,'')+' เวลา '+date+' '+time+' น.';
  }

  async function captureGeoForRecord(record){
    if(capturePromise) {
      try { const loc=await capturePromise; Object.assign(record,loc); return {ok:true,location:loc}; } catch(e){}
    }
    capturePromise=getCurrentLocation();
    try {
      const location=await capturePromise;
      Object.assign(record,location);
      window.__pendingGeoLocation=location;
      return {ok:true,location};
    } catch(error) {
      console.warn('[IMC] Geolocation unavailable:',error);
      return {ok:false,error};
    } finally { capturePromise=null; }
  }

  window.getCurrentLocationForRecord=getCurrentLocation;
  window.captureGeoForRecord=captureGeoForRecord;

  function looksLikeServiceField(el){
    if(!el) return false;
    const s=((el.name||'')+' '+(el.id||'')).toLowerCase();
    if(/service|servicetype|treatmenttype|ประเภท.*บริการ|ประเภท.*ให้บริการ/.test(s)) return true;
    const form=el.closest('form,[id*="opd" i],[id*="soap" i],[class*="opd" i],[class*="soap" i]');
    if(form && (el.tagName==='SELECT' || el.type==='radio')){
      const holder=el.closest('.form-group,.mb-3,.row,.field-group,div,label') || el.parentElement;
      const txt=(holder?.innerText || holder?.textContent || '').replace(/\\s+/g,' ');
      if(/ประเภท(?:การ)?ให้บริการ|ประเภทบริการ|บริการที่ให้|รูปแบบการให้บริการ/.test(txt)) return true;
    }
    return false;
  }

  async function captureAfterServiceSelection(){
    if(window.__geoCaptureBusy) return;
    window.__geoCaptureBusy=true;
    try {
      if(typeof Swal!=='undefined') Swal.fire({title:'กำลังบันทึกพิกัดสถานที่ให้บริการ',text:'กรุณารอสักครู่...',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
      const result=await captureGeoForRecord({});
      if(typeof Swal!=='undefined') Swal.close();
      if(!result.ok && typeof Swal!=='undefined'){
        Swal.fire({icon:'warning',title:'ไม่สามารถบันทึกพิกัดได้',text:result.error?.message||'กรุณาเปิด Location/GPS แล้วลองใหม่'});
      } else if(result.ok && typeof showSuccessToast==='function') {
        showSuccessToast('บันทึกพิกัดและเวลาสถานที่ให้บริการแล้ว');
      }
    } finally { window.__geoCaptureBusy=false; }
  }

  // Service type is often rendered dynamically, so use event delegation.
  document.addEventListener('change',e=>{
    if(looksLikeServiceField(e.target) && String(e.target.value||'').trim()) captureAfterServiceSelection();
  },true);
  document.addEventListener('click',e=>{
    const el=e.target.closest?.('[data-service-type],[data-service],[data-servicetype]');
    if(el) setTimeout(()=>captureAfterServiceSelection(),0);
  },true);

  // Also capture when OPD/SOAP submit is reached, ensuring the document always has a fresh stamp.
  function wrapSubmit(name,dataBuilderName){
    const original=window[name];
    if(typeof original!=='function' || original.__geoWrapped) return;
    const wrapped=async function(onSuccessCallback){
      const result=await captureGeoForRecord({});
      if(!result.ok){
        const proceed=typeof Swal!=='undefined'
          ? await Swal.fire({icon:'warning',title:'ไม่สามารถดึงพิกัดได้',text:(result.error?.message||'ไม่พบตำแหน่ง')+' ต้องการบันทึกต่อโดยไม่มีพิกัดหรือไม่?',showCancelButton:true,confirmButtonText:'บันทึกต่อ',cancelButtonText:'ยกเลิก'})
          : {isConfirmed:confirm('ไม่สามารถดึงพิกัดได้ ต้องการบันทึกต่อหรือไม่?')};
        if(!proceed.isConfirmed) return;
      } else {
        window.__pendingGeoLocation=result.location;
      }
      try { return await original.call(this,onSuccessCallback); }
      finally { window.__pendingGeoLocation=null; }
    };
    wrapped.__geoWrapped=true;
    window[name]=wrapped;
  }

  function patchBuilders(){
    const op=window.getOpdFormData;
    if(typeof op==='function' && !op.__geoWrapped){
      const w=function(){const d=op.apply(this,arguments);if(window.__pendingGeoLocation)Object.assign(d,window.__pendingGeoLocation);return d;};
      w.__geoWrapped=true; window.getOpdFormData=w;
    }
    const so=window.getSoapFormData;
    if(typeof so==='function' && !so.__geoWrapped){
      const w=function(){const d=so.apply(this,arguments);if(window.__pendingGeoLocation&&d?.soapData)Object.assign(d.soapData,window.__pendingGeoLocation);return d;};
      w.__geoWrapped=true; window.getSoapFormData=w;
    }
    wrapSubmit('handleOpdFormSubmit','getOpdFormData');
    wrapSubmit('handleSoapNoteSubmit','getSoapFormData');
  }
  const observer=new MutationObserver(patchBuilders);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(patchBuilders,1000);
  patchBuilders();

  console.log('[IMC] Geolocation stamp ready');
})();