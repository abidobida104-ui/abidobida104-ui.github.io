/* حاسبة الدجاج البياض — محاكاة محلية مستقلة بدورة أساسها 390 يوماً. */
'use strict';

const LAYER_DEFAULTS = Object.freeze({
  capacity: 4992,
  mortalityPct: 5,
  feedKgPerBirdDay: 0.12,
  feedPrice: 67,
  eggsPerTray: 30,
  eggWeightGrams: 60,
  trayPrice: 420,
  cullWeightKg: 1.9,
  cullPricePerKg: 300,
  stage1Days: 120,
  stage1Rate: 94,
  stage2Days: 150,
  stage2Rate: 90,
  stage3Days: 120,
  stage3Rate: 82,
  otherCostPer5000Birds390d: 2448333,
  referenceCapacity: 4992,
  referenceStartupBudget: 9400000,
  referenceFeedPrice: 67,
  prepaidFeedDays: 90
});
const LAYER_STORAGE_KEY = 'muntij.layersInputs.v1';
const LAYER_INPUT_KEYS = Object.keys(LAYER_DEFAULTS).filter((id) => !id.startsWith('reference'));
const LAYER_CONTROL_IDS = { feedPrice: 'layerFeedPrice' };
const layerControlId = (key) => LAYER_CONTROL_IDS[key] || key;
const LAYER_INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const LAYER_DEC = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const LAYER_MONEY = (value) => {
  if (!Number.isFinite(value)) return 'غير متاح';
  const n = Math.round(value);
  return `\u2066${n < 0 ? '−' : ''}${LAYER_INT.format(Math.abs(n))}\u2069 دج`;
};
const layerSetText = (id, value) => {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
};
function layerFormat(value, decimals = false) {
  if (!Number.isFinite(value)) return 'غير متاح';
  return (decimals ? LAYER_DEC : LAYER_INT).format(value);
}
function layerReadStorage() {
  try {
    const raw = window.localStorage.getItem(LAYER_STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch { return null; }
}
function layerNormalize(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const result = { ...LAYER_DEFAULTS };
  for (const id of LAYER_INPUT_KEYS) {
    if (Object.hasOwn(candidate, id)) {
      const value = Number(candidate[id]);
      if (!Number.isFinite(value)) return null;
      result[id] = value;
    }
  }
  if (result.capacity < 1 || result.capacity > 1000000) return null;
  if (result.mortalityPct < 0 || result.mortalityPct > 99.9) return null;
  for (const id of ['feedKgPerBirdDay', 'feedPrice', 'trayPrice', 'cullWeightKg', 'cullPricePerKg', 'eggWeightGrams', 'otherCostPer5000Birds390d', 'referenceStartupBudget']) {
    if (result[id] < 0) return null;
  }
  for (const id of ['eggsPerTray', 'stage1Days', 'stage2Days', 'stage3Days', 'prepaidFeedDays']) {
    if (!Number.isInteger(result[id]) || result[id] < 1) return null;
  }
  for (const id of ['stage1Rate', 'stage2Rate', 'stage3Rate']) {
    if (result[id] < 0 || result[id] > 100) return null;
  }
  if (result.prepaidFeedDays >= result.stage1Days + result.stage2Days + result.stage3Days) return null;
  return result;
}
const layerSaved = layerNormalize(layerReadStorage());
let layerInputs = layerSaved || { ...LAYER_DEFAULTS };
let layerDirty = Boolean(layerSaved);
function layerPersist() {
  try {
    window.localStorage.setItem(LAYER_STORAGE_KEY, JSON.stringify(layerInputs));
    layerDirty = true;
    return true;
  } catch { return false; }
}
function layerReadControls() {
  const hasInputs = LAYER_INPUT_KEYS.some((id) => document.getElementById(layerControlId(id)));
  if (!hasInputs) return { ...layerInputs };
  const candidate = { ...LAYER_DEFAULTS };
  LAYER_INPUT_KEYS.forEach((id) => {
    const control = document.getElementById(layerControlId(id));
    if (control) candidate[id] = control.value.trim() === '' ? NaN : Number(control.value);
  });
  return layerNormalize(candidate);
}
function layerAverageFeedDays(input, dayLimit) {
  const totalDays = input.stage1Days + input.stage2Days + input.stage3Days;
  const days = Math.min(dayLimit, totalDays);
  let kg = 0;
  for (let day = 0; day < days; day += 1) {
    const alive = input.capacity * (1 - input.mortalityPct / 100 * (day + 0.5) / totalDays);
    kg += alive * input.feedKgPerBirdDay;
  }
  return kg;
}
function calculateLayers(input) {
  if (!input) return null;
  const totalDays = input.stage1Days + input.stage2Days + input.stage3Days;
  const monthCount = Math.ceil(totalDays / 30);
  const referenceDays = LAYER_DEFAULTS.stage1Days + LAYER_DEFAULTS.stage2Days + LAYER_DEFAULTS.stage3Days;
  const basePrepaidFeed = layerAverageFeedDays({
    ...LAYER_DEFAULTS,
    capacity: LAYER_DEFAULTS.referenceCapacity,
    feedKgPerBirdDay: LAYER_DEFAULTS.feedKgPerBirdDay,
    mortalityPct: LAYER_DEFAULTS.mortalityPct,
    stage1Days: LAYER_DEFAULTS.stage1Days,
    stage2Days: LAYER_DEFAULTS.stage2Days,
    stage3Days: LAYER_DEFAULTS.stage3Days
  }, LAYER_DEFAULTS.prepaidFeedDays) * LAYER_DEFAULTS.referenceFeedPrice;
  const impliedPulletPrice = Math.max(0, (LAYER_DEFAULTS.referenceStartupBudget - basePrepaidFeed) / LAYER_DEFAULTS.referenceCapacity);
  const pulletPurchase = impliedPulletPrice * input.capacity;
  const daysPrepaid = Math.min(input.prepaidFeedDays, totalDays);
  const prepaidFeedKg = layerAverageFeedDays(input, daysPrepaid);
  const initialSetup = pulletPurchase + prepaidFeedKg * input.feedPrice;
  const monthly = Array.from({ length: monthCount }, (_, month) => ({
    month: month + 1, days: 0, eggs: 0, feedKg: 0, feedCostUsed: 0,
    feedCashPaid: 0, otherCost: 0, eggRevenue: 0, cullRevenue: 0,
    cashIn: 0, cashOut: 0, net: 0, cumulative: 0
  }));
  let feedKgTotal = 0;
  let eggsTotal = 0;
  let feedCashAfterAdvance = 0;
  let feedKgAfterAdvance = 0;
  const stageEnds = [input.stage1Days, input.stage1Days + input.stage2Days, totalDays];
  const stageRates = [input.stage1Rate / 100, input.stage2Rate / 100, input.stage3Rate / 100];
  const dailyOtherCost = input.otherCostPer5000Birds390d * (input.capacity / 5000) * (390 / referenceDays) / referenceDays;
  for (let day = 0; day < totalDays; day += 1) {
    const month = monthly[Math.floor(day / 30)];
    let stage = 0;
    if (day >= stageEnds[0]) stage = 1;
    if (day >= stageEnds[1]) stage = 2;
    const alive = input.capacity * (1 - input.mortalityPct / 100 * (day + 0.5) / totalDays);
    const feedKg = alive * input.feedKgPerBirdDay;
    const feedCost = feedKg * input.feedPrice;
    const eggs = alive * stageRates[stage];
    month.days += 1;
    month.eggs += eggs;
    month.feedKg += feedKg;
    month.feedCostUsed += feedCost;
    month.otherCost += dailyOtherCost;
    feedKgTotal += feedKg;
    eggsTotal += eggs;
    if (day >= daysPrepaid) {
      month.feedCashPaid += feedCost;
      feedCashAfterAdvance += feedCost;
      feedKgAfterAdvance += feedKg;
    }
  }
  const finalMonth = monthly[monthly.length - 1];
  const endBirds = input.capacity * (1 - input.mortalityPct / 100);
  const cullRevenue = endBirds * input.cullWeightKg * input.cullPricePerKg;
  monthly.forEach((month) => {
    month.eggRevenue = month.eggs / input.eggsPerTray * input.trayPrice;
    month.cullRevenue = month.month === finalMonth.month ? cullRevenue : 0;
    month.cashIn = month.eggRevenue + month.cullRevenue;
    month.cashOut = month.feedCashPaid + month.otherCost;
    month.net = month.cashIn - month.cashOut;
  });
  let cumulative = -initialSetup;
  monthly.forEach((month) => {
    cumulative += month.net;
    month.cumulative = cumulative;
  });
  const otherCostTotal = monthly.reduce((sum, month) => sum + month.otherCost, 0);
  const eggRevenue = eggsTotal / input.eggsPerTray * input.trayPrice;
  const totalRevenue = eggRevenue + cullRevenue;
  const totalCashOut = initialSetup + feedCashAfterAdvance + otherCostTotal;
  const netCash = totalRevenue - totalCashOut;
  const eggMassKg = eggsTotal * input.eggWeightGrams / 1000;
  const fcr = eggMassKg > 0 ? feedKgTotal / eggMassKg : NaN;
  const breakEvenTray = eggsTotal > 0 ? (totalCashOut - cullRevenue) / (eggsTotal / input.eggsPerTray) : NaN;
  return {
    input, totalDays, monthCount, eggsTotal, trays: eggsTotal / input.eggsPerTray,
    feedKgTotal, feedCostUsed: feedKgTotal * input.feedPrice,
    feedCashAfterAdvance, feedKgAfterAdvance, prepaidFeedKg,
    initialFeedAdvance: prepaidFeedKg * input.feedPrice,
    pulletPurchase, impliedPulletPrice, initialSetup, otherCostTotal,
    eggRevenue, cullRevenue, totalRevenue, totalCashOut, netCash,
    endBirds, fcr, breakEvenTray, monthly, eggMassKg
  };
}
function layerUpdateOutputs(model) {
  if (!model) return;
  const outputs = {
    capacity: `${layerFormat(model.input.capacity)} طائر`,
    cycleDays: `${layerFormat(model.totalDays)} يوماً · ${layerFormat(model.monthCount)} شهراً تقريباً`,
    eggs: `${layerFormat(model.eggsTotal)} بيضة`,
    trays: `${layerFormat(model.trays)} صينية`,
    feedKg: `${layerFormat(model.feedKgTotal, true)} كغ`,
    feedCost: LAYER_MONEY(model.feedCostUsed),
    eggRevenue: LAYER_MONEY(model.eggRevenue),
    cullRevenue: LAYER_MONEY(model.cullRevenue),
    totalRevenue: LAYER_MONEY(model.totalRevenue),
    initialSetup: LAYER_MONEY(model.initialSetup),
    initialFeedAdvance: LAYER_MONEY(model.initialFeedAdvance),
    pulletPurchase: LAYER_MONEY(model.pulletPurchase),
    impliedPulletPrice: `${layerFormat(model.impliedPulletPrice, true)} دج/طائر · مستنتج من المخصص`,
    otherCost: LAYER_MONEY(model.otherCostTotal),
    netCash: LAYER_MONEY(model.netCash),
    retainedCash: model.netCash > 0 ? LAYER_MONEY(model.netCash) : `عجز تقديري ${LAYER_MONEY(Math.abs(model.netCash))}`,
    birdsEnd: `${layerFormat(model.endBirds)} طائر`,
    breakEvenTray: `${layerFormat(model.breakEvenTray, true)} دج/صينية`,
    fcr: `${layerFormat(model.fcr, true)} كغ علف/كغ كتلة بيض`,
    eggMass: `${layerFormat(model.eggMassKg, true)} كغ`
  };
  document.querySelectorAll('[data-layer-output]').forEach((element) => {
    element.textContent = outputs[element.dataset.layerOutput] ?? '—';
  });
  ['layersCashTimelineBody', 'layersSensitivityBody'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.replaceChildren();
  });
  renderLayerTimeline(model);
  renderLayerSensitivity(model);
}
function layerCell(tag, text, scope) {
  const cell = document.createElement(tag);
  cell.textContent = text;
  if (scope) cell.setAttribute('scope', scope);
  return cell;
}
function renderLayerTimeline(model) {
  const body = document.getElementById('layersCashTimelineBody');
  if (!body) return;
  const rows = [];
  let cumulative = -model.initialSetup;
  const start = document.createElement('tr');
  start.append(layerCell('td', '0 · تجهيز القطيع/علف 90 يوماً'));
  start.append(layerCell('td', '—'));
  start.append(layerCell('td', '—'));
  start.append(layerCell('td', LAYER_MONEY(model.initialSetup)));
  start.append(layerCell('td', LAYER_MONEY(-model.initialSetup)));
  start.append(layerCell('td', LAYER_MONEY(cumulative)));
  rows.push(start);
  model.monthly.forEach((month) => {
    cumulative += month.net;
    const row = document.createElement('tr');
    row.append(layerCell('td', `الشهر ${month.month}`));
    row.append(layerCell('td', `${layerFormat(month.eggs)} بيضة`));
    row.append(layerCell('td', LAYER_MONEY(month.cashIn)));
    row.append(layerCell('td', LAYER_MONEY(month.cashOut)));
    row.append(layerCell('td', LAYER_MONEY(month.net)));
    row.append(layerCell('td', LAYER_MONEY(cumulative)));
    rows.push(row);
  });
  body.replaceChildren(...rows);
  layerSetText('layersTimelineCaption', `نحو ${model.monthCount} شهراً · ${model.totalDays} يوماً · البيض موزع حسب مراحل HDP؛ علف أول ${model.input.prepaidFeedDays} يوماً ممول ضمن مخصص البداية.`);
}
function renderLayerSensitivity(model) {
  const body = document.getElementById('layersSensitivityBody');
  const head = document.getElementById('layersSensitivityHead');
  if (!body || !head) return;
  const trayPrices = [-60, -30, 0, 30, 60].map((x) => Math.max(0, model.input.trayPrice + x));
  const feedPrices = [-10, -5, 0, 5, 10].map((x) => Math.max(0, model.input.feedPrice + x));
  const header = document.createElement('tr');
  header.append(layerCell('th', 'العلف (دج/كغ) ↓ / الصينية (دج) →', 'col'));
  trayPrices.forEach((price) => header.append(layerCell('th', layerFormat(price), 'col')));
  head.replaceChildren(header);
  const rows = feedPrices.map((feedPrice) => {
    const row = document.createElement('tr');
    row.append(layerCell('th', layerFormat(feedPrice), 'row'));
    trayPrices.forEach((trayPrice) => {
      const setupWithFeedChange = model.pulletPurchase + model.prepaidFeedKg * feedPrice;
      const remainingFeed = model.feedKgAfterAdvance * feedPrice;
      const value = model.trays * trayPrice + model.cullRevenue - setupWithFeedChange - remainingFeed - model.otherCostTotal;
      const cell = layerCell('td', LAYER_MONEY(value));
      if (value < 0) cell.classList.add('is-negative');
      row.append(cell);
    });
    return row;
  });
  body.replaceChildren(...rows);
}
function layerRefresh() {
  const inputsPresent = LAYER_INPUT_KEYS.some((id) => document.getElementById(layerControlId(id)));
  const candidate = inputsPresent ? layerReadControls() : { ...layerInputs };
  if (!candidate) {
    layerSetText('layersValidation', 'تحقق من المدخلات؛ يجب أن تكون القيم موجبة وأن تتوافق مدة العلف المسبق مع مدة الدورة.');
    return null;
  }
  layerInputs = candidate;
  const model = calculateLayers(candidate);
  layerUpdateOutputs(model);
  layerSetText('layersValidation', '');
  return model;
}
function layerApplyControls() {
  LAYER_INPUT_KEYS.forEach((id) => {
    const control = document.getElementById(layerControlId(id));
    if (control) control.value = String(layerInputs[id]);
  });
}
layerApplyControls();
LAYER_INPUT_KEYS.forEach((id) => {
  const control = document.getElementById(layerControlId(id));
  if (!control) return;
  const update = () => {
    const candidate = layerReadControls();
    if (!candidate) {
      layerSetText('layersValidation', 'تحقق من المدخلات؛ لا يمكن أن تتجاوز أيام العلف المسبق مدة الدورة.');
      return;
    }
    layerInputs = candidate;
    layerPersist();
    layerRefresh();
    layerSetText('layersLocalNotice', 'حُفظت مدخلات حاسبة البياض في LocalStorage لهذا المتصفح فقط؛ لا تُرسل للخادم ولا تتغير عند الزوار الآخرين.');
  };
  control.addEventListener('input', update);
  control.addEventListener('change', update);
});
document.querySelectorAll('[data-layers-reset]').forEach((button) => {
  button.addEventListener('click', () => {
    layerInputs = { ...LAYER_DEFAULTS };
    try { window.localStorage.removeItem(LAYER_STORAGE_KEY); } catch { /* الذاكرة تظل محلية للجلسة. */ }
    layerApplyControls();
    layerRefresh();
    layerSetText('layersLocalNotice', 'استُعيدت افتراضات البياض الواردة في ملف المحاكاة؛ تبقى تقديرية غير مدققة.');
  });
});
layerRefresh();
