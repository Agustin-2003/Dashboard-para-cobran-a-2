
// DASHBOARD DE COBRANÇA — v6.0 FINAL
// Google Apps Script — Code.gs
// ================================================================
// ✅ NEGOCIADO = PAGO (automaticamente contabilizado)
// ✅ Sistema de somas revisado e validado
// ✅ Bloqueio automático às 18:40 com snapshot diário
// ✅ Gestão dinâmica de usuários
// ✅ Tab Negociação com dados reais
// ✅ Histórico dinâmico preservado
// ================================================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Dashboard de Cobrança')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURAÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════
var CONFIG = {
  CONSULTORES_INC:  ['MIRELA', 'STÉFANO'],
  CONSULTORES_COND: ['RHOAN'],
  FAIXAS: ['Flash', 'ATÉ 30', '31 A 60', '61 A 90', '91+'],
  STATUS_EXCLUIDOS: [
    'NÃO CONTABILIZAR', 'NAO CONTABILIZAR',
    'SOL. CANCELAMENTO', 'SOLICITAÇÃO DE CANCELAMENTO',
    'CANCELADO', 'CANCELADA'
  ],
  // ✅ Status que contam como PAGO (incluindo NEGOCIADO)
  STATUS_PAGO: ['PAGO', 'NEGOCIADO'],
  HEADER_ROW_CONSULTOR: 3,
  SNAPSHOT_KEY_PREFIX: 'SNAPSHOT_',
  BLOCKED_AFTER_HOUR: 18,
  BLOCKED_AFTER_MIN:  40
};

// ═══════════════════════════════════════════════════════════════
// LOGIN E GESTÃO DE USUÁRIOS
// ═══════════════════════════════════════════════════════════════

// Usuários FIXOS (não podem ser removidos)
var USER_META_FIXED = {
  'MIRELA':  { role: 'consultor', name: 'MIRELA',   sheet: 'MIRELA',   gender: 'F', base: 'Incorporadora' },
  'STEFANO': { role: 'consultor', name: 'STÉFANO',  sheet: 'STÉFANO',  gender: 'M', base: 'Incorporadora' },
  'RHOAN':   { role: 'consultor', name: 'RHOAN',    sheet: 'RHOAN',    gender: 'M', base: 'Condomínio'    },
  'ADM':     { role: 'admin',     name: 'ADM',      sheet: null,       gender: 'M', base: null            }
};

// Retorna todos os usuários (fixos + dinâmicos)
function getAllUserMeta() {
  var meta = {};
  Object.keys(USER_META_FIXED).forEach(function(k) { meta[k] = USER_META_FIXED[k]; });
  var props = PropertiesService.getScriptProperties();
  var dynStr = props.getProperty('DYNAMIC_USERS');
  if (dynStr) {
    try {
      var dyn = JSON.parse(dynStr);
      Object.keys(dyn).forEach(function(k) { meta[k] = dyn[k]; });
    } catch(e) {}
  }
  return meta;
}

function doLoginServer(user, pass) {
  var u    = String(user || '').trim().toUpperCase();
  var meta = getAllUserMeta();
  var m    = meta[u];
  if (!m) return { ok: false };

  var props  = PropertiesService.getScriptProperties();
  var stored = props.getProperty('PASS_' + u);
  var theme  = props.getProperty('THEME_' + u) || 'dark';

  if (!stored) return { ok: false, error: 'Senha não configurada. Execute setupPasswords()' };
  if (stored !== pass) return { ok: false };

  return {
    ok: true, role: m.role, name: m.name,
    sheet: m.sheet, gender: m.gender, base: m.base,
    login: u, theme: theme
  };
}

function updatePassword(user, newPass) {
  var u = String(user || '').trim().toUpperCase();
  var all = getAllUserMeta();
  if (!all[u]) return { ok: false, msg: 'Usuário inválido' };
  PropertiesService.getScriptProperties().setProperty('PASS_' + u, newPass);
  return { ok: true, msg: 'Senha atualizada' };
}

function updateTheme(user, theme) {
  var u = String(user || '').trim().toUpperCase();
  PropertiesService.getScriptProperties().setProperty('THEME_' + u, theme);
  return { ok: true };
}

function resetAnyUserPassword(login, newPass) {
  var u = String(login || '').trim().toUpperCase();
  var all = getAllUserMeta();
  if (!all[u]) return { ok: false, msg: 'Usuário não encontrado' };
  if (!newPass || String(newPass).trim().length < 4) return { ok: false, msg: 'Senha muito curta' };
  PropertiesService.getScriptProperties().setProperty('PASS_' + u, String(newPass).trim());
  return { ok: true, msg: 'Senha de ' + u + ' redefinida' };
}

// Gestão dinâmica de usuários
function createDynamicUser(login, name, role) {
  var u = String(login || '').trim().toUpperCase().replace(/\s+/g,'');
  if (!u || !name) return { ok: false, msg: 'Login e nome obrigatórios' };
  var all = getAllUserMeta();
  if (all[u]) return { ok: false, msg: 'Login já existe' };

  var props = PropertiesService.getScriptProperties();
  var dynStr = props.getProperty('DYNAMIC_USERS');
  var dyn = {};
  if (dynStr) { try { dyn = JSON.parse(dynStr); } catch(e) {} }

  dyn[u] = {
    role:    role || 'consultor',
    name:    String(name).trim(),
    sheet:   null,
    gender:  null,
    base:    null,
    isDynamic: true
  };

  props.setProperty('DYNAMIC_USERS', JSON.stringify(dyn));
  var tempPass = u + '@Schw2025';
  props.setProperty('PASS_' + u, tempPass);
  props.setProperty('THEME_' + u, 'dark');

  return { ok: true, msg: 'Usuário ' + u + ' criado. Senha: ' + tempPass };
}

function deleteDynamicUser(login) {
  var u = String(login || '').trim().toUpperCase();
  if (USER_META_FIXED[u]) return { ok: false, msg: 'Usuários fixos não podem ser removidos' };

  var props = PropertiesService.getScriptProperties();
  var dynStr = props.getProperty('DYNAMIC_USERS');
  if (!dynStr) return { ok: false, msg: 'Usuário não encontrado' };

  var dyn = {};
  try { dyn = JSON.parse(dynStr); } catch(e) {}
  if (!dyn[u]) return { ok: false, msg: 'Usuário não encontrado' };

  delete dyn[u];
  props.setProperty('DYNAMIC_USERS', JSON.stringify(dyn));
  props.deleteProperty('PASS_' + u);
  props.deleteProperty('THEME_' + u);

  return { ok: true, msg: 'Usuário ' + u + ' removido' };
}

function listAllUsers() {
  var all = getAllUserMeta();
  var props = PropertiesService.getScriptProperties();
  var dynStr = props.getProperty('DYNAMIC_USERS') || '{}';
  var dyn = {};
  try { dyn = JSON.parse(dynStr); } catch(e) {}

  return Object.keys(all).map(function(k) {
    return {
      login: k,
      name: all[k].name,
      role: all[k].role,
      isDynamic: !!dyn[k]
    };
  });
}

function getAdminConfig() {
  var props  = PropertiesService.getScriptProperties();
  var all    = getAllUserMeta();
  var config = {};
  Object.keys(all).forEach(function(u) {
    config[u] = {
      name:  all[u].name,
      role:  all[u].role,
      theme: props.getProperty('THEME_' + u) || 'dark'
    };
  });
  return config;
}

// ⚙️ SENHAS INICIAIS - Execute UMA VEZ no editor
function setupPasswords() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('PASS_MIRELA',  'M!r3la@Schw#2025');
  p.setProperty('PASS_STEFANO', 'St3f@n0#Schw!25');
  p.setProperty('PASS_RHOAN',   'Rh04n.Cond@25!');
  p.setProperty('PASS_ADM',     'Schw@nck.Adm#25!');
  Logger.log('✅ Senhas cadastradas');
}

// ═══════════════════════════════════════════════════════════════
// BLOQUEIO AUTOMÁTICO ÀS 18:40
// ═══════════════════════════════════════════════════════════════

function isBlockedNow() {
  var now = new Date();
  var h   = now.getHours();
  var m   = now.getMinutes();
  return (h > CONFIG.BLOCKED_AFTER_HOUR) ||
         (h === CONFIG.BLOCKED_AFTER_HOUR && m >= CONFIG.BLOCKED_AFTER_MIN);
}

function getSnapshotKey(date) {
  var d = date || new Date();
  return CONFIG.SNAPSHOT_KEY_PREFIX +
    d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

// Salva snapshot às 18:40
function saveEndOfDaySnapshot() {
  var key       = getSnapshotKey(new Date());
  var props     = PropertiesService.getScriptProperties();
  var existing  = props.getProperty(key);

  if (existing) {
    Logger.log('⏸ Snapshot já existe: ' + key);
    return;
  }

  try {
    var data = getDashboardData();
    var snapshot = {
      savedAt:   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy 'às' HH:mm:ss"),
      blockedAt: CONFIG.BLOCKED_AFTER_HOUR + ':' + String(CONFIG.BLOCKED_AFTER_MIN).padStart(2,'0'),
      data:      data
    };
    var json = JSON.stringify(snapshot);
    if (json.length > 9000) {
      snapshot.data.multa.clientes = [];
      json = JSON.stringify(snapshot);
    }
    props.setProperty(key, json);
    Logger.log('✅ Snapshot salvo: ' + key);
  } catch(e) {
    Logger.log('❌ Erro ao salvar snapshot: ' + e.message);
  }
}

function getSnapshot(dateStr) {
  if (!dateStr) return null;
  var parts = String(dateStr).split('/');
  if (parts.length !== 3) return null;
  var key   = CONFIG.SNAPSHOT_KEY_PREFIX + parts[2] + '-' + parts[1] + '-' + parts[0];
  var raw   = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return null; }
}

function listSnapshots() {
  var props = PropertiesService.getScriptProperties();
  var all   = props.getProperties();
  var snaps = [];
  Object.keys(all).forEach(function(k) {
    if (k.indexOf(CONFIG.SNAPSHOT_KEY_PREFIX) === 0) {
      var dateRaw = k.replace(CONFIG.SNAPSHOT_KEY_PREFIX, '');
      snaps.push({ key: k, date: dateRaw });
    }
  });
  return snaps.sort(function(a,b) { return b.date.localeCompare(a.date); });
}

// ⚙️ CONFIGURAR TRIGGER DIÁRIO - Execute UMA VEZ
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'saveEndOfDaySnapshot') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('saveEndOfDaySnapshot')
    .timeBased()
    .everyDays(1)
    .atHour(18)
    .create();

  Logger.log('✅ Trigger diário configurado às 18h');
}

// ⚙️ TRIGGER DE PRECISÃO (18:40 exato)
function setupPreciseTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'checkAndSaveSnapshot') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('checkAndSaveSnapshot')
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log('✅ Trigger de precisão configurado (30min)');
}

function checkAndSaveSnapshot() {
  var now = new Date();
  var h   = now.getHours();
  var m   = now.getMinutes();
  if (h === 18 && m >= 38 && m <= 44) {
    saveEndOfDaySnapshot();
  }
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURAÇÕES E METAS
// ═══════════════════════════════════════════════════════════════

function getSystemSettings() {
  var props   = PropertiesService.getScriptProperties();
  var goalsStr = props.getProperty('SYSTEM_GOALS');
  var goals   = goalsStr ? JSON.parse(goalsStr) : {
    'Flash': 85, 'ATÉ 30': 75, '31 A 60': 60, '61 A 90': 45, '91+': 25
  };
  return { goals: goals };
}

function updateSystemSettings(settings) {
  if (settings && settings.goals) {
    PropertiesService.getScriptProperties().setProperty('SYSTEM_GOALS', JSON.stringify(settings.goals));
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES (VALIDAÇÃO DE TIPOS)
// ═══════════════════════════════════════════════════════════════

function isExcluido(status) {
  if (!status) return false;
  var s = String(status).trim().toUpperCase();
  for (var i = 0; i < CONFIG.STATUS_EXCLUIDOS.length; i++) {
    var ex = CONFIG.STATUS_EXCLUIDOS[i];
    if (s === ex || s.indexOf(ex) === 0) return true;
  }
  return false;
}

// ✅ Verifica se status conta como PAGO (inclui NEGOCIADO)
function isPago(status) {
  if (!status) return false;
  var s = String(status).trim().toUpperCase();
  for (var i = 0; i < CONFIG.STATUS_PAGO.length; i++) {
    if (s === CONFIG.STATUS_PAGO[i]) return true;
  }
  return false;
}

// ✅ Parse seguro de números
function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') {
    return isNaN(v) ? 0 : v;
  }
  var s = String(v)
    .replace(/[R$\s]/g, '')
    .trim();
  if (!s) return 0;
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.indexOf(',') > -1) {
    s = s.replace(',', '.');
  }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ✅ Arredondamento seguro
function rd(v) {
  var n = typeof v === 'number' ? v : parseNum(v);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// ✅ Soma segura
function safeAdd() {
  var total = 0;
  for (var i = 0; i < arguments.length; i++) {
    var n = parseNum(arguments[i]);
    if (!isNaN(n)) total += n;
  }
  return total;
}

function formatDate(d) {
  if (!d) return '';
  if (d instanceof Date) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return String(d);
}

function normFaixa(f) {
  var fu = String(f || '').toUpperCase().trim();
  if (fu === 'FLASH')                      return 'Flash';
  if (fu === 'ATÉ 30' || fu === 'ATE 30') return 'ATÉ 30';
  if (fu === '31 A 60')                    return '31 A 60';
  if (fu === '61 A 90')                    return '61 A 90';
  if (fu === '91+')                        return '91+';
  return null;
}

function mapCols(header) {
  var c = {
    nome:-1, faixa:-1, valor:-1, consultor:-1, status:-1,
    dataDiv:-1, dataCob:-1, vpago:-1, forma:-1, gestor:-1,
    obs:-1
  };
  header.forEach(function(h, i) {
    var hs = String(h || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (hs === 'NOME')                                                   c.nome      = i;
    if (hs === 'FAIXA')                                                  c.faixa     = i;
    if (hs === 'VALOR')                                                   c.valor     = i;
    if (hs === 'CONSULTOR')                                              c.consultor = i;
    if (hs === 'STATUS DO COBRADOR')                                     c.status    = i;
    if (hs === 'DATAINICIODIVIDA')                                       c.dataDiv   = i;
    if (hs === 'DATA DA COBRANÇA' || hs.indexOf('DATA DA COB') === 0)   c.dataCob   = i;
    if (hs === 'VALOR PAGO')                                             c.vpago     = i;
    if (hs === 'FORMA DE PAGAMENTO')                                     c.forma     = i;
    if (hs === 'STATUS DO GESTOR')                                       c.gestor    = i;
    if (hs === 'OBSERVAÇÕES' || hs === 'OBSERVACOES' || hs === 'OBS')   c.obs       = i;
  });
  return c;
}

function emptyConsultor(name) {
  var faixas = {};
  CONFIG.FAIXAS.forEach(function(f) { faixas[f] = { count: 0, total: 0, pago: 0 }; });
  return {
    total: 0, count: 0, arrecadado: 0, arrecadadoHoje: 0, arrecadadoCount: 0,
    excluidos: 0, faixas: faixas,
    multaCanc: { count: 0, total: 0, pago: 0, clientes: [] },
    negociacao: { count: 0, total: 0, pago: 0, clientes: [] },
    consultor: name || ''
  };
}

// ═══════════════════════════════════════════════════════════════
// PROCESSAMENTO PRINCIPAL (NEGOCIADO = PAGO)
// ═══════════════════════════════════════════════════════════════

function processConsultorSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return emptyConsultor(sheetName);

  var lastRow = sheet.getLastRow();
  var hRow    = CONFIG.HEADER_ROW_CONSULTOR;
  if (lastRow <= hRow) return emptyConsultor(sheetName);

  var numCols = sheet.getLastColumn();
  var header  = sheet.getRange(hRow, 1, 1, numCols).getValues()[0];
  var cols    = mapCols(header);
  var data    = sheet.getRange(hRow + 1, 1, lastRow - hRow, numCols).getValues();

  var faixas = {};
  CONFIG.FAIXAS.forEach(function(f) { faixas[f] = { count: 0, total: 0, pago: 0 }; });

  var multaCanc  = { count: 0, total: 0, pago: 0, clientes: [] };
  var negociacao = { count: 0, total: 0, pago: 0, clientes: [] };

  var total           = 0;
  var count           = 0;
  var arrecadado      = 0;
  var arrecadadoHoje  = 0;
  var arrecadadoCount = 0;
  var excluidos       = 0;

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  data.forEach(function(row) {
    var nome   = cols.nome   >= 0 ? String(row[cols.nome]   || '').trim() : '';
    if (!nome || nome.toUpperCase() === 'NOME') return;

    var status = cols.status >= 0 ? String(row[cols.status] || '').trim() : '';
    var valor  = cols.valor  >= 0 ? parseNum(row[cols.valor]) : 0;
    var faixaR = cols.faixa  >= 0 ? String(row[cols.faixa]  || '').trim() : '';
    var dCob   = cols.dataCob >= 0 ? row[cols.dataCob] : null;

    // ✅ NEGOCIADO: Se status é PAGO ou NEGOCIADO e vpago está vazio, usa valor total
    var vpagoRaw = cols.vpago >= 0 ? parseNum(row[cols.vpago]) : 0;
    var vpago    = vpagoRaw;
    if (isPago(status) && vpago <= 0) {
      vpago = valor;
    }

    var isToday = false;
    if (dCob instanceof Date) {
      var d = new Date(dCob);
      d.setHours(0, 0, 0, 0);
      if (d.getTime() === today.getTime()) isToday = true;
    } else if (typeof dCob === 'string' && dCob.indexOf('/') > -1) {
      var p = dCob.split('/');
      if (p.length === 3) {
        var dObj = new Date(
          parseInt(p[2],10),
          parseInt(p[1],10) - 1,
          parseInt(p[0],10)
        );
        dObj.setHours(0, 0, 0, 0);
        if (dObj.getTime() === today.getTime()) isToday = true;
      }
    }

    var forma    = cols.forma >= 0 ? String(row[cols.forma]    || '').trim() : '';
    var dataDiv  = cols.dataDiv >= 0 ? row[cols.dataDiv] : null;
    var obs      = cols.obs    >= 0 ? String(row[cols.obs]     || '').trim() : '';
    var consultorNome = cols.consultor >= 0 ? String(row[cols.consultor] || '').trim() : sheetName;

    // MULTA DE CANCELAMENTO
    if (faixaR.toUpperCase() === 'MULTA') {
      if (isExcluido(status)) { excluidos++; return; }

      multaCanc.count += 1;
      multaCanc.total  = safeAdd(multaCanc.total, valor);

      if (vpago > 0) {
        multaCanc.pago   = safeAdd(multaCanc.pago, vpago);
        arrecadado       = safeAdd(arrecadado, vpago);
        arrecadadoCount += 1;
        if (isToday) arrecadadoHoje = safeAdd(arrecadadoHoje, vpago);
      }

      multaCanc.clientes.push({
        nome: nome, valor: rd(valor), vpago: rd(vpago),
        status: status, consultor: sheetName,
        isNegociado: isPago(status) && vpagoRaw <= 0
      });
      count += 1;
      return;
    }

    // EXCLUÍDOS
    if (isExcluido(status)) { excluidos++; return; }

    var fN = normFaixa(faixaR);

    // ✅ NEGOCIAÇÃO: Registrar quando status for NEGOCIADO
    if (status.toUpperCase() === 'NEGOCIADO') {
      negociacao.count += 1;
      negociacao.total  = safeAdd(negociacao.total, valor);
      negociacao.pago   = safeAdd(negociacao.pago, vpago);
      negociacao.clientes.push({
        nome: nome, faixa: fN || faixaR, valor: rd(valor), vpago: rd(vpago),
        status: status, consultor: consultorNome || sheetName,
        formaPagamento: forma, observacoes: obs,
        dataDiv: dataDiv ? formatDate(dataDiv) : ''
      });
    }

    // FAIXAS
    if (fN) {
      faixas[fN].count += 1;
      faixas[fN].total  = safeAdd(faixas[fN].total, valor);
    }

    // ARRECADADO
    if (vpago > 0) {
      arrecadado       = safeAdd(arrecadado, vpago);
      arrecadadoCount += 1;
      if (fN) faixas[fN].pago = safeAdd(faixas[fN].pago, vpago);
      if (isToday) arrecadadoHoje = safeAdd(arrecadadoHoje, vpago);
    }

    total  = safeAdd(total, valor);
    count += 1;
  });

  // Arredondar totais
  CONFIG.FAIXAS.forEach(function(f) {
    faixas[f].total = rd(faixas[f].total);
    faixas[f].pago  = rd(faixas[f].pago);
  });
  multaCanc.total  = rd(multaCanc.total);
  multaCanc.pago   = rd(multaCanc.pago);
  negociacao.total = rd(negociacao.total);
  negociacao.pago  = rd(negociacao.pago);

  return {
    total:           rd(total),
    count:           count,
    arrecadado:      rd(arrecadado),
    arrecadadoHoje:  rd(arrecadadoHoje),
    arrecadadoCount: arrecadadoCount,
    excluidos:       excluidos,
    faixas:          faixas,
    multaCanc:       multaCanc,
    negociacao:      negociacao,
    consultor:       sheetName
  };
}

// ═══════════════════════════════════════════════════════════════
// MERGE E BUILD
// ═══════════════════════════════════════════════════════════════

function mergeConsultores(list) {
  var m = {
    total: 0, count: 0, arrecadado: 0,
    arrecadadoCount: 0, excluidos: 0, faixas: {}
  };
  CONFIG.FAIXAS.forEach(function(f) {
    m.faixas[f] = { count: 0, total: 0, pago: 0 };
  });

  list.forEach(function(c) {
    if (!c) return;
    m.total           = safeAdd(m.total, c.total);
    m.count          += (c.count || 0);
    m.arrecadado      = safeAdd(m.arrecadado, c.arrecadado);
    m.arrecadadoCount += (c.arrecadadoCount || 0);
    m.excluidos      += (c.excluidos || 0);

    CONFIG.FAIXAS.forEach(function(f) {
      if (c.faixas && c.faixas[f]) {
        m.faixas[f].count += (c.faixas[f].count || 0);
        m.faixas[f].total  = safeAdd(m.faixas[f].total, c.faixas[f].total);
        m.faixas[f].pago   = safeAdd(m.faixas[f].pago,  c.faixas[f].pago);
      }
    });
  });

  m.total      = rd(m.total);
  m.arrecadado = rd(m.arrecadado);
  CONFIG.FAIXAS.forEach(function(f) {
    m.faixas[f].total = rd(m.faixas[f].total);
    m.faixas[f].pago  = rd(m.faixas[f].pago);
  });
  return m;
}

function buildMultaFromConsultores(list) {
  var total = 0, count = 0, pago = 0;
  var consultores = {};
  var clientes    = [];

  list.forEach(function(c) {
    if (!c || !c.multaCanc) return;
    var m = c.multaCanc;
    total = safeAdd(total, m.total);
    pago  = safeAdd(pago,  m.pago);
    count += (m.count || 0);

    var key = String(c.consultor || '').toUpperCase();
    if (!consultores[key]) consultores[key] = { count: 0, total: 0, pago: 0 };
    consultores[key].count += (m.count || 0);
    consultores[key].total  = safeAdd(consultores[key].total, m.total);
    consultores[key].pago   = safeAdd(consultores[key].pago,  m.pago);

    if (m.clientes) {
      m.clientes.forEach(function(cl) { clientes.push(cl); });
    }
  });

  Object.keys(consultores).forEach(function(k) {
    consultores[k].total = rd(consultores[k].total);
    consultores[k].pago  = rd(consultores[k].pago);
  });

  return {
    total: rd(total), pago: rd(pago), count: count,
    consultores: consultores, clientes: clientes
  };
}

// ═══════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL getDashboardData
// ═══════════════════════════════════════════════════════════════

function getDashboardData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var mirela  = processConsultorSheet(ss, 'MIRELA');
  var stefano = processConsultorSheet(ss, 'STÉFANO');
  var rhoan   = processConsultorSheet(ss, 'RHOAN');

  var inc   = mergeConsultores([mirela, stefano]);
  var cond  = mergeConsultores([rhoan]);
  var multa = buildMultaFromConsultores([mirela, stefano, rhoan]);

  var blocked    = isBlockedNow();
  var snapKey    = getSnapshotKey(new Date());
  var hasSnapshot = !!PropertiesService.getScriptProperties().getProperty(snapKey);

  var updated = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(),
    "dd/MM/yyyy 'às' HH:mm:ss"
  );

  return {
    inc:  inc,
    cond: cond,
    multa: multa,
    consultores: {
      MIRELA: {
        arrecadado:      mirela.arrecadado,
        arrecadadoHoje:  mirela.arrecadadoHoje,
        arrecadadoCount: mirela.arrecadadoCount,
        total:           mirela.total,
        count:           mirela.count,
        excluidos:       mirela.excluidos,
        faixas:          mirela.faixas,
        multaCanc:       mirela.multaCanc,
        negociacao:      mirela.negociacao
      },
      'STÉFANO': {
        arrecadado:      stefano.arrecadado,
        arrecadadoHoje:  stefano.arrecadadoHoje,
        arrecadadoCount: stefano.arrecadadoCount,
        total:           stefano.total,
        count:           stefano.count,
        excluidos:       stefano.excluidos,
        faixas:          stefano.faixas,
        multaCanc:       stefano.multaCanc,
        negociacao:      stefano.negociacao
      },
      RHOAN: {
        arrecadado:      rhoan.arrecadado,
        arrecadadoHoje:  rhoan.arrecadadoHoje,
        arrecadadoCount: rhoan.arrecadadoCount,
        total:           rhoan.total,
        count:           rhoan.count,
        excluidos:       rhoan.excluidos,
        faixas:          rhoan.faixas,
        multaCanc:       rhoan.multaCanc,
        negociacao:      rhoan.negociacao
      }
    },
    blockStatus: {
      isBlocked:   blocked,
      hasSnapshot: hasSnapshot,
      snapKey:     snapKey
    },
    meta: {
      name:    ss.getName(),
      updated: updated
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// CONSULTA DE CLIENTES POR FAIXA
// ═══════════════════════════════════════════════════════════════

function getClientesByFaixa(base, faixa) {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var list    = base === 'inc' ? CONFIG.CONSULTORES_INC : CONFIG.CONSULTORES_COND;
  var results = [];

  list.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var hRow    = CONFIG.HEADER_ROW_CONSULTOR;
    if (lastRow <= hRow) return;
    var numCols = sheet.getLastColumn();
    var header  = sheet.getRange(hRow, 1, 1, numCols).getValues()[0];
    var cols    = mapCols(header);
    var data    = sheet.getRange(hRow + 1, 1, lastRow - hRow, numCols).getValues();

    data.forEach(function(row) {
      var nome = cols.nome >= 0 ? String(row[cols.nome] || '').trim() : '';
      if (!nome || nome.toUpperCase() === 'NOME') return;

      var status = cols.status >= 0 ? String(row[cols.status] || '').trim() : '';
      if (isExcluido(status)) return;

      var faixaR = cols.faixa >= 0 ? String(row[cols.faixa] || '').trim() : '';
      if (faixaR.toUpperCase() === 'MULTA') return;

      var fN = normFaixa(faixaR);
      if (faixa && fN !== faixa) return;

      var valor    = cols.valor  >= 0 ? parseNum(row[cols.valor])  : 0;
      var vpagoRaw = cols.vpago  >= 0 ? parseNum(row[cols.vpago])  : 0;
      var vpago    = vpagoRaw;
      if (isPago(status) && vpago <= 0) vpago = valor;

      results.push({
        nome:      nome,
        faixa:     fN || faixaR,
        valor:     rd(valor),
        status:    status,
        vpago:     rd(vpago),
        dataDiv:   cols.dataDiv >= 0 && row[cols.dataDiv] ? formatDate(row[cols.dataDiv]) : '',
        dataCob:   cols.dataCob >= 0 && row[cols.dataCob] ? formatDate(row[cols.dataCob]) : '',
        formaPag:  cols.forma   >= 0 ? String(row[cols.forma]   || '').trim() : '',
        consultor: cols.consultor >= 0 ? String(row[cols.consultor] || '').trim() : sheetName,
        isNegociado: status.toUpperCase() === 'NEGOCIADO'
      });
    });
  });

  results.sort(function(a, b) { return a.nome.localeCompare(b.nome); });
  return results;
}

function getConsultorClientes(sheetName, faixa) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var hRow    = CONFIG.HEADER_ROW_CONSULTOR;
  if (lastRow <= hRow) return [];
  var numCols = sheet.getLastColumn();
  var header  = sheet.getRange(hRow, 1, 1, numCols).getValues()[0];
  var cols    = mapCols(header);
  var data    = sheet.getRange(hRow + 1, 1, lastRow - hRow, numCols).getValues();
  var results = [];

  data.forEach(function(row) {
    var nome = cols.nome >= 0 ? String(row[cols.nome] || '').trim() : '';
    if (!nome || nome.toUpperCase() === 'NOME') return;

    var status = cols.status >= 0 ? String(row[cols.status] || '').trim() : '';
    if (isExcluido(status)) return;

    var faixaR = cols.faixa >= 0 ? String(row[cols.faixa] || '').trim() : '';
    var fN     = faixaR.toUpperCase() === 'MULTA' ? '91+' : normFaixa(faixaR);
    if (faixa && fN !== faixa) return;

    var valor    = cols.valor  >= 0 ? parseNum(row[cols.valor])  : 0;
    var vpagoRaw = cols.vpago  >= 0 ? parseNum(row[cols.vpago])  : 0;
    var vpago    = vpagoRaw;
    if (isPago(status) && vpago <= 0) vpago = valor;

    results.push({
      nome:     nome,
      faixa:    fN || faixaR,
      valor:    rd(valor),
      status:   status,
      vpago:    rd(vpago),
      dataDiv:  cols.dataDiv >= 0 && row[cols.dataDiv] ? formatDate(row[cols.dataDiv]) : '',
      dataCob:  cols.dataCob >= 0 && row[cols.dataCob] ? formatDate(row[cols.dataCob]) : '',
      formaPag: cols.forma   >= 0 ? String(row[cols.forma]   || '').trim() : '',
      consultor: sheetName,
      isNegociado: status.toUpperCase() === 'NEGOCIADO'
    });
  });

  results.sort(function(a, b) { return a.nome.localeCompare(b.nome); });
  return results;
}

// ═══════════════════════════════════════════════════════════════
// NEGOCIAÇÃO
// ═══════════════════════════════════════════════════════════════

function getNegociacaoData(userLogin) {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var all     = CONFIG.CONSULTORES_INC.concat(CONFIG.CONSULTORES_COND);
  var results = [];

  all.forEach(function(sheetName) {
    if (userLogin && userLogin !== 'ADM') {
      var meta = getAllUserMeta();
      var found = false;
      Object.keys(meta).forEach(function(k) {
        if (meta[k].sheet === sheetName && k === userLogin) found = true;
      });
      if (!found) return;
    }

    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var hRow    = CONFIG.HEADER_ROW_CONSULTOR;
    if (lastRow <= hRow) return;
    var numCols = sheet.getLastColumn();
    var header  = sheet.getRange(hRow, 1, 1, numCols).getValues()[0];
    var cols    = mapCols(header);
    var data    = sheet.getRange(hRow + 1, 1, lastRow - hRow, numCols).getValues();

    data.forEach(function(row) {
      var nome   = cols.nome   >= 0 ? String(row[cols.nome]   || '').trim() : '';
      if (!nome || nome.toUpperCase() === 'NOME') return;

      var status = cols.status >= 0 ? String(row[cols.status] || '').trim() : '';
      if (status.toUpperCase() !== 'NEGOCIADO') return;

      var faixaR = cols.faixa  >= 0 ? String(row[cols.faixa]  || '').trim() : '';
      var fN     = faixaR.toUpperCase() === 'MULTA' ? '91+' : (normFaixa(faixaR) || faixaR);
      var valor  = cols.valor  >= 0 ? parseNum(row[cols.valor]) : 0;
      var vpagoR = cols.vpago  >= 0 ? parseNum(row[cols.vpago]) : 0;
      var vpago  = vpagoR > 0 ? vpagoR : valor;
      var forma  = cols.forma  >= 0 ? String(row[cols.forma]  || '').trim() : '';
      var obs    = cols.obs    >= 0 ? String(row[cols.obs]    || '').trim() : '';
      var dataDiv = cols.dataDiv >= 0 ? row[cols.dataDiv] : null;

      results.push({
        nome:           nome,
        faixa:          fN,
        valor:          rd(valor),
        vpago:          rd(vpago),
        status:         status,
        consultor:      sheetName,
        formaPagamento: forma,
        observacoes:    obs,
        dataDiv:        dataDiv ? formatDate(dataDiv) : ''
      });
    });
  });

  results.sort(function(a, b) { return a.nome.localeCompare(b.nome); });
  return results;
}

// ═══════════════════════════════════════════════════════════════
// HISTÓRICO DINÂMICO
// ═══════════════════════════════════════════════════════════════

function getHistoryData(userLogin) {
  var ss          = SpreadsheetApp.getActiveSpreadsheet();
  var consultores = ['MIRELA', 'STÉFANO', 'RHOAN'];
  var historyMap  = {};
  var USER_META   = getAllUserMeta();

  consultores.forEach(function(cName) {
    var login = '';
    Object.keys(USER_META).forEach(function(k) {
      if (USER_META[k].name === cName) login = k;
    });

    if (userLogin !== 'ADM' && login !== userLogin) return;

    var sheet = ss.getSheetByName(cName);
    if (!sheet) return;

    var lastRow = sheet.getLastRow();
    var hRow    = CONFIG.HEADER_ROW_CONSULTOR;
    if (lastRow <= hRow) return;

    var header = sheet.getRange(hRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    var cols   = mapCols(header);
    var data   = sheet.getRange(hRow + 1, 1, lastRow - hRow, sheet.getLastColumn()).getValues();

    data.forEach(function(row) {
      var status = cols.status >= 0 ? String(row[cols.status] || '').trim() : '';
      if (isExcluido(status)) return;

      var dCob   = cols.dataCob >= 0 ? row[cols.dataCob] : null;
      var vpagoR = cols.vpago   >= 0 ? parseNum(row[cols.vpago]) : 0;
      var valor  = cols.valor   >= 0 ? parseNum(row[cols.valor]) : 0;

      var vpago = vpagoR;
      if (isPago(status) && vpago <= 0) vpago = valor;

      var faixaR = cols.faixa >= 0 ? String(row[cols.faixa] || '').trim() : '';
      var fN     = faixaR.toUpperCase() === 'MULTA' ? '91+' : (normFaixa(faixaR) || faixaR);

      if (vpago > 0 && dCob) {
        var dateStr = '';
        var ts      = 0;

        if (dCob instanceof Date) {
          var d = new Date(dCob);
          d.setHours(0, 0, 0, 0);
          dateStr = formatDate(d);
          ts      = d.getTime();
        } else if (typeof dCob === 'string' && dCob.indexOf('/') > -1) {
          var p = dCob.split('/');
          if (p.length === 3) {
            var dObj = new Date(parseInt(p[2],10), parseInt(p[1],10)-1, parseInt(p[0],10));
            dObj.setHours(0, 0, 0, 0);
            dateStr = formatDate(dObj);
            ts      = dObj.getTime();
          }
        }

        if (dateStr && ts > 0) {
          var key = dateStr + '_' + login;
          if (!historyMap[key]) {
            historyMap[key] = {
              data:            dateStr,
              timestamp:       ts,
              login:           login,
              nome:            cName,
              arrecadadoHoje:  0,
              faixas:          {}
            };
          }
          historyMap[key].arrecadadoHoje = safeAdd(historyMap[key].arrecadadoHoje, vpago);
          if (fN) {
            if (!historyMap[key].faixas[fN]) historyMap[key].faixas[fN] = { pago: 0 };
            historyMap[key].faixas[fN].pago = safeAdd(historyMap[key].faixas[fN].pago, vpago);
          }
        }
      }
    });
  });

  var results = [];
  Object.keys(historyMap).forEach(function(k) {
    historyMap[k].arrecadadoHoje = rd(historyMap[k].arrecadadoHoje);
    Object.keys(historyMap[k].faixas).forEach(function(f) {
      historyMap[k].faixas[f].pago = rd(historyMap[k].faixas[f].pago);
    });
    results.push(historyMap[k]);
  });

  return results.sort(function(a, b) { return b.timestamp - a.timestamp; });
}

// ═══════════════════════════════════════════════════════════════
// BUSCA DE CLIENTES
// ═══════════════════════════════════════════════════════════════

function searchClientes(query) {
  if (!query || String(query).trim().length < 2) return [];
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var q       = String(query).trim().toUpperCase();
  var results = [];
  var all     = CONFIG.CONSULTORES_INC.concat(CONFIG.CONSULTORES_COND);

  all.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var hRow    = CONFIG.HEADER_ROW_CONSULTOR;
    if (lastRow <= hRow) return;
    var numCols = sheet.getLastColumn();
    var header  = sheet.getRange(hRow, 1, 1, numCols).getValues()[0];
    var cols    = mapCols(header);
    var data    = sheet.getRange(hRow + 1, 1, lastRow - hRow, numCols).getValues();
    var base    = CONFIG.CONSULTORES_INC.indexOf(sheetName) >= 0 ? 'Incorporadora' : 'Condomínio';

    data.forEach(function(row) {
      var nome = cols.nome >= 0 ? String(row[cols.nome] || '').trim() : '';
      if (!nome || nome.toUpperCase().indexOf(q) < 0) return;

      var status = cols.status >= 0 ? String(row[cols.status] || '').trim() : '';
      if (isExcluido(status)) return;

      var valor  = cols.valor  >= 0 ? parseNum(row[cols.valor]) : 0;
      var vpagoR = cols.vpago  >= 0 ? parseNum(row[cols.vpago]) : 0;
      var vpago  = vpagoR;
      if (isPago(status) && vpago <= 0) vpago = valor;

      results.push({
        nome:      nome,
        base:      base,
        consultor: cols.consultor >= 0 ? String(row[cols.consultor] || '').trim() : sheetName,
        faixa:     normFaixa(cols.faixa >= 0 ? String(row[cols.faixa] || '').trim() : '') || '',
        valor:     rd(valor),
        status:    status,
        vpago:     rd(vpago),
        dataDiv:   cols.dataDiv >= 0 && row[cols.dataDiv] ? formatDate(row[cols.dataDiv]) : '',
        formaPag:  cols.forma   >= 0 ? String(row[cols.forma] || '').trim() : '',
        isNegociado: status.toUpperCase() === 'NEGOCIADO'
      });
    });
  });

  return results.slice(0, 60);
}

function searchConsultorClientes(sheetName, query) {
  if (!query || String(query).trim().length < 2) return [];
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var q     = String(query).trim().toUpperCase();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var hRow    = CONFIG.HEADER_ROW_CONSULTOR;
  if (lastRow <= hRow) return [];
  var numCols = sheet.getLastColumn();
  var header  = sheet.getRange(hRow, 1, 1, numCols).getValues()[0];
  var cols    = mapCols(header);
  var data    = sheet.getRange(hRow + 1, 1, lastRow - hRow, numCols).getValues();
  var results = [];
  var base    = CONFIG.CONSULTORES_INC.indexOf(sheetName) >= 0 ? 'Incorporadora' : 'Condomínio';

  data.forEach(function(row) {
    var nome = cols.nome >= 0 ? String(row[cols.nome] || '').trim() : '';
    if (!nome || nome.toUpperCase().indexOf(q) < 0) return;

    var status = cols.status >= 0 ? String(row[cols.status] || '').trim() : '';
    if (isExcluido(status)) return;

    var faixaR = cols.faixa >= 0 ? String(row[cols.faixa] || '').trim() : '';
    var fN     = faixaR.toUpperCase() === 'MULTA' ? '91+' : (normFaixa(faixaR) || faixaR);
    var valor  = cols.valor  >= 0 ? parseNum(row[cols.valor]) : 0;
    var vpagoR = cols.vpago  >= 0 ? parseNum(row[cols.vpago]) : 0;
    var vpago  = vpagoR;
    if (isPago(status) && vpago <= 0) vpago = valor;

    results.push({
      nome:        nome,
      base:        base,
      consultor:   sheetName,
      faixa:       fN,
      valor:       rd(valor),
      status:      status,
      vpago:       rd(vpago),
      dataDiv:     cols.dataDiv >= 0 && row[cols.dataDiv] ? formatDate(row[cols.dataDiv]) : '',
      formaPag:    cols.forma   >= 0 ? String(row[cols.forma] || '').trim() : '',
      isNegociado: status.toUpperCase() === 'NEGOCIADO'
    });
  });

  return results.slice(0, 60);
}