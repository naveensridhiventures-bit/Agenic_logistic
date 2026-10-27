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
const REMIND_HOUR = 9; // daily automatic check runs around this hour (script time zone)

const SCHEMA = {
  customers: { tab: 'Customers', cols: ['id', 'name', 'area', 'phone', 'email', 'rate', 'creditLimit', 'maxDays', 'active'], text: ['id', 'phone'] },
  deliveries: { tab: 'Deliveries', cols: ['id', 'date', 'customerId', 'customerName', 'qty', 'rate', 'cost', 'amount', 'note'], text: ['id', 'date', 'customerId'] },
  costs: { tab: 'DayCosts', cols: ['id', 'date', 'driver', 'diesel', 'porter', 'other', 'porterBooked', 'note'], text: ['id', 'date'] },
  payments: { tab: 'Payments', cols: ['id', 'date', 'customerId', 'customerName', 'amount', 'mode', 'note'], text: ['id', 'date', 'customerId'] },
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
    check_(req.key);
    switch (req.action) {
      case 'upsert': upsert_(req.sheet, req.row); break;
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
  ['customers', 'deliveries', 'costs', 'payments'].forEach(function (k) { out[k] = read_(k); });
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
  const deliveries = read_('deliveries');
  const payments = read_('payments');
  const settings = getAll_().settings;
  const defMax = Number(settings.maxUnpaidDays) || 3;
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
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
