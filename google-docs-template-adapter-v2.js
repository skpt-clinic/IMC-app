// ============================================================================
// IMC Plus - Google Docs Template Adapter v2
// Supabase clinical data -> GAS Bridge -> Google Docs Template -> PDF
// ============================================================================

(() => {
  'use strict';

  const TEMPLATES = {
    IMCCover: '1cImx394ZD2zh-H6Szn8G_ED46MlvfF3wvp9D5oaze3s',
    Consent: '1mXw6MdoAz0NMdZ2o51jlrGhe3i3uGQm5i8vCZ7Z4Z0',
    BI: '19dcvgpwgFUbJFeDNRXSSYC_O0oIQg8G9_xtfbI5xgKI',
    OPD: '1L7QGkwA-8KiMjHVmQjCqE3rWZ2hlxWuJ_CkgReqlAWs',
    SOAP: '1q_DBudqfmr_C8eiPjz5WdXb4QTdKrT6RPf-uJQYkxKU',
    TMSE: '1SYy3_6R75qrlPuhSRfLTAo4k81WEQJiG-gah9ZyX7Ks',
    MHQ: '1hVK9JiJHpN2EbBW9AoRwLWgDVHKRpAJOl8PvflDBuys',
    Dysphagia: '1C_Ul9KUU_iqBcYVCV7JTrHO_DCL_YXAbdcJS1OqZesI'
  };

  const TYPE_CONFIG = {
    imccover: { table: 'Patients', id: 'PatientID', template: 'IMCCover', name: 'IMC-Cover' },
    consent: { table: 'Consents', id: 'ConsentID', template: 'Consent', name: 'Consent-Form' },
    bi: { table: 'BIAssessments', id: 'AssessmentID', template: 'BI', name: 'BI-Assessment' },
    opd: { table: 'OPDRecords', id: 'RecordID', template: 'OPD', name: 'OPD-Card' },
    soap: { table: 'SOAPNotes', id: 'SOAPNoteID', template: 'SOAP', name: 'SOAP-Note' },
    tmse: { table: 'TMSE_Records', id: 'RecordID', template: 'TMSE', name: 'TMSE-Assessment' },
    mhq: { table: 'MHQ_Records', id: 'RecordID', template: 'MHQ', name: 'MHQ-Assessment' },
    dysphagia: { table: 'Dysphagia_Records', id: 'RecordID', template: 'Dysphagia', name: 'Dysphagia-SwallowingTest' }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function getClient() {
    const c = window.supabaseClient;
    if (!c) throw new Error('Supabase client ยังไม่พร้อม');
    return c;
  }

  function clean(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    return v;
  }

  function asObject(v, fallback = {}) {
    if (!v) return fallback;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return fallback; }
  }

  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    try { return JSON.parse(v); } catch (_) { return String(v).split(',').map(s => s.trim()).filter(Boolean); }
  }

  function thaiDate(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
  }

  function age(v) {
    if (!v) return '';
    const d = new Date(v), now = new Date();
    if (Number.isNaN(d.getTime())) return '';
    let n = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) n--;
    return n >= 0 ? n : '';
  }

  function time(v) {
    if (!v) return '';
    const d = new Date(v);
    if (!Number.isNaN(d.getTime()) && String(v).includes('T')) {
      return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    const m = String(v).match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(v);
  }

  function address(p) {
    return p.FullAddress || [
      p.HouseNumber && `บ้านเลขที่ ${p.HouseNumber}`,
      p.Moo && `หมู่ ${p.Moo}`,
      p.Tambon && `ต.${p.Tambon}`,
      p.Amphoe && `อ.${p.Amphoe}`,
      p.Province && `จ.${p.Province}`,
      p.PostalCode
    ].filter(Boolean).join(' ');
  }

  function getTreatmentRightsDisplay(p) {
    if (!p) return '';
    if (p.TreatmentRights === 'อื่นๆ') {
      return p.TreatmentRightsOther || p.TreatmentRights || '';
    }
    return p.TreatmentRights || p.TreatmentRightsOther || '';
  }

  async function one(table, key, value) {
    const { data, error } = await getClient().from(table).select('*').eq(key, String(value).trim()).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function patient(id) {
    return one('Patients', 'PatientID', id);
  }

  function baseData(p, r) {
    const d = { ...(p || {}), ...(r || {}) };
    d.PatientName = p?.PatientName || d.PatientName || '';
    d['ชื่อผู้ป่วย'] = p?.PatientName || '';
    d.PatientNameFull = p?.PatientName || '';
    d.Age = d.Age || age(p?.DateOfBirth);
    d.DateOfBirth = thaiDate(p?.DateOfBirth);
    d.AdmitDate = thaiDate(p?.AdmitDate);
    d.DischargeDate = thaiDate(p?.DischargeDate);
    d.DueDate = thaiDate(p?.DueDate);
    d.Address = address(p || {});
    d.VisitDate = thaiDate(r?.VisitDate || r?.AssessmentDate || r?.ConsentDate || r?.Timestamp);
    d.AssessmentDate = thaiDate(r?.AssessmentDate);
    d.ConsentDate = thaiDate(r?.ConsentDate);
    d.StartTime = time(r?.StartTime);
    d.EndTime = time(r?.EndTime);
    d['Caregiver Relationship'] = p?.CaregiverRelationship || '';
    d.TreatmentRightsDisplay = getTreatmentRightsDisplay(p);
    return d;
  }

  function checkbox(d, key, condition) {
    d[key] = !!condition;
  }

  function tick(cond) {
    return cond ? '☑' : '☐';
  }

  // --- 1. IMC Cover ---
  function enrichIMCCover(d, p) {
    ['Stroke', 'TBI', 'Fx.HIP', 'SCI'].forEach(dx => {
      const cleanDx = dx.replace(/\./g, '');
      d[`${cleanDx}_check`] = (p.IMCDx === dx);
    });
    ['Hemorrhage', 'Ischemic'].forEach(type => {
      d[`Stroke_${type}_check`] = (p.StrokeType === type);
    });
    d['Caregiver Relationship'] = p.CaregiverRelationship || '';
    return d;
  }

  // --- 2. Consent ---
  function enrichConsent(d) {
    d['ชื่อผู้ให้ความยินยอม'] = d.ConsenterName || '';
    d['อายุ'] = d.ConsenterAge || '';
    d['เลขปชช.ผู้ให้ความยินยอม'] = d.ConsenterNationalID || '';
    d['ที่อยู่'] = d.Address || '';
    d['วันที่'] = thaiDate(d.ConsentDate);
    d['ชื่อ-สกุลผู้ยินยอม'] = d.ConsenterName || '';
    d['ชื่อ-สกุลพยาน'] = d.WitnessName || '';
    d['check_ผู้ป่วย'] = (d.ConsenterType === 'Patient' || d.ConsenterType === 'ผู้ป่วย') ? '☑' : '☐';
    d['check_ผู้ดูแล'] = (d.ConsenterType === 'Caregiver' || d.ConsenterType === 'ผู้ดูแล') ? '☑' : '☐';
    return d;
  }

  // --- 3. BI Assessment ---
  function enrichBI(d) {
    d.BarthelIndex = d.BarthelIndex !== undefined ? d.BarthelIndex : (d.TotalScore !== undefined ? d.TotalScore : '');
    for (let i = 1; i <= 10; i++) {
      const score = Number(d[`q${i}`]);
      for (let j = 0; j <= 3; j++) {
        checkbox(d, `q${i}_opt${j}_check`, j === score);
      }
    }
    const impairments = ['swallowing', 'communicate', 'mobility', 'cognitive', 'bowel'];
    impairments.forEach(k => {
      checkbox(d, `impairment_${k}_check`, d[`impairment_${k}`] === true || d[`impairment_${k}`] === 'true');
    });
    const fxItems = ['bathroom', 'bed', 'movement', 'stairs'];
    fxItems.forEach(k => {
      checkbox(d, `fx_${k}_check`, d[`fx_${k}`] === true || d[`fx_${k}`] === 'true');
    });
    d.Date = thaiDate(d.AssessmentDate);
    return d;
  }

  // --- 4. OPD Card ---
  function enrichOPD(d) {
    const dx = String(d.Diagnosis || '');
    ['Stroke', 'Fx.HIP', 'SCI', 'TBI'].forEach(x => {
      checkbox(d, `Dx_${x.replace('.', '')}`, dx.includes(x));
    });

    const fx = String(d.FxHIP_Status || '');
    checkbox(d, 'Fx_NWB', fx === 'NWB');
    checkbox(d, 'Fx_PWB', fx === 'PWB');
    checkbox(d, 'Fx_FWB', fx === 'FWB');
    checkbox(d, 'Fx_WC', fx === 'W/C' || fx === 'WC');
    checkbox(d, 'Fx_BedRest', fx === 'Bed rest');
    d.Fx_PWB_Percent = fx === 'PWB' ? (d.FxHIP_PWB_Percent || '') : '';

    const loc = String(d.LevelOfConsciousness || '');
    checkbox(d, 'LOC_Alert_Check', loc.includes('Alert'));
    checkbox(d, 'LOC_Drowsiness_Check', loc.includes('Drowsiness'));
    checkbox(d, 'LOC_Confuse_Check', loc.includes('Confuse'));
    checkbox(d, 'LOC_Stupor_Check', loc.includes('Stupor'));
    checkbox(d, 'LOC_SemiComa_Check', loc.includes('Semi-coma') || loc.includes('SemiComa'));
    checkbox(d, 'LOC_Coma_Check', loc.includes('Coma'));

    const comm = String(d.Communication || ''), aph = String(d.CommunicationAphasiaType || '');
    checkbox(d, 'Comm_Normal_Check', comm === 'Normal');
    checkbox(d, 'Comm_Dysarthria_Check', comm === 'Dysarthria');
    checkbox(d, 'Comm_Aphasia_Check', comm === 'Aphasia');
    checkbox(d, 'Comm_Aphasia_Global_Check', comm === 'Aphasia' && aph === 'Global');
    checkbox(d, 'Comm_Aphasia_Motor_Check', comm === 'Aphasia' && aph === 'Motor');
    checkbox(d, 'Comm_Aphasia_Sensory_Check', comm === 'Aphasia' && aph === 'Sensory');

    const eq = String(d.Equipment || '');
    checkbox(d, 'Equip_No_Check', eq.includes('No'));
    checkbox(d, 'Equip_FoleysCath_Check', eq.includes("Foley's cath") || eq.includes("Foleys"));
    checkbox(d, 'Equip_NGTube_Check', eq.includes('NG tube'));
    checkbox(d, 'Equip_TracheostomyTube_Check', eq.includes('Tracheostomy'));
    checkbox(d, 'Equip_Other_Check', eq.includes('Other'));
    d.Equip_Other_Details = d.Equip_Other_Check ? (d.EquipmentOther || '') : '';

    // Special Assessments
    const sa = String(d.SpecialAssessment || '');
    d.SA_MRI_Check = sa.includes('MRI') ? '☑' : '☐';
    d.SA_CT_Check = sa.includes('CT-scan') || sa.includes('CT') ? '☑' : '☐';
    d.SA_Xray_Check = sa.includes('X-ray') ? '☑' : '☐';
    d.SA_ASIA_Check = sa.includes('ASIA') ? '☑' : '☐';
    d.SA_Details = d.SpecialAssessment_Details || ' ';
    d.SA_ASIA_NLI = d.SpecialAssessment_ASIA_NLI || ' ';
    d.SA_ASIA_AIS = d.SpecialAssessment_ASIA_AIS || ' ';
    d.SA_ASIA_Diagnosis = d.SpecialAssessment_ASIA_Diagnosis || ' ';

    // Gross Motor Function
    const gm = asObject(d.GrossMotorFunction);
    const gmFunctions = ['MoveUp', 'MoveDown', 'MoveRight', 'MoveLeft', 'SubSideLying', 'SideLyingSit', 'SitStand'];
    const gmGrades = ['Ind', 'Con', 'Min', 'Mod', 'Max', 'Dep'];
    const gmGradeMap = { 'Independent': 'Ind', 'Continuous': 'Con', 'Minimal': 'Min', 'Moderate': 'Mod', 'Maximum': 'Max', 'Dependent': 'Dep' };
    gmFunctions.forEach(fn => {
      const selected = gm[fn] || '';
      gmGrades.forEach(g => {
        checkbox(d, `GM_${fn}_${g}`, Object.keys(gmGradeMap).some(k => gmGradeMap[k] === g && selected === k));
      });
    });

    // Hand Function
    checkbox(d, 'HF_Right_Check', d.HF_Side_Rt === true || d.HF_Side_Rt === 'true' || d.HF_Side_Rt === 'on');
    checkbox(d, 'HF_Left_Check', d.HF_Side_Lt === true || d.HF_Side_Lt === 'true' || d.HF_Side_Lt === 'on');
    const hf = asObject(d.HandFunction);
    const hfFunctions = ['Reaching', 'GraspRelease', 'PassObj', 'ThumbOpp', 'PinchGrasp'];
    const hfGrades = ['Zero', 'Poor', 'Fair', 'Good', 'Nor'];
    const hfGradeMap = { 'Zero': 'Zero', 'Poor': 'Poor', 'Fair': 'Fair', 'Good': 'Good', 'Normal': 'Nor' };
    hfFunctions.forEach(fn => {
      const selected = hf[fn] || '';
      hfGrades.forEach(g => {
        checkbox(d, `HF_${fn}_${g}`, Object.keys(hfGradeMap).some(k => hfGradeMap[k] === g && selected === k));
      });
    });

    // Quality Movement
    const q = asObject(d.QualityMovement);
    d.QM_UE_Rt = q.UE?.Rt || ''; d.QM_UE_Lt = q.UE?.Lt || '';
    d.QM_LE_Rt = q.LE?.Rt || ''; d.QM_LE_Lt = q.LE?.Lt || '';

    // Joint / Sensation
    const je = asObject(d.JointSensation_UE_Details);
    const jl = asObject(d.JointSensation_LE_Details);
    d.UE_Rt_Joint = je['Rt. Joint'] || '-'; d.UE_Rt_Sensation = je['Rt. Sensation'] || '-';
    d.UE_Lt_Joint = je['Lt. Joint'] || '-'; d.UE_Lt_Sensation = je['Lt. Sensation'] || '-';
    d.LE_Rt_Joint = jl['Rt. Joint'] || '-'; d.LE_Rt_Sensation = jl['Rt. Sensation'] || '-';
    d.LE_Lt_Joint = jl['Lt. Joint'] || '-'; d.LE_Lt_Sensation = jl['Lt. Sensation'] || '-';

    // Balance Grid
    const bal = asObject(d.BalanceGrid || d.Balance);
    const balAssessments = ['SitStatic', 'SitDynamic', 'StandStatic', 'StandDynamic'];
    const balGrades = ['Zero', 'Poor', 'Fair', 'Good', 'Nor'];
    const balGradeMap = { 'Zero': 'Zero', 'Poor': 'Poor', 'Fair': 'Fair', 'Good': 'Good', 'Normal': 'Nor' };
    balAssessments.forEach(a => {
      const selected = bal[a] || '';
      balGrades.forEach(g => {
        checkbox(d, `Bal_${a}_${g}`, Object.keys(balGradeMap).some(k => balGradeMap[k] === g && selected === k));
      });
    });
    d.Balance_Sitting = bal.Sitting || bal.SitStatic || '';
    d.Balance_Standing = bal.Standing || bal.StandStatic || '';

    // Problem List
    const pl = String(d.ProblemList || '');
    [['Weakness', 'PL_Weakness'], ['Poor balance', 'PL_PoorBalance'], ['Poor ambulation', 'PL_PoorAmbulation'], ['Abnormal m. length/tone', 'PL_AbnormalLengthTone'], ['Risk for complication', 'PL_RiskOfComplication']].forEach(([s, k]) => {
      checkbox(d, k, pl.includes(s));
    });
    const plItems = ['Weakness', 'Poor balance', 'Poor ambulation', 'Abnormal m. length/tone', 'Risk for complication'];
    const other = pl.split(',').map(s => s.trim()).find(s => s && !plItems.includes(s));
    d.PL_Other_Check = !!other;
    d.PL_Other_Details = other || '';

    // Treatment
    const t = asObject(d.Treatment_Details);
    ['QualityMove', 'BedMobility', 'Balance', 'Gait', 'Other'].forEach(k => {
      const x = t[k];
      d[`Treat_${k}_Check`] = !!x && Object.keys(x).length > 0;
      d[`Treat_${k}_Time`] = x?.time || '';
      d[`Treat_${k}_Details`] = Array.isArray(x?.details) ? x.details.join(', ') : (x?.details || '');
    });
    const a = t.Ambulation || {};
    checkbox(d, 'Treat_Ambulation_Check', Object.keys(a).length > 0);
    ['NWB', 'PWB', 'FWB', 'WC'].forEach(s => checkbox(d, `Amb_${s}_Check`, a.Status === s));
    d.Amb_PWB_Percent = a.PWB_Percent || '';

    d.Lenght = d.Length || d.Lenght || '';
    return d;
  }

  // --- 5. SOAP Note ---
  async function enrichSOAP(d) {
    const dx = asArray(d.DiagnosisJSON);
    ['Stroke', 'Fx.HIP', 'SCI', 'TBI'].forEach(x => {
      checkbox(d, `Dx_${x.replace('.', '')}`, dx.includes(x));
    });

    const o = asObject(d.ObjectiveJSON);
    const q = o.QualityMovement || {};
    d.QM_UE_Rt = q.UE?.Rt || ''; d.QM_UE_Lt = q.UE?.Lt || '';
    d.QM_LE_Rt = q.LE?.Rt || ''; d.QM_LE_Lt = q.LE?.Lt || '';
    d.Objective_QualityMovement_Check = !!o.QualityMovement_Check;
    d.Objective_Other_Check = !!o.Other_Check;
    d.Objective_Other_Details = o.Other_Details || '';

    // Fetch BI Assessment for this patient & visit count if available
    try {
      if (d.PatientID && d.VisitCount) {
        const { data: biData } = await getClient()
          .from('BIAssessments')
          .select('*')
          .eq('PatientID', d.PatientID)
          .eq('VisitCount', d.VisitCount)
          .maybeSingle();
        if (biData) {
          d.BarthelIndex = biData.TotalScore;
          for (let i = 1; i <= 10; i++) {
            const score = Number(biData[`q${i}`]);
            for (let j = 0; j <= 3; j++) {
              checkbox(d, `q${i}_opt${j}_check`, j === score);
            }
          }
          ['swallowing', 'communicate', 'mobility', 'cognitive', 'bowel'].forEach(imp => {
            checkbox(d, `impairment_${imp}_check`, biData[`impairment_${imp}`]);
          });
          ['bathroom', 'bed', 'movement', 'stairs'].forEach(item => {
            checkbox(d, `fx_${item}_check`, biData[`fx_${item}`]);
          });
        }
      }
    } catch (_) {}

    const t = asObject(d.TreatmentJSON);
    ['QualityMove', 'BedMobility', 'Balance', 'Gait', 'Other'].forEach(k => {
      const x = t[k];
      d[`Treat_${k}_Check`] = !!x && Object.keys(x).length > 0;
      d[`Treat_${k}_Time`] = x?.time || '';
      d[`Treat_${k}_Details`] = Array.isArray(x?.details) ? x.details.join(', ') : (x?.details || '');
    });
    const a = t.Ambulation || {};
    checkbox(d, 'Treat_Ambulation_Check', Object.keys(a).length > 0);
    ['NWB', 'PWB', 'FWB', 'WC'].forEach(s => checkbox(d, `Amb_${s}_Check`, a.Status === s));
    d.Amb_PWB_Percent = a.PWB_Percent || '';

    const plan = String(d.Plan || '');
    d.Plan_FU = plan.includes('F/U Program PT ต่อเนื่อง') || plan.includes('F/U Program PT ตามความเหมาะสม');
    d.Plan_OFF = plan.includes('OFF PT Program');
    d.Plan_Refer = plan.includes('ส่งต่อ รพ. ต้นสังกัด') || plan.includes('ส่งต่อ รพ. ตามความเหมาะสม') || plan.includes('ส่งต่อ รพ. ดูแลต่อเนื่อง');
    const predefinedPlans = ['F/U Program PT ต่อเนื่อง', 'F/U Program PT ตามความเหมาะสม', 'OFF PT Program', 'ส่งต่อ รพ. ต้นสังกัด', 'ส่งต่อ รพ. ตามความเหมาะสม', 'ส่งต่อ รพ. ดูแลต่อเนื่อง'];
    const customPlans = plan.split(',').map(s => s.trim()).filter(s => s && !predefinedPlans.includes(s));
    d.Plan_Other_Check = customPlans.length > 0 ? '☑' : '☐';
    d.Plan_Other_Details = customPlans.length > 0 ? customPlans.join(', ') : ' ';
    return d;
  }

  // --- 6. TMSE Assessment ---
  function enrichTMSE(d) {
    const binaryKeys = [
      'q_day', 'q_date', 'q_month', 'q_time', 'q_place', 'q_job',
      'q_reg_1', 'q_reg_2', 'q_reg_3',
      'q_tree', 'q_car', 'q_hand',
      'q_fri', 'q_thu', 'q_wed', 'q_tue', 'q_mon',
      'q_calc1', 'q_calc2', 'q_calc3',
      'q_watch', 'q_shirt', 'q_repeat', 'q_command1', 'q_command2', 'q_command3', 'q_read',
      'q_similar1', 'q_similar2'
    ];

    binaryKeys.forEach(key => {
      const val = Number(d[key]);
      if (val === 1) {
        d[`${key}_c`] = '☑';
        d[`${key}_w`] = '☐';
      } else {
        d[`${key}_c`] = '☐';
        d[`${key}_w`] = '☑';
      }
    });

    const drawVal = Number(d.q_draw || 0);
    d.q_draw_2_c = (drawVal === 2) ? '☑' : '☐';
    d.q_draw_0_c = (drawVal === 0) ? '☑' : '☐';

    const sumFields = (keys) => keys.reduce((sum, k) => sum + (Number(d[k]) || 0), 0);
    d.score_orientation = sumFields(['q_day', 'q_date', 'q_month', 'q_time', 'q_place', 'q_job']);
    d.score_registration = sumFields(['q_reg_1', 'q_reg_2', 'q_reg_3']);
    d.score_attention = sumFields(['q_fri', 'q_thu', 'q_wed', 'q_tue', 'q_mon']);
    d.score_calculation = sumFields(['q_calc1', 'q_calc2', 'q_calc3']);
    d.score_recall = sumFields(['q_tree', 'q_car', 'q_hand']);
    d.score_language = sumFields(['q_watch', 'q_shirt', 'q_repeat', 'q_command1', 'q_command2', 'q_command3', 'q_read'])
      + (Number(d.q_draw) || 0)
      + (Number(d.q_similar1) === 1 ? 0.5 : 0)
      + (Number(d.q_similar2) === 1 ? 0.5 : 0);

    const totalScoreNum = parseFloat(d.total_score);
    const scoreForResult = isNaN(totalScoreNum) ? 0 : totalScoreNum;
    d.result_dementia_c = (scoreForResult < 23) ? '☑' : '☐';
    d.result_impairment_c = (scoreForResult >= 23 && scoreForResult < 26) ? '☑' : '☐';
    d.result_normal_c = (scoreForResult >= 26) ? '☑' : '☐';
    return d;
  }

  // --- 7. MHQ Assessment ---
  function enrichMHQ(d) {
    // 2Q
    d.q2_1_yes_c = tick(d.q2_1 === 'YES');
    d.q2_1_no_c = tick(d.q2_1 === 'NO');
    d.q2_2_yes_c = tick(d.q2_2 === 'YES');
    d.q2_2_no_c = tick(d.q2_2 === 'NO');
    const has2qYes = (d.q2_1 === 'YES' || d.q2_2 === 'YES');
    d.result_2q_no_c = tick(!has2qYes);
    d.result_2q_yes_c = tick(has2qYes);

    // 9Q
    const q9Keys = ['q9_1', 'q9_2', 'q9_3', 'q9_4', 'q9_5', 'q9_6', 'q9_7', 'q9_8', 'q9_9'];
    q9Keys.forEach(key => {
      const val = Number(d[key]);
      for (let level = 0; level <= 3; level++) {
        d[`${key}_${level}_c`] = tick(val === level);
      }
    });
    const score9q = q9Keys.reduce((sum, k) => sum + (Number(d[k]) || 0), 0);
    d.score_9q = score9q;
    d.result_9q_lt7_c = tick(score9q < 7);
    d.result_9q_7to12_c = tick(score9q >= 7 && score9q <= 12);
    d.result_9q_13to18_c = tick(score9q >= 13 && score9q <= 18);
    d.result_9q_gte19_c = tick(score9q >= 19);
    d.result_9q_ge7_c = tick(score9q >= 7);

    // 8Q
    const q8Weights = { q8_1: 1, q8_2: 2, q8_3: 6, q8_3b: 8, q8_4: 8, q8_5: 9, q8_6: 4, q8_7: 10, q8_8: 4 };
    const q8Keys = ['q8_1', 'q8_2', 'q8_3', 'q8_4', 'q8_5', 'q8_6', 'q8_7', 'q8_8'];
    q8Keys.forEach(key => {
      const isYes = Number(d[key]) === 1;
      d[`${key}_no_c`] = tick(!isYes);
      d[`${key}_yes_c`] = tick(isYes);
    });
    const q3bAnswered = Number(d.q8_3) === 1;
    const q3bCannotControl = q3bAnswered && Number(d.q8_3b) === 1;
    d.q8_3b_yes_c = tick(q3bAnswered && !q3bCannotControl);
    d.q8_3b_no_c = tick(q3bCannotControl);

    let score8q = 0;
    q8Keys.forEach(key => { if (Number(d[key]) === 1) score8q += q8Weights[key]; });
    if (q3bCannotControl) score8q += q8Weights.q8_3b;
    d.score_8q = score8q;

    d.result_8q_0_c = tick(score8q === 0);
    d.result_8q_1to8_c = tick(score8q >= 1 && score8q <= 8);
    d.result_8q_9to16_c = tick(score8q >= 9 && score8q <= 16);
    d.result_8q_gte17_c = tick(score8q >= 17);
    d.result_8q_urgent_c = tick(score8q >= 17);
    d.result_8q_ge17_c = tick(score8q >= 17);
    return d;
  }

  // --- 8. Dysphagia Swallowing Test ---
  function enrichDysphagia(d) {
    // Group 1
    const g1Keys = ['q1_1', 'q1_2', 'q1_3'];
    g1Keys.forEach(key => {
      d[`${key}_yes_c`] = tick(d[key] === 'YES');
      d[`${key}_no_c`] = tick(d[key] === 'NO');
    });
    const g1HasNo = g1Keys.some(k => dataKeyVal(d[k]) === 'NO');
    const g1AllYes = g1Keys.every(k => dataKeyVal(d[k]) === 'YES');
    d.result_g1_fail_c = tick(g1HasNo);
    d.result_g1_pass_c = tick(g1AllYes);

    // Group 2
    const g2Keys = ['q2_1', 'q2_2', 'q2_3', 'q2_4', 'q2_5', 'q2_6', 'q2_7'];
    g2Keys.forEach(key => {
      d[`${key}_yes_c`] = tick(dataKeyVal(d[key]) === 'YES');
      d[`${key}_no_c`] = tick(dataKeyVal(d[key]) === 'NO');
    });

    const symSteps = ['2_3', '2_4', '2_5', '2_6', '2_7'];
    symSteps.forEach(step => {
      ['cough', 'choke', 'tachypnea', 'wetvoice'].forEach(sym => {
        const field = `sym${step}_${sym}`;
        d[`${field}_c`] = tick(Number(d[field]) === 1);
      });
    });

    const g2Keys3to7 = ['q2_3', 'q2_4', 'q2_5', 'q2_6', 'q2_7'];
    const g2HasNo3to7 = g2Keys3to7.some(key => dataKeyVal(d[key]) === 'NO');
    d.result_g2_pathway_c = tick(g2HasNo3to7);
    d.result_g2_pmr_c = tick(g2HasNo3to7);
    return d;
  }

  function dataKeyVal(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  }

  function cleanForBridge(value, seen = new WeakSet()) {
    if (value === undefined || typeof value === 'function') return null;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if (seen.has(value)) return null;
      seen.add(value);
      if (Array.isArray(value)) return value.map(v => cleanForBridge(v, seen));
      const out = {};
      Object.keys(value).forEach(k => out[k] = cleanForBridge(value[k], seen));
      return out;
    }
    return String(value);
  }

  async function buildData(type, recordId) {
    const normType = String(type).toLowerCase();
    const cfg = TYPE_CONFIG[normType];
    if (!cfg) throw new Error(`ไม่รู้จักชนิดเอกสาร: ${type}`);

    let d;
    if (normType === 'imccover') {
      const p = await patient(recordId);
      if (!p) throw new Error(`ไม่พบข้อมูลผู้ป่วย ID: ${recordId}`);
      d = baseData(p, {});
      d = enrichIMCCover(d, p);
    } else {
      const r = await one(cfg.table, cfg.id, recordId);
      if (!r) throw new Error(`ไม่พบข้อมูล ${cfg.id}: ${recordId}`);
      const p = await patient(r.PatientID);
      if (!p) throw new Error(`ไม่พบข้อมูลผู้ป่วย ID: ${r.PatientID}`);
      d = baseData(p, r);

      if (normType === 'opd') d = enrichOPD(d);
      else if (normType === 'soap') d = await enrichSOAP(d);
      else if (normType === 'bi') d = enrichBI(d);
      else if (normType === 'consent') d = enrichConsent(d);
      else if (normType === 'tmse') d = enrichTMSE(d);
      else if (normType === 'mhq') d = enrichMHQ(d);
      else if (normType === 'dysphagia') d = enrichDysphagia(d);
    }

    // Expose normalized images and signatures
    const pPhoto = d.PatientPhotoURL || d.PatientPhotoUrl || '';
    d.PatientPhoto = pPhoto;
    d.PatientPhotoUrl = pPhoto;
    d.PatientPhotoURL = pPhoto;

    d.BodyChartDrawingUrl = d.BodyChartDrawingUrl || d.BodyChartUrl || '';
    d.TherapistSignatureUrl = d.TherapistSignatureUrl || d.TherapistSignature || '';
    d.PatientSignatureUrl = d.PatientSignatureUrl || d.PatientSignature || '';
    d.ConsenterSignatureUrl = d.ConsenterSignatureUrl || d.ConsenterSignature || '';
    d.WitnessSignatureUrl = d.WitnessSignatureUrl || d.WitnessSignature || '';

    // Consent template aliases
    d['ลายมือชื่อ'] = d.ConsenterSignatureUrl;
    d['ลายมือชื่อพยาน'] = d.WitnessSignatureUrl;

    return cleanForBridge(d);
  }

  async function callGAS(templateId, data, name) {
    if (typeof window.generatePdfAsBase64 === 'function') {
      return window.generatePdfAsBase64(templateId, data, name);
    }
    if (typeof window.gasBridgeCall === 'function') {
      return window.gasBridgeCall('generatePdfAsBase64', [templateId, data, name]);
    }
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      if (typeof window.generatePdfAsBase64 === 'function') {
        return window.generatePdfAsBase64(templateId, data, name);
      }
      if (typeof window.gasBridgeCall === 'function') {
        return window.gasBridgeCall('generatePdfAsBase64', [templateId, data, name]);
      }
    }
    throw new Error('ไม่พบ GAS Bridge สำหรับสร้าง PDF');
  }

  function downloadPdfBlob(base64, fileName) {
    if (!base64) return;
    try {
      const bytes = atob(base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.warn('[IMCDocsAdapter] direct download blob failed:', e);
    }
  }

  async function generate(type, recordId, autoDownload = false) {
    try {
      const normType = String(type).toLowerCase();
      const cfg = TYPE_CONFIG[normType];
      if (!cfg) throw new Error(`ไม่รู้จักชนิดเอกสาร: ${type}`);

      const data = await buildData(normType, recordId);
      const templateId = TEMPLATES[cfg.template];
      console.info('[IMC PRINT] Starting Google Doc PDF generation: template=', cfg.template, 'id=', templateId, 'recordId=', recordId);

      const result = await callGAS(templateId, data, cfg.name);
      if (!result || result.status !== 'success') {
        throw new Error(result?.message || 'GAS ไม่สามารถสร้าง PDF ได้');
      }

      if (autoDownload && result.base64) {
        downloadPdfBlob(result.base64, result.fileName || `${cfg.name}.pdf`);
      }

      return result;
    } catch (e) {
      console.error('[IMC PRINT Error]', type, recordId, e);
      throw e;
    }
  }

  function expose(fnName, type) {
    window[fnName] = async id => {
      const res = await generate(type, id, true);
      return res;
    };
  }

  expose('generateIMCCoverPdf', 'imccover');
  expose('generateConsentPdf', 'consent');
  expose('generateBIPdf', 'bi');
  expose('generateOpdPdf', 'opd');
  expose('generateSOAPPdf', 'soap');
  expose('generateTMSEPdf', 'tmse');
  expose('generateMHQPdf', 'mhq');
  expose('generateDysphagiaPdf', 'dysphagia');

  window.IMCDocsTemplateAdapter = {
    templates: TEMPLATES,
    typeConfig: TYPE_CONFIG,
    buildData,
    generate,
    generateIMCCoverPdf: id => generate('imccover', id),
    generateConsentPdf: id => generate('consent', id),
    generateBIPdf: id => generate('bi', id),
    generateOpdPdf: id => generate('opd', id),
    generateSOAPPdf: id => generate('soap', id),
    generateTMSEPdf: id => generate('tmse', id),
    generateMHQPdf: id => generate('mhq', id),
    generateDysphagiaPdf: id => generate('dysphagia', id)
  };

  console.info('[IMCDocsAdapter] Google Docs Template Adapter v2 initialized successfully.');
})();
