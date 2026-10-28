/**
 * Agenic Batter Ledger - Google Sheets backend (Google Apps Script)
 *
 * 1. Create a Google Sheet (any name), open Extensions -> Apps Script, paste this file.
 * 2. Change API_KEY below to your own secret word.
 * 3. Run `setup` once (authorise when asked). It creates the tabs + daily reminder trigger.
 * 4. Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone -> copy the URL.
 * 5. Paste the URL + key in the app: Settings -> Google Sheet backend.
 */
const API_KEY = 'change-me-to-your-secret'; // <- must match the key you enter in the app
const COMPANY = 'Agenic';
const CODE_VERSION = 'driver-app-v1'; // open <web app url>?action=version to check which code is live
const REMIND_HOUR = 9; // daily automatic check runs around this hour (script time zone)

const SCHEMA = {
  customers: { tab: 'Customers', cols: ['id', 'name', 'area', 'phone', 'email', 'rate', 'creditLimit', 'maxDays', 'active', 'address', 'mapUrl', 'profitPerKg', 'lat', 'lng', 'locSource'], text: ['id', 'phone'] },
  deliveries: { tab: 'Deliveries', cols: ['id', 'date', 'customerId', 'customerName', 'qty', 'rate', 'cost', 'amount', 'note', 'driverId', 'seq'], text: ['id', 'date', 'customerId', 'driverId'] },
  costs: { tab: 'DayCosts', cols: ['id', 'date', 'driver', 'diesel', 'porter', 'other', 'porterBooked', 'note'], text: ['id', 'date'] },
  trips: { tab: 'Trips', cols: ['id', 'date', 'mode', 'cost', 'customerIds', 'note'], text: ['id', 'date', 'customerIds'] },
  payments: { tab: 'Payments', cols: ['id', 'date', 'customerId', 'customerName', 'amount', 'mode', 'note'], text: ['id', 'date', 'customerId'] },
  drivers: { tab: 'Drivers', cols: ['id', 'name', 'phone', 'vehicle', 'capacityKg', 'startAddress', 'startLat', 'startLng', 'stretch', 'active', 'baseRoute', 'pin'], text: ['id', 'phone', 'baseRoute', 'pin'] },
  tracking: { tab: 'Tracking', cols: ['id', 'date', 'driverId', 'customerId', 'status', 'doneAt', 'remark', 'voiceId', 'payMode', 'payAmount', 'payAt', 'updatedAt'], text: ['id', 'date', 'driverId', 'customerId', 'voiceId', 'doneAt', 'payAt', 'updatedAt'] },
  settings: { tab: 'Settings', cols: ['key', 'value'], text: [] }
};

/* ------------------------------------------------------------------ setup */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (k) {
    const def = SCHEMA[k];
    let sh = ss.getSheetByName(def.tab);
    if (!sh) sh = ss.insertSheet(def.tab);
    sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols]).setFontWeight('bold').setBackground('#1f2a52').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    def.text.forEach(function (c) {
      sh.getRange(2, def.cols.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@'); // keep dates/ids as plain text
    });
  });
  const first = ss.getSheets()[0];
  if (first && first.getName() === 'Sheet1' && ss.getSheets().length > 1) ss.deleteSheet(first);
  installTrigger();
  voiceFolder_(); // creates the Drive folder for driver voice notes and asks for Drive permission
  Logger.log('Setup complete. Now deploy as a Web app.');
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyCheck').timeBased().everyDays(1).atHour(REMIND_HOUR).create();
}

/* -------------------------------------------------------------- web app */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    if (e.parameter.action === 'version') return json_({ ok: true, version: CODE_VERSION });
    check_(e.parameter.key);
    if (e.parameter.action === 'getAll') return json_({ ok: true, data: getAll_() });
    return json_({ ok: true, message: COMPANY + ' ledger API is running' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const req = JSON.parse(e.postData.contents);
    if (String(req.action || '').indexOf('driver') === 0) return json_({ ok: true, data: driverApi_(req) });
    check_(req.key);
    if (req.action === 'getVoice') return json_({ ok: true, data: getVoice_(req.fileId) });
    switch (req.action) {
      case 'upsert': upsert_(req.sheet, req.row); break;
      case 'upsertMany': upsertMany_(req.sheet, req.rows); break;
      case 'remove': remove_(req.sheet, req.id); break;
      case 'saveSettings': saveSettings_(req.settings); break;
      case 'sendReminder': sendReminder_(req.customerId, req.subject, req.body); break;
      default: throw new Error('Unknown action: ' + req.action);
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function check_(key) {
  if (!key || key !== API_KEY) throw new Error('Wrong secret key');
}

/* ------------------------------------------------------------ driver app */
// Drivers log in with their name + PIN (set by the admin in the app). No admin key is ever sent to a driver.
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function nowIso_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"); }

function token_(d) {
  const sig = Utilities.computeHmacSha256Signature(String(d.id) + '|' + String(d.pin), API_KEY);
  return Utilities.base64EncodeWebSafe(sig);
}

function authDriver_(req) {
  const d = read_('drivers').filter(function (x) { return String(x.id) === String(req.driverId); })[0];
  if (!d || String(d.active).toUpperCase() === 'FALSE' || !String(d.pin || '')) throw new Error('Driver login is not available. Ask the admin.');
  if (!req.token || req.token !== token_(d)) throw new Error('Session expired. Please log in again.');
  return d;
}

function driverApi_(req) {
  switch (req.action) {
    case 'driverList': return driverList_();
    case 'driverLogin': return driverLogin_(req.driverId, req.pin);
    case 'driverRoute': return driverRoute_(authDriver_(req), req.date);
    case 'driverUpdate': return driverUpdate_(authDriver_(req), req);
    case 'driverVoice': return driverVoice_(authDriver_(req), req);
    default: throw new Error('Unknown action: ' + req.action);
  }
}

function driverList_() {
  return read_('drivers')
    .filter(function (d) { return String(d.active).toUpperCase() !== 'FALSE' && String(d.pin || ''); })
    .map(function (d) { return { id: String(d.id), name: d.name }; });
}

function driverLogin_(driverId, pin) {
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + driverId;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw new Error('Too many wrong PINs. Try again in 10 minutes.');
  const d = read_('drivers').filter(function (x) { return String(x.id) === String(driverId); })[0];
  if (!d || String(d.active).toUpperCase() === 'FALSE' || !String(d.pin || '') || String(d.pin) !== String(pin)) {
    cache.put(failKey, String(fails + 1), 600);
    throw new Error('Wrong PIN');
  }
  cache.remove(failKey);
  return { driver: { id: String(d.id), name: d.name, phone: d.phone, vehicle: d.vehicle }, token: token_(d) };
}

function driverRoute_(d, date) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : today_();
  const customers = {};
  read_('customers').forEach(function (c) { customers[String(c.id)] = c; });
  const deliveries = read_('deliveries');
  const payments = read_('payments');
  const tracking = {};
  read_('tracking').forEach(function (t) { tracking[String(t.id)] = t; });
  const mine = deliveries
    .filter(function (x) { return x.date === day && String(x.driverId) === String(d.id); })
    .sort(function (a, b) { return (Number(a.seq) || 999) - (Number(b.seq) || 999); });
  const amt = function (x) { return Number(x.amount) || (Number(x.qty) || 0) * (Number(x.rate) || 0); };
  const stops = mine.map(function (x, i) {
    const c = customers[String(x.customerId)] || {};
    const cid = String(x.customerId);
    const before = deliveries.filter(function (y) { return String(y.customerId) === cid && y.date < day; }).reduce(function (s, y) { return s + amt(y); }, 0);
    const todays = deliveries.filter(function (y) { return String(y.customerId) === cid && y.date === day; }).reduce(function (s, y) { return s + amt(y); }, 0);
    const paid = payments.filter(function (p) { return String(p.customerId) === cid; }).reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
    const previous = Math.max(0, before - paid);
    const todayDue = Math.max(0, Math.min(todays, todays - Math.max(0, paid - before)));
    const t = tracking[String(x.id)] || {};
    return {
      id: String(x.id), seq: i + 1, customerId: cid, name: x.customerName || c.name || '', phone: c.phone || '', area: c.area || '',
      address: c.address || '', lat: c.lat === '' ? null : c.lat, lng: c.lng === '' ? null : c.lng,
      qty: Number(x.qty) || 0, rate: Number(x.rate) || 0, bill: amt(x),
      due: { previous: Math.round(previous), today: Math.round(todayDue), total: Math.round(previous + todayDue) },
      track: { status: t.status || 'pending', remark: t.remark || '', voiceId: t.voiceId || '', payMode: t.payMode || '', payAmount: Number(t.payAmount) || 0, doneAt: t.doneAt || '' }
    };
  });
  const st = {};
  read_('settings').forEach(function (r) { st[r.key] = r.value; });
  return {
    date: day, serverTime: nowIso_(),
    driver: { id: String(d.id), name: d.name, phone: d.phone, vehicle: d.vehicle },
    depot: { name: st.depotName || 'Koratturr', lat: Number(st.depotLat) || 13.1143, lng: Number(st.depotLng) || 80.185 },
    stops: stops
  };
}

function trackRow_(id) {
  const s = sheet_('tracking');
  const at = findRow_(s, id);
  if (at < 0) return { id: String(id) };
  const vals = s.sh.getRange(at, 1, 1, s.def.cols.length).getValues()[0];
  const o = {};
  s.def.cols.forEach(function (c, i) { o[c] = cell_(vals[i]); });
  return o;
}

function ownDelivery_(d, deliveryId) {
  const x = read_('deliveries').filter(function (y) { return String(y.id) === String(deliveryId); })[0];
  if (!x || String(x.driverId) !== String(d.id)) throw new Error('This order is not assigned to you');
  return x;
}

function driverUpdate_(d, req) {
  const del = ownDelivery_(d, req.deliveryId);
  const row = trackRow_(del.id);
  const p = req.patch || {};
  row.date = del.date; row.driverId = String(d.id); row.customerId = String(del.customerId);
  if (p.status !== undefined) {
    if (['pending', 'arrived', 'delivered', 'skipped'].indexOf(p.status) < 0) throw new Error('Bad status');
    row.status = p.status;
    if ((p.status === 'delivered' || p.status === 'skipped') && !row.doneAt) row.doneAt = nowIso_();
    if (p.status === 'pending' || p.status === 'arrived') row.doneAt = '';
  }
  if (p.remark !== undefined) row.remark = String(p.remark).slice(0, 600);
  if (p.payMode !== undefined) {
    if (['', 'cash', 'gpay', 'pending'].indexOf(p.payMode) < 0) throw new Error('Bad payment mode');
    row.payMode = p.payMode;
    row.payAmount = Math.max(0, Math.min(1000000, Number(p.payAmount) || 0));
    row.payAt = row.payMode === 'cash' || row.payMode === 'gpay' ? nowIso_() : '';
  }
  row.updatedAt = nowIso_();
  upsert_('tracking', row);
  // money collected becomes a normal payment, so ledger, dues and reports update by themselves
  if (p.payMode !== undefined) {
    const payId = 'drv-' + del.id;
    if ((row.payMode === 'cash' || row.payMode === 'gpay') && row.payAmount > 0) {
      upsert_('payments', { id: payId, date: today_(), customerId: String(del.customerId), customerName: del.customerName, amount: row.payAmount, mode: row.payMode === 'gpay' ? 'UPI' : 'Cash', note: 'Collected by ' + d.name });
    } else if (findRow_(sheet_('payments'), payId) > 0) {
      remove_('payments', payId);
    }
  }
  return { track: row };
}

function voiceFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('VOICE_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) {} }
  const f = DriveApp.createFolder(COMPANY + ' driver voice notes');
  props.setProperty('VOICE_FOLDER', f.getId());
  return f;
}

function driverVoice_(d, req) {
  const del = ownDelivery_(d, req.deliveryId);
  const data = String(req.data || '');
  if (!data || data.length > 4500000) throw new Error('Voice note is empty or too long');
  const mime = /^audio\//.test(String(req.mime || '')) ? String(req.mime).split(';')[0] : 'audio/webm';
  const ext = mime.indexOf('mp4') >= 0 || mime.indexOf('aac') >= 0 ? 'm4a' : mime.indexOf('ogg') >= 0 ? 'ogg' : mime.indexOf('wav') >= 0 ? 'wav' : 'webm';
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mime, 'voice_' + del.date + '_' + String(del.customerName).replace(/[^A-Za-z0-9]+/g, '_') + '_' + del.id + '.' + ext);
  const file = voiceFolder_().createFile(blob);
  const row = trackRow_(del.id);
  if (row.voiceId) { try { DriveApp.getFileById(row.voiceId).setTrashed(true); } catch (x) {} }
  row.date = del.date; row.driverId = String(d.id); row.customerId = String(del.customerId);
  row.voiceId = file.getId(); row.updatedAt = nowIso_();
  upsert_('tracking', row);
  return { voiceId: row.voiceId };
}

// Admin only: returns a voice note so the app can play it (files stay private in your Drive).
function getVoice_(fileId) {
  const file = DriveApp.getFileById(String(fileId));
  const folder = voiceFolder_();
  const parents = file.getParents();
  var ok = false;
  while (parents.hasNext()) if (parents.next().getId() === folder.getId()) ok = true;
  if (!ok) throw new Error('Not a driver voice note');
  const blob = file.getBlob();
  return { mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ------------------------------------------------------------ data layer */
function sheet_(name) {
  const def = SCHEMA[name];
  if (!def) throw new Error('Unknown sheet: ' + name);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.tab);
  if (!sh) throw new Error('Tab "' + def.tab + '" is missing - run setup() first');
  return { sh: sh, def: def };
}

function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v;
}

function read_(name) {
  const s = sheet_(name);
  const last = s.sh.getLastRow();
  if (last < 2) return [];
  const vals = s.sh.getRange(2, 1, last - 1, s.def.cols.length).getValues();
  return vals
    .filter(function (r) { return r[0] !== ''; })
    .map(function (r) {
      const o = {};
      s.def.cols.forEach(function (c, i) { o[c] = cell_(r[i]); });
      return o;
    });
}

function getAll_() {
  const out = {};
  ['customers', 'deliveries', 'costs', 'payments', 'drivers', 'trips', 'tracking'].forEach(function (k) { out[k] = read_(k); });
  const settings = {};
  read_('settings').forEach(function (r) { settings[r.key] = r.value; });
  out.settings = settings;
  return out;
}

function findRow_(s, id) {
  const last = s.sh.getLastRow();
  if (last < 2) return -1;
  const ids = s.sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function upsert_(name, row) {
  const s = sheet_(name);
  const values = s.def.cols.map(function (c) { return row[c] === undefined || row[c] === null ? '' : row[c]; });
  const at = findRow_(s, row.id);
  if (at > 0) s.sh.getRange(at, 1, 1, values.length).setValues([values]);
  else {
    const next = Math.max(s.sh.getLastRow() + 1, 2);
    s.def.text.forEach(function (c) { s.sh.getRange(next, s.def.cols.indexOf(c) + 1).setNumberFormat('@'); });
    s.sh.getRange(next, 1, 1, values.length).setValues([values]);
  }
}

function upsertMany_(name, rows) {
  const s = sheet_(name);
  const last = s.sh.getLastRow();
  const pos = {};
  if (last >= 2) s.sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { pos[String(r[0])] = i + 2; });
  const add = [];
  rows.forEach(function (row) {
    const values = s.def.cols.map(function (c) { return row[c] === undefined || row[c] === null ? '' : row[c]; });
    const at = pos[String(row.id)];
    if (at) s.sh.getRange(at, 1, 1, values.length).setValues([values]);
    else add.push(values);
  });
  if (add.length) {
    const start = Math.max(s.sh.getLastRow() + 1, 2);
    s.def.text.forEach(function (c) { s.sh.getRange(start, s.def.cols.indexOf(c) + 1, add.length, 1).setNumberFormat('@'); });
    s.sh.getRange(start, 1, add.length, s.def.cols.length).setValues(add);
  }
}

function remove_(name, id) {
  const s = sheet_(name);
  const at = findRow_(s, id);
  if (at > 0) s.sh.deleteRow(at);
}

function saveSettings_(obj) {
  const s = sheet_('settings');
  Object.keys(obj).forEach(function (k) {
    const last = s.sh.getLastRow();
    var at = -1;
    if (last >= 2) {
      const keys = s.sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < keys.length; i++) if (keys[i][0] === k) { at = i + 2; break; }
    }
    if (at < 0) at = Math.max(last + 1, 2);
    s.sh.getRange(at, 1, 1, 2).setValues([[k, obj[k]]]);
  });
}

/* ------------------------------------------------------------------ email */
function ownerEmail_() {
  var v = '';
  read_('settings').forEach(function (r) { if (r.key === 'ownerEmail') v = String(r.value || ''); });
  return v;
}

function html_(body) {
  const esc = String(body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  return '<div style="font-family:Segoe UI,Arial,sans-serif;background:#f4f6fb;padding:24px">' +
    '<div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e3e7f2">' +
    '<div style="background:linear-gradient(135deg,#7c5cff,#22d3ee);padding:18px 24px;color:#fff;font-size:18px;font-weight:700">' + COMPANY + ' - Payment Reminder</div>' +
    '<div style="padding:24px;color:#1b2340;font-size:14px;line-height:1.6;white-space:normal">' + esc + '</div>' +
    '<div style="padding:14px 24px;background:#f4f6fb;color:#7a86a8;font-size:12px">Automated message from ' + COMPANY + ' accounts.</div>' +
    '</div></div>';
}

function sendReminder_(customerId, subject, body) {
  const c = read_('customers').filter(function (x) { return String(x.id) === String(customerId); })[0];
  if (!c) throw new Error('Customer not found in the sheet - wait for sync and retry');
  if (!c.email) throw new Error('No email saved for ' + c.name);
  const owner = ownerEmail_();
  const opts = { to: c.email, subject: subject, body: body, htmlBody: html_(body), name: COMPANY + ' Accounts' };
  if (owner) opts.cc = owner;
  MailApp.sendEmail(opts);
}

/* ------------------------------------------- automatic daily reminder run */
function duesFor_() {
  const customers = read_('customers').filter(function (c) { return c.active !== false && String(c.active).toUpperCase() !== 'FALSE'; });
  const settings = getAll_().settings;
  const defMax = Number(settings.maxUnpaidDays) || 3;
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const deliveries = read_('deliveries').filter(function (d) { return String(d.date) <= today; }); // planned (future) orders are not owed yet
  const payments = read_('payments');
  const dayMs = 86400000;

  return customers.map(function (c) {
    const ds = deliveries.filter(function (d) { return String(d.customerId) === String(c.id); })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var credit = payments.filter(function (p) { return String(p.customerId) === String(c.id); })
      .reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
    const unpaid = [];
    ds.forEach(function (d) {
      const amt = Number(d.qty) * Number(d.rate);
      const used = Math.min(credit, amt);
      credit -= used;
      if (amt - used > 0.5) unpaid.push({ date: d.date, qty: Number(d.qty), due: amt - used });
    });
    const outstanding = unpaid.reduce(function (s, u) { return s + u.due; }, 0);
    const days = unpaid.length ? Math.round((new Date(today) - new Date(unpaid[0].date)) / dayMs) : 0;
    const limit = Number(c.creditLimit) || 0;
    const maxDays = Number(c.maxDays) || defMax;
    const reasons = [];
    if (limit > 0 && outstanding >= limit) reasons.push('outstanding reached the limit of Rs ' + limit);
    if (outstanding > 0 && days >= maxDays) reasons.push('oldest bill is ' + days + ' days old');
    return { c: c, unpaid: unpaid, outstanding: outstanding, days: days, reasons: reasons };
  });
}

function dailyCheck() {
  const rows = duesFor_();
  const owner = ownerEmail_();
  const over = rows.filter(function (r) { return r.reasons.length; });
  over.forEach(function (r) {
    if (!r.c.email) return;
    const lines = r.unpaid.map(function (u) { return '  ' + u.date + '  -  ' + u.qty + ' kg  -  Rs ' + Math.round(u.due); });
    const body = ['Dear ' + r.c.name + ' team,', '',
      'This is a gentle reminder that the following idli batter invoices are still open with ' + COMPANY + ':', ''
    ].concat(lines).concat(['', 'Total outstanding: Rs ' + Math.round(r.outstanding), '',
      'Kindly arrange the payment at the earliest by cash, UPI or bank transfer. If you have already paid, please ignore this message.', '',
      'Thank you for your continued business.', '', 'Warm regards,', 'Accounts - ' + COMPANY]).join('\n');
    try {
      MailApp.sendEmail({ to: r.c.email, cc: owner || undefined, subject: 'Payment reminder: Rs ' + Math.round(r.outstanding) + ' outstanding | ' + COMPANY, body: body, htmlBody: html_(body), name: COMPANY + ' Accounts' });
    } catch (e) { Logger.log('Mail failed for ' + r.c.name + ': ' + e); }
  });
  if (owner) {
    const total = rows.reduce(function (s, r) { return s + r.outstanding; }, 0);
    const text = 'Daily dues summary\n\nTotal outstanding: Rs ' + Math.round(total) + '\nCustomers over limit: ' + over.length + '\n\n' +
      over.map(function (r) { return '- ' + r.c.name + ': Rs ' + Math.round(r.outstanding) + ' (' + r.reasons.join('; ') + ')'; }).join('\n');
    MailApp.sendEmail({ to: owner, subject: COMPANY + ' daily dues summary - ' + over.length + ' over limit', body: text, name: COMPANY + ' Ledger' });
  }
}
