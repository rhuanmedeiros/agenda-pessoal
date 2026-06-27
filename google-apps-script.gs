/**
 * Agenda Pessoal — Backend de sincronização (Google Apps Script)
 * ----------------------------------------------------------------
 * Versão LOSSLESS: guarda os dados como JSON puro numa aba oculta `_data`
 * (fonte de verdade do sync — nunca descarta campos novos, incluindo a
 * descrição "o que foi feito no dia" e os novos campos da obra), e mantém
 * abas legíveis `Servicos` e `Eventos` só para você visualizar.
 *
 * COMO PUBLICAR:
 * 1. Abra a planilha → Extensões → Apps Script.
 * 2. Apague o código antigo, cole este e Salve.
 * 3. Implantar → Gerenciar implantações → (ícone de lápis/Editar) →
 *    Versão: "Nova versão" → Implantar.  (A URL /exec continua a mesma.)
 * 4. No app, no celular que tiver os dados mais completos, toque em
 *    "Sincronizar". Isso grava todos os dados no backend novo.
 *
 * Protocolo:
 *   GET  -> { status:'success', events:{...}, services:{...} }
 *   POST -> body JSON { events:{...}, services:{...} }  (text/plain)
 *        -> { status:'success' }
 */

var DATA_SHEET = '_data';
var EVENTS_KEY = 'A1'; // JSON.stringify(events)
var SERVICES_KEY = 'A2'; // JSON.stringify(services)

function getDataSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DATA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DATA_SHEET);
    sh.getRange(EVENTS_KEY).setValue('{}');
    sh.getRange(SERVICES_KEY).setValue('{}');
    sh.hideSheet();
  }
  return sh;
}

function readStore_() {
  var sh = getDataSheet_();
  var events = {};
  var services = {};
  try { events = JSON.parse(sh.getRange(EVENTS_KEY).getValue() || '{}'); } catch (e) { events = {}; }
  try { services = JSON.parse(sh.getRange(SERVICES_KEY).getValue() || '{}'); } catch (e) { services = {}; }
  return { events: events, services: services };
}

function writeStore_(events, services) {
  var sh = getDataSheet_();
  sh.getRange(EVENTS_KEY).setValue(JSON.stringify(events || {}));
  sh.getRange(SERVICES_KEY).setValue(JSON.stringify(services || {}));
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  try {
    var store = readStore_();
    return json_({ status: 'success', events: store.events, services: store.services });
  } catch (err) {
    return json_({ status: 'error', message: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    var events = body.events || {};
    var services = body.services || {};

    writeStore_(events, services);
    renderReadableTabs_(events, services);

    return json_({ status: 'success' });
  } catch (err) {
    return json_({ status: 'error', message: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/**
 * Reescreve as abas legíveis Servicos e Eventos a partir do JSON.
 * Apenas para leitura humana — o app nunca lê destas abas.
 */
function renderReadableTabs_(events, services) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Servicos ---
  var srvSheet = ss.getSheetByName('Servicos') || ss.insertSheet('Servicos');
  srvSheet.clearContents();
  var srvHeader = ['id', 'cliente', 'endereco', 'contato', 'observacoes', 'valor', 'valor_recebido', 'status', 'atualizado_em'];
  var srvRows = [srvHeader];
  Object.keys(services).forEach(function (id) {
    var s = services[id] || {};
    if (s.status === 'deleted') return;
    srvRows.push([
      s.id || id,
      s.client || '',
      s.address || '',
      s.contact || '',
      s.notes || s.description || '',
      s.value || 0,
      s.valueReceived || 0,
      s.status || '',
      s.updatedAt ? new Date(s.updatedAt) : ''
    ]);
  });
  srvSheet.getRange(1, 1, srvRows.length, srvHeader.length).setValues(srvRows);

  // --- Eventos (dias) ---
  var evSheet = ss.getSheetByName('Eventos') || ss.insertSheet('Eventos');
  evSheet.clearContents();
  var evHeader = ['data', 'tipo', 'servico_id', 'cliente', 'o_que_foi_feito', 'ajudante', 'diaria_ajudante', 'atualizado_em'];
  var evRows = [evHeader];
  Object.keys(events).sort().forEach(function (dateStr) {
    var ev = events[dateStr] || {};
    if (ev.type === 'deleted') return;
    var clientName = '';
    if (ev.serviceId && services[ev.serviceId]) clientName = services[ev.serviceId].client || '';
    var helperName = '';
    var helperRate = '';
    if (ev.helper) {
      helperName = ev.helper.name === 'father' ? 'Pai' : (ev.helper.name || 'Ajudante');
      helperRate = ev.helper.rate || '';
    }
    evRows.push([
      dateStr,
      ev.type || '',
      ev.serviceId || '',
      clientName,
      ev.description || '',
      helperName,
      helperRate,
      ev.updatedAt ? new Date(ev.updatedAt) : ''
    ]);
  });
  evSheet.getRange(1, 1, evRows.length, evHeader.length).setValues(evRows);
}
