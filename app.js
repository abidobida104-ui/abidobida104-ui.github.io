/* مُنتِج MUNTIJ — التسمين وسلوك الصفحات العامة. بيانات التسمين محلية ولا تُرسل إلى خادم. */
'use strict';

const DEFAULT_BROILER_INPUTS = Object.freeze({
  birdCapacity: 10080,
  chickPrice: 120,
  feedIntake: 3.75,
  feedPrice: 75,
  veterinaryPerBird: 30,
  utilitiesPerBird: 11,
  laborPerBird: 16,
  maintenancePerBird: 8,
  mortalityRate: 6,
  liveWeight: 2.2,
  sellingPrice: 370,
  cyclesPerYear: 5,
  projectionCycles: 6
});
const BROILER_INPUT_IDS = Object.keys(DEFAULT_BROILER_INPUTS);
const BROILER_STORAGE_KEY = 'muntij.broilerInputs.v2';
const OLD_BROILER_STORAGE_KEY = 'muntij.modelInputs.v1';
const LEGACY_SCENARIO_KEY = 'muntij.localDemoScenario.v1';
const INTEGER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const DECIMAL_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const BROILER_PRESETS = {
  baseline: { label: 'خط الأساس التوضيحي', sellingPrice: 370, mortalityRate: 6, liveWeight: 2.2 },
  optimistic: { label: 'تفاؤلي — افتراضي', sellingPrice: 430, mortalityRate: 2.5, liveWeight: 2.2 },
  conservative: { label: 'متحفظ — افتراضي', sellingPrice: 350, mortalityRate: 5, liveWeight: 2.1 },
  weak: { label: 'سوق ضعيف — افتراضي', sellingPrice: 290, mortalityRate: 7, liveWeight: 2.0 },
  loss: { label: 'متعثر — افتراضي', sellingPrice: 240, mortalityRate: 8, liveWeight: 2.0 }
};

function formatNumber(value, decimals = false) {
  if (!Number.isFinite(value)) return 'غير متاح';
  return (decimals ? DECIMAL_FORMATTER : INTEGER_FORMATTER).format(value);
}
function formatDinar(value) {
  if (!Number.isFinite(value)) return 'غير متاح';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  return `\u2066${sign}${INTEGER_FORMATTER.format(Math.abs(rounded))}\u2069 دج`;
}
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
function readStorage(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch { return null; }
}
function writeStorage(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
function normalizeBroilerInputs(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const value = { ...DEFAULT_BROILER_INPUTS };
  for (const key of BROILER_INPUT_IDS) {
    if (Object.hasOwn(candidate, key)) {
      const next = Number(candidate[key]);
      if (!Number.isFinite(next)) return null;
      value[key] = next;
    }
  }
  if (!(value.birdCapacity > 0) || !(value.liveWeight > 0)) return null;
  if (value.mortalityRate < 0 || value.mortalityRate > 99.9) return null;
  if (value.cyclesPerYear < 1 || value.cyclesPerYear > 20 || !Number.isInteger(value.cyclesPerYear)) return null;
  if (![1, 2, 3, 6].includes(value.projectionCycles)) return null;
  for (const key of BROILER_INPUT_IDS.filter((id) => !['birdCapacity', 'liveWeight', 'mortalityRate', 'cyclesPerYear', 'projectionCycles'].includes(id))) {
    if (value[key] < 0) return null;
  }
  return value;
}
function loadBroilerInputs() {
  const saved = normalizeBroilerInputs(readStorage(BROILER_STORAGE_KEY));
  if (saved) return { values: saved, hasSaved: true };
  const old = readStorage(OLD_BROILER_STORAGE_KEY);
  if (old && typeof old === 'object') {
    const migrated = { ...DEFAULT_BROILER_INPUTS };
    for (const key of BROILER_INPUT_IDS) {
      if (key !== 'birdCapacity' && Object.hasOwn(old, key)) migrated[key] = old[key];
    }
    const normalized = normalizeBroilerInputs(migrated);
    if (normalized) {
      const stored = writeStorage(BROILER_STORAGE_KEY, normalized);
      return { values: normalized, hasSaved: stored };
    }
  }
  const legacy = readStorage(LEGACY_SCENARIO_KEY);
  if (legacy && typeof legacy === 'object') {
    const normalized = normalizeBroilerInputs({ ...DEFAULT_BROILER_INPUTS, ...legacy });
    if (normalized) return { values: normalized, hasSaved: true };
  }
  return { values: { ...DEFAULT_BROILER_INPUTS }, hasSaved: false };
}
const initialBroilerState = loadBroilerInputs();
let broilerInputs = { ...initialBroilerState.values };
let hasSavedBroilerInputs = initialBroilerState.hasSaved;

function persistBroilerInputs(values = broilerInputs) {
  const stored = writeStorage(BROILER_STORAGE_KEY, values);
  if (stored) {
    hasSavedBroilerInputs = true;
    try {
      window.localStorage.removeItem(OLD_BROILER_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_SCENARIO_KEY);
    } catch { /* تعذر الوصول إلى التخزين؛ تبقى القيم في الذاكرة. */ }
  }
  return stored;
}
function calculateBroiler(input) {
  if (!input) return null;
  const survivors = input.birdCapacity * (1 - input.mortalityRate / 100);
  const outputKg = survivors * input.liveWeight;
  const feedKg = input.birdCapacity * input.feedIntake;
  const chickCost = input.birdCapacity * input.chickPrice;
  const feedCost = feedKg * input.feedPrice;
  const veterinaryCost = input.birdCapacity * input.veterinaryPerBird;
  const utilitiesCost = input.birdCapacity * input.utilitiesPerBird;
  const laborCost = input.birdCapacity * input.laborPerBird;
  const maintenanceCost = input.birdCapacity * input.maintenancePerBird;
  const operatingCost = chickCost + feedCost + veterinaryCost + utilitiesCost + laborCost + maintenanceCost;
  const revenue = outputKg * input.sellingPrice;
  const operatingCash = revenue - operatingCost;
  const priceBreakEven = outputKg > 0 ? operatingCost / outputKg : NaN;
  const contribution = revenue > 0 ? operatingCash / revenue * 100 : NaN;
  return {
    input, survivors, outputKg, feedKg, chickCost, feedCost, veterinaryCost,
    utilitiesCost, laborCost, maintenanceCost, operatingCost, revenue,
    operatingCash, priceBreakEven, contribution,
    annualOperatingCash: operatingCash * input.cyclesPerYear,
    fcr: outputKg > 0 ? feedKg / outputKg : NaN
  };
}
function broilerOutputText(field, model) {
  const n = (value, decimals = false) => Number.isFinite(value) ? formatNumber(value, decimals) : 'غير متاح';
  const d = (value) => Number.isFinite(value) ? formatDinar(value) : 'غير متاح';
  const pct = (value) => Number.isFinite(value) ? `${formatNumber(value, true)}%` : 'غير متاح';
  const map = {
    capacity: `${n(model.input.birdCapacity)} طائر`,
    survivors: `${n(model.survivors)} طائر`,
    outputKg: `${n(model.outputKg, true)} كغ`,
    revenue: d(model.revenue),
    feedKg: `${n(model.feedKg, true)} كغ`,
    feedCost: d(model.feedCost),
    operatingCost: d(model.operatingCost),
    operatingCash: d(model.operatingCash),
    annualOperatingCash: d(model.annualOperatingCash),
    breakEvenPrice: `${n(model.priceBreakEven, true)} دج/كغ`,
    fcr: `${n(model.fcr, true)} كغ علف/كغ لحم`,
    operatingMargin: pct(model.contribution),
    mortality: `${n(model.input.mortalityRate, true)}%`,
    sellingPrice: `${n(model.input.sellingPrice)} دج/كغ`
  };
  return map[field] ?? '—';
}
function updateBroilerOutputs(model) {
  if (!model) return;
  document.querySelectorAll('[data-broiler-output]').forEach((element) => {
    element.textContent = broilerOutputText(element.dataset.broilerOutput, model);
  });
  const legacyMap = {
    modelOutputKg: `${formatNumber(model.outputKg, true)} كغ`,
    modelRevenueOutput: formatDinar(model.revenue),
    modelDirectCost: formatDinar(model.operatingCost),
    modelCashFlow: formatDinar(model.operatingCash),
    modelAccountingProfit: formatDinar(model.operatingCash),
    modelVariableCostKg: `${formatNumber(model.priceBreakEven, true)} دج/كغ`,
    modelBreakEvenPrice: `${formatNumber(model.priceBreakEven, true)} دج/كغ`,
    modelFcr: formatNumber(model.fcr, true),
    heroAccountingProfit: formatDinar(model.operatingCash),
    heroOutputKg: formatNumber(model.outputKg),
    campaignRevenue: formatDinar(model.revenue),
    campaignAccountingProfit: formatDinar(model.operatingCash),
    campaignWorkingCapital: formatDinar(model.operatingCost),
    dashWorkingCapital: 'يعرض في ميزانية الوحدة',
    dashAccountingProfit: formatDinar(model.operatingCash),
    dashCashFlow: formatDinar(model.operatingCash),
    dashBirdCapacity: `${formatNumber(model.input.birdCapacity)} طائر`,
    dashOutputKg: `${formatNumber(model.outputKg)} كغ`,
    dashRevenue: formatDinar(model.revenue),
    dashProfit: formatDinar(model.operatingCash),
    dashBreakEven: `${formatNumber(model.priceBreakEven, true)} دج/كغ`
  };
  Object.entries(legacyMap).forEach(([id, value]) => setText(id, value));
  setText('modelDepreciation', 'غير موزع على الحضائر');
  setText('modelReserveValue', 'لا يقتطع توزيع في النموذج');
  setText('modelFreeCash', formatDinar(model.operatingCash));
  setText('modelCashBreakEvenPrice', `${formatNumber(model.priceBreakEven, true)} دج/كغ`);
  setText('modelAccountingProfitKg', `${formatNumber(model.outputKg ? model.operatingCash / model.outputKg : NaN, true)} دج/كغ`);
  setText('modelOperatingRoi', 'ليس عائداً استثمارياً');
  setText('modelAssetPayback', 'غير محسوب — الأصول مشتركة');
  setText('modelTotalPayback', 'غير محسوب — يلزم نموذج المشروع الكامل');
  setText('modelCapex', 'انظر ميزانية المشروع');
  setText('modelWorkingCapital', formatDinar(model.operatingCost));
  setText('modelBreakEvenKg', 'غير محسوب');
  setText('modelCashBreakEvenKg', 'غير محسوب');
  setText('modelSafetyOutput', 'غير محسوب');
  setText('modelSafety', 'غير محسوب');
  setText('modelAnnualCash', formatDinar(model.annualOperatingCash));
  setText('modelAnnualProfit', 'غير محسوب محاسبياً');
  setText('modelDistributableProfit', 'محتجز لإعادة الاستثمار');
  setText('modelPartnerDistribution', 'لا توزيعات قبل المرحلة الثالثة');
  setText('modelPlatformDistribution', 'لا توزيعات قبل المرحلة الثالثة');
  setText('modelInvestorShareDisplay', '—');
  setText('modelPlatformShareDisplay', '—');
  setText('modelTotalFixedCosts', 'غير موزعة على الحضائر');
  setText('modelPureContributionKg', `${formatNumber(model.input.sellingPrice - model.operatingCost / model.outputKg, true)} دج/كغ`);
  setText('feedBreakEvenPrice', 'غير محسوب — الفرضيات لا تشمل فصلاً كاملاً لمصادر التمويل');
  document.querySelectorAll('[data-model-output]').forEach((element) => {
    const field = element.dataset.modelOutput;
    const remap = { accountingProfit: 'operatingCash', workingCapital: 'operatingCost', capex: null };
    if (field === 'capex') element.textContent = '74.91 مليون دج — تقدير أولي';
    else if (remap[field]) element.textContent = broilerOutputText(remap[field], model);
    else if (field === 'outputKg') element.textContent = broilerOutputText('outputKg', model);
    else element.textContent = '—';
  });
  const ring = document.getElementById('modelSafetyRing');
  if (ring) ring.style.setProperty('--model-gauge', '0%');
  renderBroilerSensitivity(model);
  renderBroilerTimeline(model);
}
function createCell(tag, value, scope) {
  const cell = document.createElement(tag);
  cell.textContent = value;
  if (scope) cell.setAttribute('scope', scope);
  return cell;
}
function renderBroilerSensitivity(model) {
  const head = document.getElementById('sensitivityHead');
  const body = document.getElementById('sensitivityBody');
  if (!head || !body) return;
  const salePrices = [-70, -40, 0, 40, 70].map((step) => Math.max(0, model.input.sellingPrice + step));
  const feedPrices = [-10, -5, 0, 5, 10].map((step) => Math.max(0, model.input.feedPrice + step));
  const header = document.createElement('tr');
  header.append(createCell('th', 'العلف (دج/كغ) ↓ / سعر اللحم (دج/كغ) →', 'col'));
  salePrices.forEach((price) => header.append(createCell('th', formatNumber(price), 'col')));
  head.replaceChildren(header);
  body.replaceChildren(...feedPrices.map((feedPrice) => {
    const row = document.createElement('tr');
    row.append(createCell('th', formatNumber(feedPrice), 'row'));
    salePrices.forEach((salePrice) => {
      const revenue = model.outputKg * salePrice;
      const cost = model.operatingCost - model.feedCost + model.feedKg * feedPrice;
      const result = revenue - cost;
      const cell = createCell('td', formatDinar(result));
      if (result < 0) cell.classList.add('is-negative');
      row.append(cell);
    });
    return row;
  }));
}
function renderBroilerTimeline(model) {
  const body = document.getElementById('reserveTimelineBody');
  if (!body) return;
  let cumulative = 0;
  body.replaceChildren(...Array.from({ length: model.input.projectionCycles }, (_, index) => {
    cumulative += model.operatingCash;
    const row = document.createElement('tr');
    row.append(createCell('td', `الدورة ${index + 1}`));
    row.append(createCell('td', formatDinar(model.revenue)));
    row.append(createCell('td', formatDinar(model.operatingCost)));
    row.append(createCell('td', formatDinar(cumulative)));
    return row;
  }));
  setText('reserveCaption', `${formatNumber(model.input.projectionCycles)} دورات في إسقاط خطي مستقل · لا تمثل سنة تقويمية أو تدفقاً محققاً`);
}
function setBroilerNotice(message, visible = true) {
  document.querySelectorAll('[data-global-scenario]').forEach((element) => {
    element.textContent = message;
    element.hidden = !visible;
  });
}
function applyBroilerInputs(values = broilerInputs) {
  BROILER_INPUT_IDS.forEach((id) => {
    const control = document.getElementById(id);
    if (control) control.value = String(values[id]);
  });
  const adminFields = { localAdminFeed: values.feedPrice, localAdminMortality: values.mortalityRate, localAdminMeat: values.sellingPrice };
  Object.entries(adminFields).forEach(([id, value]) => {
    const control = document.getElementById(id);
    if (control) control.value = String(value);
  });
}
function readBroilerInputs() {
  if (!document.getElementById('birdCapacity')) return { ...broilerInputs };
  const candidate = {};
  BROILER_INPUT_IDS.forEach((id) => {
    const control = document.getElementById(id);
    candidate[id] = control && control.value.trim() !== '' ? Number(control.value) : NaN;
  });
  return normalizeBroilerInputs(candidate);
}
function refreshBroiler() {
  const controlsPresent = Boolean(document.getElementById('birdCapacity'));
  const values = controlsPresent ? readBroilerInputs() : { ...broilerInputs };
  if (!values) {
    setText('broilerValidation', 'تحقق من القيم المدخلة قبل عرض النتائج.');
    return null;
  }
  broilerInputs = values;
  const model = calculateBroiler(values);
  updateBroilerOutputs(model);
  setText('broilerValidation', '');
  return model;
}
function updateBroilerState(values, message) {
  const normalized = normalizeBroilerInputs(values);
  if (!normalized) return false;
  broilerInputs = normalized;
  applyBroilerInputs();
  const stored = persistBroilerInputs();
  refreshBroiler();
  setBroilerNotice(stored ? message : `${message} تعذر حفظ القيم محلياً.`, true);
  return stored;
}

/* التنقل وإظهار الرابط النشط في جميع الصفحات. */
const mainNav = document.getElementById('main-nav');
const menuToggle = document.getElementById('menu-toggle');
function normalizePath(path) {
  let normalized = path || '/';
  normalized = normalized.replace(/index\.html$/, '');
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  if (!normalized.endsWith('/')) normalized += '/';
  return normalized;
}
function closeMenu() {
  if (!mainNav || !menuToggle) return;
  mainNav.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'فتح قائمة التنقل');
}
const currentPath = normalizePath(document.body.dataset.navCurrent || window.location.pathname);
if (mainNav) {
  mainNav.querySelectorAll('a[data-nav-route]').forEach((link) => {
    const href = normalizePath(link.getAttribute('href'));
    const active = href === currentPath || (href === '/financial-model/' && currentPath.startsWith('/financial-model/'));
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  mainNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
}
if (menuToggle && mainNav) {
  menuToggle.addEventListener('click', () => {
    const opened = mainNav.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(opened));
    menuToggle.setAttribute('aria-label', opened ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل');
  });
}

if (hasSavedBroilerInputs) {
  setBroilerNotice('تُستخدم افتراضات تسمين محفوظة في LocalStorage لهذا المتصفح فقط؛ لا تتغير بيانات الزوار الآخرين.');
}
applyBroilerInputs();
BROILER_INPUT_IDS.forEach((id) => {
  const control = document.getElementById(id);
  if (!control) return;
  const handleChange = () => {
    const values = readBroilerInputs();
    if (!values) { setText('broilerValidation', 'تحقق من القيم المدخلة قبل عرض النتائج.'); return; }
    broilerInputs = values;
    persistBroilerInputs(values);
    applyBroilerInputs(values);
    refreshBroiler();
  };
  control.addEventListener('input', handleChange);
  control.addEventListener('change', handleChange);
});
document.querySelectorAll('[data-model-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    const preset = BROILER_PRESETS[button.dataset.modelPreset];
    if (!preset) return;
    updateBroilerState({ ...broilerInputs, ...preset }, `طُبّق السيناريو «${preset.label}» على حاسبة التسمين محلياً؛ وهو افتراض غير مثبت.`);
  });
});

/* أداة العرض المحلية تخص افتراضات التسمين، وليست مصادقة أو لوحة مساهمين. */
const localAdminDialog = document.getElementById('localAdminDialog');
const localAdminStatus = document.getElementById('localAdminStatus');
document.getElementById('localAdminTrigger')?.addEventListener('click', () => {
  applyBroilerInputs();
  if (localAdminStatus) localAdminStatus.textContent = 'إعدادات محلية لحاسبة التسمين فقط؛ لا توجد مصادقة أو سجل استثمار.';
  localAdminDialog?.showModal();
});
const closeAdmin = () => { if (localAdminDialog?.open) localAdminDialog.close(); };
document.getElementById('localAdminClose')?.addEventListener('click', closeAdmin);
document.getElementById('localAdminCancel')?.addEventListener('click', closeAdmin);
document.getElementById('localAdminForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const feedPrice = Number(document.getElementById('localAdminFeed')?.value);
  const mortalityRate = Number(document.getElementById('localAdminMortality')?.value);
  const sellingPrice = Number(document.getElementById('localAdminMeat')?.value);
  if (![feedPrice, mortalityRate, sellingPrice].every(Number.isFinite) || feedPrice < 0 || sellingPrice < 0 || mortalityRate < 0 || mortalityRate > 99.9) {
    if (localAdminStatus) localAdminStatus.textContent = 'تحقق من الأسعار (لا تقل عن صفر) والنفوق (0–99.9%).';
    return;
  }
  const stored = updateBroilerState({ ...broilerInputs, feedPrice, mortalityRate, sellingPrice }, 'طُبق سيناريو التسمين محلياً في هذا المتصفح فقط.');
  if (localAdminStatus) localAdminStatus.textContent = stored ? 'حُفظ السيناريو محلياً وطُبق على صفحات المنصة.' : 'تعذر حفظ السيناريو في LocalStorage.';
  closeAdmin();
});
document.getElementById('localAdminReset')?.addEventListener('click', () => {
  broilerInputs = { ...DEFAULT_BROILER_INPUTS };
  let cleared = true;
  try {
    window.localStorage.removeItem(BROILER_STORAGE_KEY);
    window.localStorage.removeItem(OLD_BROILER_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_SCENARIO_KEY);
  } catch { cleared = false; }
  hasSavedBroilerInputs = false;
  applyBroilerInputs();
  setBroilerNotice('', false);
  refreshBroiler();
  if (localAdminStatus) localAdminStatus.textContent = cleared
    ? 'استُعيد خط أساس التسمين: 10,080 طائراً، علف 75 دج/كغ، نفوق 6%، بيع 370 دج/كغ.'
    : 'استُعيد خط الأساس لهذه الجلسة، لكن تعذر حذف التخزين المحلي.';
});
refreshBroiler();

/* نموذج اهتمام تجريبي فقط؛ لا يرسل أو يخزّن معلومات التواصل. */
function isValidAlgerianMobile(value) {
  const digits = value.replace(/\D/g, '');
  return /^(0[567]\d{8}|213[567]\d{8}|00213[567]\d{8})$/.test(digits);
}
const waitlistForm = document.getElementById('waitlistForm');
const phoneInput = document.getElementById('userPhone');
const successBanner = document.getElementById('waitlistSuccess');
const successText = document.getElementById('successText');
if (waitlistForm && phoneInput && successBanner && successText) {
  const validatePhone = () => phoneInput.setCustomValidity(!phoneInput.value.trim() || isValidAlgerianMobile(phoneInput.value)
    ? '' : 'أدخل رقم هاتف محمول جزائرياً بصيغة صحيحة، مثل 05 55 00 00 00.');
  phoneInput.addEventListener('input', validatePhone);
  phoneInput.addEventListener('blur', validatePhone);
  waitlistForm.addEventListener('submit', (event) => {
    event.preventDefault();
    validatePhone();
    if (!waitlistForm.reportValidity()) return;
    const name = document.getElementById('userName')?.value.trim() || '';
    const wilaya = document.getElementById('userWilaya')?.value || '';
    const code = Math.floor(1000 + Math.random() * 9000);
    const message = document.createElement('span');
    message.append(document.createTextNode(`شكراً لك ${name} من ولاية ${wilaya}. رقم الأولوية التجريبي: `));
    const priority = document.createElement('strong');
    priority.className = 'success-code';
    priority.textContent = `#MNT-${code}`;
    message.append(priority, document.createTextNode(' — لم يتم إرسال معلوماتك أو حفظها.'));
    successText.replaceChildren(message);
    successBanner.hidden = false;
    waitlistForm.reset();
    phoneInput.setCustomValidity('');
  });
}
