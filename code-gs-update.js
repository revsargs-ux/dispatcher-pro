/**
 * ДИСПЕТЧЕР ПРО — Google Apps Script
 * Полная система управления диспетчеризацией с двусторонней синхронизацией
 */

// ============ КОНФИГУРАЦИЯ ============

const CONFIG = {
  SS_ID: '1Ygtm479lRjL5r4K3wwRhUaZ5dQOt5wWRtfB36JTVAxA',
  SHEETS: {
    EMPLOYEES: 'Сотрудники',
    CLIENTS: 'Клиенты',
    SHIFTS: 'Смены',
    PAYMENTS: 'Платежи',
    SUMMARY: 'Сводка',
    SETTINGS: 'Настройки',
    DISPATCHER_FINANCE: 'Диспетчеры_Финансы',
    PAYMENT_HISTORY: 'История_выплат',
    LOGS: 'Логи'
  },
  // Колонки листа Смены (1-indexed)
  SHIFT_COLS: {
    ID_SHIFT: 1,       // A
    ID_ASSIGN: 2,      // B
    DATE: 3,           // C
    ORG: 4,            // D
    SERVICE: 5,        // E
    WORKER: 6,         // F
    START: 7,          // G
    END: 8,            // H
    HOURS: 9,          // I
    COEF: 10,          // J
    RATE: 11,          // K
    ACCRUED: 12,       // L
    PAID: 13,          // M
    DEBT: 14,          // N
    PAY_STATUS: 15,    // O
    SHIFT_STATUS: 16,  // P
    DISPATCHER: 17,    // Q — Диспетчер
    ADDRESS: 18,       // R — Адрес объекта
    BONUS: 19,          // S — Доплаты
    FINE: 20,           // T — Штрафы
    TOTAL_CLIENT: 21,   // U — Итого клиенту
    TIMESTAMP: 22       // V — Временная метка
  },
  // Колонки листа Платежи (1-indexed)
  PAYMENT_COLS: {
    ID: 1,
    DATE: 2,
    TYPE: 3,           // Приход/Расход
    COUNTERPARTY_ID: 4,
    COUNTERPARTY_NAME: 5,
    AMOUNT: 6,
    METHOD: 7,         // нал/безнал/карта
    STATUS: 8,         // Запланирован/Проведен
    SHIFT_ID: 9,
    COMMENT: 10,
    TIMESTAMP: 11
  },
  // Колонки листа Сотрудники (1-indexed)
  EMP_COLS: {
    ID: 1,
    NAME: 2,
    PHONE: 3,
    RATING: 4,
    ACTIVE: 5,
    DATE_ADDED: 6,
    TELEGRAM: 7,
    NOTE: 8,
    SELF_EMPLOYED: 9,  // Самозанятый
    TAX_RATE: 10,      // Ставка налога
    TAX_WITHHELD: 11   // Удержано налога
  }
};

// ============ УТИЛИТЫ ============

function getSS() {
  return SpreadsheetApp.openById(CONFIG.SS_ID);
}

function getSheet(name) {
  return getSS().getSheetByName(name);
}

function generateUUID() {
  return Utilities.getUuid();
}

function log(message, type = 'INFO') {
  const ss = getSS();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.LOGS);
    sheet.appendRow(['Дата', 'Тип', 'Сообщение']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
  }
  sheet.appendRow([new Date(), type, message]);
}

/**
 * Безопасное получение числа из ячейки
 */
function safeNumber(val) {
  if (val === '' || val === null || val === undefined) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

/**
 * Безопасный расчёт часов между временем начала и конца
 * Учитывает переход через полночь
 */
function calcHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  
  let start, end;
  if (typeof startTime === 'object' && startTime.getHours) {
    start = startTime.getHours() + startTime.getMinutes() / 60;
  } else {
    const parts = String(startTime).split(':');
    if (parts.length < 2) return 0;
    start = Number(parts[0]) + Number(parts[1]) / 60;
  }
  
  if (typeof endTime === 'object' && endTime.getHours) {
    end = endTime.getHours() + endTime.getMinutes() / 60;
  } else {
    const parts = String(endTime).split(':');
    if (parts.length < 2) return 0;
    end = Number(parts[0]) + Number(parts[1]) / 60;
  }
  
  if (isNaN(start) || isNaN(end)) return 0;
  
  // Переход через полночь
  if (end <= start) {
    return end + 24 - start;
  }
  return end - start;
}

// ============ ИНИЦИАЛИЗАЦИЯ СТРУКТУРЫ ============

/**
 * Создаёт/обновляет все необходимые листы
 */
function initAllSheets() {
  const ss = getSS();
  
  // Диспетчеры_Финансы
  let df = ss.getSheetByName(CONFIG.SHEETS.DISPATCHER_FINANCE);
  if (!df) {
    df = ss.insertSheet(CONFIG.SHEETS.DISPATCHER_FINANCE);
    const headers = ['ID', 'ФИО', 'Телефон', 'Статус', 'Дата начала', 'Смен всего', 'Заработано всего', 'Получено всего', 'Текущий остаток'];
    df.appendRow(headers);
    df.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
  }
  
  // История_выплат
  let ph = ss.getSheetByName(CONFIG.SHEETS.PAYMENT_HISTORY);
  if (!ph) {
    ph = ss.insertSheet(CONFIG.SHEETS.PAYMENT_HISTORY);
    const headers = ['Дата', 'ID_диспетчера', 'ФИО_диспетчера', 'Сумма', 'Тип', 'Комментарий', 'Кто выплатил'];
    ph.appendRow(headers);
    ph.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
  }
  
  // Расширяем Сотрудники если нет колонок
  const empSheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  if (empSheet) {
    const lastCol = empSheet.getLastColumn();
    if (lastCol < 11) {
      // Добавляем колонки самозанятости
      empSheet.getRange(1, 9).setValue('Самозанятый');
      empSheet.getRange(1, 10).setValue('Ставка налога (%)');
      empSheet.getRange(1, 11).setValue('Удержано налога');
      empSheet.getRange(1, 9, 1, 3).setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
    }
  }
  
  // Расширяем Клиенты
  const clientSheet = ss.getSheetByName(CONFIG.SHEETS.CLIENTS);
  if (clientSheet) {
    const lastCol = clientSheet.getLastColumn();
    const neededCols = ['Всего услуг', 'Оплачено', 'Долг клиента', 'Наш долг', 'Статус взаиморасчетов'];
    if (lastCol < 8 + neededCols.length) {
      for (let i = 0; i < neededCols.length; i++) {
        clientSheet.getRange(1, 9 + i).setValue(neededCols[i]);
        clientSheet.getRange(1, 9 + i).setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
      }
    }
  }
  
  // Обновляем структуру Платежи
  const paySheet = ss.getSheetByName(CONFIG.SHEETS.PAYMENTS);
  if (paySheet) {
    paySheet.getRange(1, 1, 1, paySheet.getLastColumn()).clearContent();
    const headers = ['ID', 'Дата', 'Тип', 'Контрагент_ID', 'Контрагент_Имя', 'Сумма', 'Способ', 'Статус', 'Привязка_к_смене', 'Комментарий', 'Временная_метка'];
    paySheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    paySheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
  }
  
  // Добавляем колонки в Смены (Q-X)
  const shiftSheet = ss.getSheetByName(CONFIG.SHEETS.SHIFTS);
  if (shiftSheet) {
    const lastCol = shiftSheet.getLastColumn();
    const extraHeaders = ['Диспетчер', 'Адрес объекта', 'Доплаты', 'Штрафы', 'Итого клиенту', 'Временная метка'];
    if (lastCol < 22) {
      for (let i = 0; i < extraHeaders.length; i++) {
        const col = 17 + i;
        shiftSheet.getRange(1, col).setValue(extraHeaders[i]);
        shiftSheet.getRange(1, col).setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
      }
    }
  }
  
  log('Структура листов инициализирована');
  return 'OK';
}

// ============ ПЕРЕРАСЧЁТ ФОРМУЛ В СМЕНАХ ============

/**
 * Пересчитывает ВСЕ строки в листе Смены
 * Исправляет #ERROR!, правильно считает часы/начисления/долги
 */
function recalculateAllShifts() {
  const sheet = getSheet(CONFIG.SHEETS.SHIFTS);
  if (!sheet) return 'Лист Смены не найден';
  
  const data = sheet.getDataRange().getValues();
  const lastRow = data.length;
  
  if (lastRow <= 1) return 'Нет данных';
  
  const updates = [];
  
  for (let r = 1; r < lastRow; r++) {
    const row = data[r];
    const idShift = row[0]; // A — ID смены
    
    // Пропускаем пустые строки
    if (!idShift || String(idShift).trim() === '') continue;
    
    const startTime = row[6]; // G — Начало
    const endTime = row[7];   // H — Окончание
    const coef = safeNumber(row[9]);  // J — Коэф
    const rate = safeNumber(row[10]); // K — Ставка
    const paid = safeNumber(row[12]); // M — Оплачено
    const bonus = safeNumber(row[18]); // S — Доплаты
    const fine = safeNumber(row[19]);   // T — Штрафы
    
    // Считаем часы
    const hours = calcHours(startTime, endTime);
    
    // Начислено = Часы * Коэф * Ставка + Доплаты - Штрафы
    const accrued = hours * coef * rate + bonus - fine;
    
    // Долг = Начислено - Оплачено
    const debt = accrued - paid;
    
    // Статус оплаты
    let payStatus = '';
    if (accrued === 0) {
      payStatus = 'Не рассчитан';
    } else if (paid >= accrued) {
      payStatus = 'Оплачен';
    } else if (paid > 0) {
      payStatus = 'Частично оплачен';
    } else {
      payStatus = 'Не оплачен';
    }
    
    // Итого клиенту = Начислено
    const totalClient = accrued;
    
    // Временная метка
    const timestamp = new Date();
    
    updates.push({
      row: r + 1,
      values: {
        hours: hours,        // I (col 9)
        accrued: accrued,    // L (col 12)
        debt: debt,          // N (col 14)
        payStatus: payStatus, // O (col 15)
        totalClient: totalClient, // U (col 21)
        timestamp: timestamp  // V (col 22)
      }
    });
  }
  
  // Применяем обновления батчем
  for (const u of updates) {
    sheet.getRange(u.row, 9).setValue(u.values.hours);       // I — Часы
    sheet.getRange(u.row, 12).setValue(u.values.accrued);    // L — Начислено
    sheet.getRange(u.row, 14).setValue(u.values.debt);       // N — Долг
    sheet.getRange(u.row, 15).setValue(u.values.payStatus);  // O — Статус оплаты
    sheet.getRange(u.row, 21).setValue(u.values.totalClient); // U — Итого клиенту
    sheet.getRange(u.row, 22).setValue(u.values.timestamp);  // V — Временная метка
  }
  
  log('Пересчитано смен: ' + updates.length);
  return 'Пересчитано смен: ' + updates.length;
}

// ============ ПЕРЕРАСЧЁТ СВОДКИ ============

/**
 * Полностью пересчитывает лист Сводка
 */
function recalculateSummary() {
  const ss = getSS();
  const summarySheet = ss.getSheetByName(CONFIG.SHEETS.SUMMARY);
  if (!summarySheet) return 'Лист Сводка не найден';
  
  // Получаем данные
  const shiftsData = getSheet(CONFIG.SHEETS.SHIFTS).getDataRange().getValues();
  const paymentsData = getSheet(CONFIG.SHEETS.PAYMENTS).getDataRange().getValues();
  const employeesData = getSheet(CONFIG.SHEETS.EMPLOYEES).getDataRange().getValues();
  
  // Очищаем сводку
  summarySheet.clear();
  
  // Считаем статистику по сменам
  let totalShifts = 0;
  let inProgress = 0;
  let completed = 0;
  let unpaid = 0;
  let totalAccrued = 0;
  let totalPaid = 0;
  
  // По сотрудникам
  const empStats = {};
  
  for (let r = 1; r < shiftsData.length; r++) {
    const row = shiftsData[r];
    if (!row[0]) continue;
    
    totalShifts++;
    const shiftStatus = String(row[15] || '');
    if (shiftStatus.includes('В работе')) inProgress++;
    if (shiftStatus.includes('Завершен') || shiftStatus.includes('Подтвержден')) completed++;
    
    const accrued = safeNumber(row[11]);
    const paid = safeNumber(row[12]);
    totalAccrued += accrued;
    totalPaid += paid;
    
    if (paid < accrued) unpaid++;
    
    // По сотруднику
    const workerName = row[5];
    if (workerName) {
      if (!empStats[workerName]) empStats[workerName] = { accrued: 0, paid: 0, shifts: 0 };
      empStats[workerName].accrued += accrued;
      empStats[workerName].paid += paid;
      empStats[workerName].shifts++;
    }
  }
  
  const totalDebt = totalAccrued - totalPaid;
  
  // ==== Оформляем Сводку ====
  
  // Заголовок
  summarySheet.getRange('A1:E1').merge().setValue('СВОДКА ООО ПЛЮС');
  summarySheet.getRange('A1').setFontSize(18).setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff').setHorizontalAlignment('center');
  
  // Сводка по сменам
  let row = 3;
  summarySheet.getRange('A' + row + ':E' + row).merge().setValue('СВОДКА ПО СМЕНАМ');
  summarySheet.getRange('A' + row).setFontSize(14).setFontWeight('bold').setBackground('#283593').setFontColor('#ffffff');
  
  row = 4;
  summarySheet.getRange('B' + row).setValue('Всего смен');
  summarySheet.getRange('C' + row).setValue('В работе');
  summarySheet.getRange('D' + row).setValue('Завершено');
  summarySheet.getRange('E' + row).setValue('Не оплачено');
  summarySheet.getRange('B' + row + ':E' + row).setFontWeight('bold');
  
  row = 5;
  summarySheet.getRange('B' + row).setValue(totalShifts);
  summarySheet.getRange('C' + row).setValue(inProgress);
  summarySheet.getRange('D' + row).setValue(completed);
  summarySheet.getRange('E' + row).setValue(unpaid);
  
  // Сводка по деньгам
  row = 7;
  summarySheet.getRange('A' + row + ':E' + row).merge().setValue('СВОДКА ПО ДЕНЬГАМ');
  summarySheet.getRange('A' + row).setFontSize(14).setFontWeight('bold').setBackground('#283593').setFontColor('#ffffff');
  
  row = 8;
  summarySheet.getRange('B' + row).setValue('Всего начислено');
  summarySheet.getRange('C' + row).setValue('Всего оплачено');
  summarySheet.getRange('D' + row).setValue('Долг всего');
  summarySheet.getRange('B' + row + ':D' + row).setFontWeight('bold');
  
  row = 9;
  summarySheet.getRange('B' + row).setValue(totalAccrued);
  summarySheet.getRange('C' + row).setValue(totalPaid);
  summarySheet.getRange('D' + row).setValue(totalDebt);
  summarySheet.getRange('B' + row + ':D' + row).setNumberFormat('#,##0');
  
  // По сотрудникам
  row = 11;
  summarySheet.getRange('A' + row + ':E' + row).merge().setValue('ПО СОТРУДНИКАМ');
  summarySheet.getRange('A' + row).setFontSize(14).setFontWeight('bold').setBackground('#283593').setFontColor('#ffffff');
  
  row = 12;
  summarySheet.getRange('A' + row).setValue('ФИО');
  summarySheet.getRange('B' + row).setValue('Начислено');
  summarySheet.getRange('C' + row).setValue('Оплачено');
  summarySheet.getRange('D' + row).setValue('Долг');
  summarySheet.getRange('E' + row).setValue('Смен');
  summarySheet.getRange('A' + row + ':E' + row).setFontWeight('bold');
  
  row = 13;
  for (const name in empStats) {
    const s = empStats[name];
    summarySheet.getRange('A' + row).setValue(name);
    summarySheet.getRange('B' + row).setValue(s.accrued);
    summarySheet.getRange('C' + row).setValue(s.paid);
    summarySheet.getRange('D' + row).setValue(s.accrued - s.paid);
    summarySheet.getRange('E' + row).setValue(s.shifts);
    summarySheet.getRange('B' + row + ':D' + row).setNumberFormat('#,##0');
    row++;
  }
  
  // Взаиморасчёты с клиентами
  row += 1;
  summarySheet.getRange('A' + row + ':E' + row).merge().setValue('ВЗАИМОРАСЧЁТЫ С КЛИЕНТАМИ');
  summarySheet.getRange('A' + row).setFontSize(14).setFontWeight('bold').setBackground('#283593').setFontColor('#ffffff');
  
  row += 1;
  summarySheet.getRange('A' + row).setValue('Клиент');
  summarySheet.getRange('B' + row).setValue('Услуг');
  summarySheet.getRange('C' + row).setValue('Начислено');
  summarySheet.getRange('D' + row).setValue('Оплачено');
  summarySheet.getRange('E' + row).setValue('Долг');
  summarySheet.getRange('A' + row + ':E' + row).setFontWeight('bold');
  
  // Считаем по клиентам
  const clientStats = {};
  for (let r = 1; r < shiftsData.length; r++) {
    const row2 = shiftsData[r];
    if (!row2[0]) continue;
    const clientName = row2[3]; // Организация
    if (!clientName) continue;
    if (!clientStats[clientName]) clientStats[clientName] = { accrued: 0, paid: 0, shifts: 0 };
    clientStats[clientName].accrued += safeNumber(row2[11]);
    clientStats[clientName].paid += safeNumber(row2[12]);
    clientStats[clientName].shifts++;
  }
  
  row += 1;
  for (const name in clientStats) {
    const s = clientStats[name];
    summarySheet.getRange('A' + row).setValue(name);
    summarySheet.getRange('B' + row).setValue(s.shifts);
    summarySheet.getRange('C' + row).setValue(s.accrued);
    summarySheet.getRange('D' + row).setValue(s.paid);
    summarySheet.getRange('E' + row).setValue(s.accrued - s.paid);
    summarySheet.getRange('C' + row + ':E' + row).setNumberFormat('#,##0');
    row++;
  }
  
  // Финансовый блок — Платежи
  row += 1;
  summarySheet.getRange('A' + row + ':E' + row).merge().setValue('ФИНАНСОВЫЙ БЛОК');
  summarySheet.getRange('A' + row).setFontSize(14).setFontWeight('bold').setBackground('#283593').setFontColor('#ffffff');
  
  let totalIncome = 0;
  let totalExpense = 0;
  for (let r = 1; r < paymentsData.length; r++) {
    const row2 = paymentsData[r];
    if (!row2[0]) continue;
    const type = String(row2[2] || '').toLowerCase();
    const amount = safeNumber(row2[5]);
    if (type === 'приход') totalIncome += amount;
    if (type === 'расход') totalExpense += amount;
  }
  
  row += 1;
  summarySheet.getRange('A' + row).setValue('Выручка (приход)');
  summarySheet.getRange('B' + row).setValue(totalIncome);
  row += 1;
  summarySheet.getRange('A' + row).setValue('Расходы');
  summarySheet.getRange('B' + row).setValue(totalExpense);
  row += 1;
  summarySheet.getRange('A' + row).setValue('Баланс');
  summarySheet.getRange('B' + row).setValue(totalIncome - totalExpense);
  summarySheet.getRange('B' + row + ':B' + row).setNumberFormat('#,##0');
  
  // Ширина колонок
  summarySheet.setColumnWidth(1, 250);
  summarySheet.setColumnWidth(2, 150);
  summarySheet.setColumnWidth(3, 150);
  summarySheet.setColumnWidth(4, 150);
  summarySheet.setColumnWidth(5, 150);
  
  log('Сводка пересчитана');
  return 'OK';
}

// ============ API ДЛЯ ПРИЛОЖЕНИЯ ============

/**
 * GET обработчик — возвращает данные по типу
 */
function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback;
  
  let result;
  
  try {
    switch (action) {
      case 'getEmployees':
        result = getEmployees();
        break;
      case 'getClients':
        result = getClients();
        break;
      case 'getShifts':
        result = getShifts(e.parameter.from, e.parameter.to);
        break;
      case 'getPayments':
        result = getPayments(e.parameter.from, e.parameter.to);
        break;
      case 'getSummary':
        result = getSummaryData();
        break;
      case 'getDispatcherFinance':
        result = getDispatcherFinance();
        break;
      case 'getPaymentHistory':
        result = getPaymentHistory();
        break;
      case 'getSettings':
        result = getSettings();
        break;
      // === Sync from Dispatcher.PRO ===
      case 'addPayment':
        var pData = e.parameter.data ? JSON.parse(e.parameter.data) : {};
        result = addPayment(pData);
        break;
      case 'addShift':
        var sData = e.parameter.data ? JSON.parse(e.parameter.data) : {};
        result = addShift(sData);
        break;
      case 'updateShift':
        var uData = e.parameter.data ? JSON.parse(e.parameter.data) : {};
        result = updateShift(uData);
        break;
      case 'syncShift':
        result = syncShiftFromDispatcher(e.parameter);
        break;
      case 'addPayment':
        var pData = e.parameter.data ? JSON.parse(e.parameter.data) : {};
        result = addPayment(pData);
        break;
      case 'syncWorker':
        var wData = e.parameter.data ? JSON.parse(e.parameter.data) : {};
        result = syncWorkerFromDispatcher(wData);
        break;
      case 'syncClient':
        var cData = e.parameter.data ? JSON.parse(e.parameter.data) : {};
        result = syncClientFromDispatcher(cData);
        break;
      case 'syncPayment':
        var pyData = e.parameter.data ? JSON.parse(e.parameter.data) : {};
        result = syncPaymentFromDispatcher(pyData);
        break;
      case 'syncAssignment':
        var aData = e.parameter.data ? JSON.parse(e.parameter.data) : {};
        result = syncAssignmentFromDispatcher(aData);
        break;
      case 'syncUser':
        var uData = e.parameter.data ? JSON.parse(e.parameter.data) : {};
        result = syncUserFromDispatcher(uData);
        break;
      case 'fixHeaders':
        result = fixAllHeaders();
        break;
      case 'recalculate':
        recalculateAllShifts();
        recalculateSummary();
        result = { message: 'Пересчёт завершён' };
        break;
      case 'fixFormulas':
        result = fixShiftFormulas();
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
    log('ERROR in doGet: ' + err.toString(), 'ERROR');
  }
  
  const json = JSON.stringify({ status: 'ok', data: result });
  
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST обработчик — принимает данные от приложения
 */
function doPost(e) {
  let result;
  
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    
    switch (action) {
      case 'addShift':
        result = addShift(body.data);
        break;
      case 'updateShift':
        result = updateShift(body.data);
        break;
      case 'deleteShift':
        result = deleteShift(body.data.id);
        break;
      case 'addPayment':
        result = addPayment(body.data);
        break;
      case 'updatePayment':
        result = updatePayment(body.data);
        break;
      case 'addEmployee':
        result = addEmployee(body.data);
        break;
      case 'updateEmployee':
        result = updateEmployee(body.data);
        break;
      case 'addClient':
        result = addClient(body.data);
        break;
      case 'updateClient':
        result = updateClient(body.data);
        break;
      case 'addDispatcherPayment':
        result = addDispatcherPayment(body.data);
        break;
      case 'recalculate':
        recalculateAllShifts();
        recalculateSummary();
        result = { message: 'Пересчёт завершён' };
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
    log('ERROR in doPost: ' + err.toString(), 'ERROR');
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok', data: result }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ ЧТЕНИЕ ДАННЫХ ============

function getEmployees() {
  const sheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    result.push({
      id: data[r][0],
      name: data[r][1],
      phone: data[r][2],
      rating: data[r][3],
      active: data[r][4],
      dateAdded: data[r][5],
      telegram: data[r][6],
      note: data[r][7],
      selfEmployed: data[r][8] || 'Нет',
      taxRate: safeNumber(data[r][9]) || 6,
      taxWithheld: safeNumber(data[r][10])
    });
  }
  return result;
}

function getClients() {
  const sheet = getSheet(CONFIG.SHEETS.CLIENTS);
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    result.push({
      id: data[r][0],
      name: data[r][1],
      contact: data[r][2],
      clientRate: data[r][3],
      workerRate: data[r][4],
      dateAdded: data[r][5],
      archive: data[r][6],
      note: data[r][7],
      totalServices: data[r][8] || 0,
      paid: data[r][9] || 0,
      clientDebt: data[r][10] || 0,
      ourDebt: data[r][11] || 0,
      settlementStatus: data[r][12] || ''
    });
  }
  return result;
}

function getShifts(from, to) {
  const sheet = getSheet(CONFIG.SHEETS.SHIFTS);
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    const shiftDate = data[r][2];
    
    // Фильтр по датам если указан
    if (from || to) {
      const d = new Date(shiftDate);
      if (from && d < new Date(from)) continue;
      if (to && d > new Date(to)) continue;
    }
    
    result.push({
      id: data[r][0],
      assignId: data[r][1],
      date: formatDate(shiftDate),
      org: data[r][3],
      service: data[r][4],
      worker: data[r][5],
      start: formatTime(data[r][6]),
      end: formatTime(data[r][7]),
      hours: safeNumber(data[r][8]),
      coef: safeNumber(data[r][9]),
      rate: safeNumber(data[r][10]),
      accrued: safeNumber(data[r][11]),
      paid: safeNumber(data[r][12]),
      debt: safeNumber(data[r][13]),
      payStatus: data[r][14],
      shiftStatus: data[r][15],
      dispatcher: data[r][16] || '',
      address: data[r][17] || '',
      bonus: safeNumber(data[r][18]),
      fine: safeNumber(data[r][19]),
      totalClient: safeNumber(data[r][20]),
      timestamp: data[r][21] ? new Date(data[r][21]).toISOString() : ''
    });
  }
  return result;
}

function getPayments(from, to) {
  const sheet = getSheet(CONFIG.SHEETS.PAYMENTS);
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    result.push({
      id: data[r][0],
      date: formatDate(data[r][1]),
      type: data[r][2],
      counterpartyId: data[r][3],
      counterpartyName: data[r][4],
      amount: safeNumber(data[r][5]),
      method: data[r][6],
      status: data[r][7],
      shiftId: data[r][8],
      comment: data[r][9],
      timestamp: data[r][10] ? new Date(data[r][10]).toISOString() : ''
    });
  }
  return result;
}

function getSummaryData() {
  recalculateSummary();
  const sheet = getSheet(CONFIG.SHEETS.SUMMARY);
  const data = sheet.getDataRange().getValues();
  return data;
}

function getDispatcherFinance() {
  const sheet = getSheet(CONFIG.SHEETS.DISPATCHER_FINANCE);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    result.push({
      id: data[r][0],
      name: data[r][1],
      phone: data[r][2],
      status: data[r][3],
      startDate: data[r][4],
      totalShifts: data[r][5],
      totalEarned: data[r][6],
      totalPaid: data[r][7],
      currentBalance: data[r][8]
    });
  }
  return result;
}

function getPaymentHistory() {
  const sheet = getSheet(CONFIG.SHEETS.PAYMENT_HISTORY);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    result.push({
      date: data[r][0],
      dispatcherId: data[r][1],
      dispatcherName: data[r][2],
      amount: data[r][3],
      type: data[r][4],
      comment: data[r][5],
      paidBy: data[r][6]
    });
  }
  return result;
}

function getSettings() {
  const sheet = getSheet(CONFIG.SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  return data;
}

// ============ ЗАПИСЬ ДАННЫХ ============

/**
 * Добавить смену из приложения
 */
function addShift(data) {
  const sheet = getSheet(CONFIG.SHEETS.SHIFTS);
  const id = generateUUID();
  const assignId = generateUUID();
  const timestamp = new Date();
  
  sheet.appendRow([
    id,                                    // A — ID смены
    assignId,                              // B — ID назначения
    data.date,                             // C — Дата
    data.org,                              // D — Организация
    data.service || '',                    // E — Услуга
    data.worker,                           // F — ФИО рабочего
    data.start,                            // G — Начало
    data.end || '',                        // H — Окончание
    '',                                    // I — Часы (пересчитается)
    data.coef || 1,                        // J — Коэф
    data.rate || 400,                      // K — Ставка
    '',                                    // L — Начислено (пересчитается)
    0,                                     // M — Оплачено
    '',                                    // N — Долг (пересчитается)
    '',                                    // O — Статус оплаты (пересчитается)
    data.shiftStatus || 'Запланирована',   // P — Статус смены
    data.dispatcher || '',                 // Q — Диспетчер
    data.address || '',                    // R — Адрес объекта
    data.bonus || 0,                       // S — Доплаты
    data.fine || 0,                        // T — Штрафы
    '',                                    // U — Итого клиенту (пересчитается)
    timestamp                              // V — Временная метка
  ]);
  
  // Пересчитываем
  recalculateAllShifts();
  recalculateSummary();
  
  log('Добавлена смена: ' + id);
  return { id: id, message: 'Смена добавлена' };
}

/**
 * Обновить смену из приложения
 */
function updateShift(data) {
  const sheet = getSheet(CONFIG.SHEETS.SHIFTS);
  const rows = sheet.getDataRange().getValues();
  
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] === data.id || rows[r][1] === data.id) {
      const rowNum = r + 1;
      if (data.date !== undefined) sheet.getRange(rowNum, 3).setValue(data.date);
      if (data.org !== undefined) sheet.getRange(rowNum, 4).setValue(data.org);
      if (data.service !== undefined) sheet.getRange(rowNum, 5).setValue(data.service);
      if (data.worker !== undefined) sheet.getRange(rowNum, 6).setValue(data.worker);
      if (data.start !== undefined) sheet.getRange(rowNum, 7).setValue(data.start);
      if (data.end !== undefined) sheet.getRange(rowNum, 8).setValue(data.end);
      if (data.coef !== undefined) sheet.getRange(rowNum, 10).setValue(data.coef);
      if (data.rate !== undefined) sheet.getRange(rowNum, 11).setValue(data.rate);
      if (data.paid !== undefined) sheet.getRange(rowNum, 13).setValue(data.paid);
      if (data.shiftStatus !== undefined) sheet.getRange(rowNum, 16).setValue(data.shiftStatus);
      if (data.dispatcher !== undefined) sheet.getRange(rowNum, 17).setValue(data.dispatcher);
      if (data.address !== undefined) sheet.getRange(rowNum, 18).setValue(data.address);
      if (data.bonus !== undefined) sheet.getRange(rowNum, 19).setValue(data.bonus);
      if (data.fine !== undefined) sheet.getRange(rowNum, 20).setValue(data.fine);
      
      sheet.getRange(rowNum, 22).setValue(new Date()); // Обновляем метку времени
      
      recalculateAllShifts();
      recalculateSummary();
      
      log('Обновлена смена: ' + data.id);
      return { message: 'Смена обновлена' };
    }
  }
  
  return { error: 'Смена не найдена' };
}

/**
 * Удалить смену
 */
function deleteShift(id) {
  const sheet = getSheet(CONFIG.SHEETS.SHIFTS);
  const rows = sheet.getDataRange().getValues();
  
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] === id || rows[r][1] === id) {
      sheet.deleteRow(r + 1);
      recalculateAllShifts();
      recalculateSummary();
      log('Удалена смена: ' + id);
      return { message: 'Смена удалена' };
    }
  }
  return { error: 'Смена не найдена' };
}

/**
 * Добавить платёж
 */
function addPayment(data) {
  const sheet = getSheet(CONFIG.SHEETS.PAYMENTS);
  const id = generateUUID();
  const timestamp = new Date();
  
  sheet.appendRow([
    id,                              // A — ID
    data.date || formatDate(new Date()), // B — Дата
    data.type,                       // C — Тип (Приход/Расход)
    data.counterpartyId || '',       // D — Контрагент_ID
    data.counterpartyName || '',     // E — Контрагент_Имя
    data.amount,                     // F — Сумма
    data.method || 'Наличные',       // G — Способ
    data.status || 'Проведен',       // H — Статус
    data.shiftId || '',              // I — Привязка к смене
    data.comment || '',              // J — Комментарий
    timestamp                        // K — Временная метка
  ]);
  
  recalculateSummary();
  updateClientSettlements();
  
  log('Добавлен платёж: ' + id + ' ' + data.type + ' ' + data.amount);
  return { id: id, message: 'Платёж добавлен' };
}

/**
 * Обновить платёж
 */
function updatePayment(data) {
  const sheet = getSheet(CONFIG.SHEETS.PAYMENTS);
  const rows = sheet.getDataRange().getValues();
  
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] === data.id) {
      const rowNum = r + 1;
      if (data.date !== undefined) sheet.getRange(rowNum, 2).setValue(data.date);
      if (data.type !== undefined) sheet.getRange(rowNum, 3).setValue(data.type);
      if (data.counterpartyId !== undefined) sheet.getRange(rowNum, 4).setValue(data.counterpartyId);
      if (data.counterpartyName !== undefined) sheet.getRange(rowNum, 5).setValue(data.counterpartyName);
      if (data.amount !== undefined) sheet.getRange(rowNum, 6).setValue(data.amount);
      if (data.method !== undefined) sheet.getRange(rowNum, 7).setValue(data.method);
      if (data.status !== undefined) sheet.getRange(rowNum, 8).setValue(data.status);
      if (data.shiftId !== undefined) sheet.getRange(rowNum, 9).setValue(data.shiftId);
      if (data.comment !== undefined) sheet.getRange(rowNum, 10).setValue(data.comment);
      sheet.getRange(rowNum, 11).setValue(new Date());
      
      recalculateSummary();
      updateClientSettlements();
      
      log('Обновлён платёж: ' + data.id);
      return { message: 'Платёж обновлён' };
    }
  }
  return { error: 'Платёж не найден' };
}

/**
 * Добавить сотрудника
 */
function addEmployee(data) {
  const sheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  const id = generateUUID();
  
  sheet.appendRow([
    id,
    data.name,
    data.phone || '',
    data.rating || 5,
    data.active || 'Да',
    formatDate(new Date()),
    data.telegram || '',
    data.note || '',
    data.selfEmployed || 'Нет',
    data.taxRate || 6,
    0
  ]);
  
  log('Добавлен сотрудник: ' + data.name);
  return { id: id, message: 'Сотрудник добавлен' };
}

/**
 * Обновить сотрудника
 */
function updateEmployee(data) {
  const sheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  const rows = sheet.getDataRange().getValues();
  
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] === data.id) {
      const rowNum = r + 1;
      if (data.name !== undefined) sheet.getRange(rowNum, 2).setValue(data.name);
      if (data.phone !== undefined) sheet.getRange(rowNum, 3).setValue(data.phone);
      if (data.rating !== undefined) sheet.getRange(rowNum, 4).setValue(data.rating);
      if (data.active !== undefined) sheet.getRange(rowNum, 5).setValue(data.active);
      if (data.telegram !== undefined) sheet.getRange(rowNum, 7).setValue(data.telegram);
      if (data.note !== undefined) sheet.getRange(rowNum, 8).setValue(data.note);
      if (data.selfEmployed !== undefined) sheet.getRange(rowNum, 9).setValue(data.selfEmployed);
      if (data.taxRate !== undefined) sheet.getRange(rowNum, 10).setValue(data.taxRate);
      
      log('Обновлён сотрудник: ' + data.id);
      return { message: 'Сотрудник обновлён' };
    }
  }
  return { error: 'Сотрудник не найден' };
}

/**
 * Добавить клиента
 */
function addClient(data) {
  const sheet = getSheet(CONFIG.SHEETS.CLIENTS);
  const id = generateUUID();
  
  sheet.appendRow([
    id,
    data.name,
    data.contact || '',
    data.clientRate || 520,
    data.workerRate || 400,
    formatDate(new Date()),
    'Нет',
    data.note || '',
    0, 0, 0, 0, ''
  ]);
  
  log('Добавлен клиент: ' + data.name);
  return { id: id, message: 'Клиент добавлен' };
}

/**
 * Обновить клиента
 */
function updateClient(data) {
  const sheet = getSheet(CONFIG.SHEETS.CLIENTS);
  const rows = sheet.getDataRange().getValues();
  
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] === data.id) {
      const rowNum = r + 1;
      if (data.name !== undefined) sheet.getRange(rowNum, 2).setValue(data.name);
      if (data.contact !== undefined) sheet.getRange(rowNum, 3).setValue(data.contact);
      if (data.clientRate !== undefined) sheet.getRange(rowNum, 4).setValue(data.clientRate);
      if (data.workerRate !== undefined) sheet.getRange(rowNum, 5).setValue(data.workerRate);
      if (data.archive !== undefined) sheet.getRange(rowNum, 7).setValue(data.archive);
      if (data.note !== undefined) sheet.getRange(rowNum, 8).setValue(data.note);
      
      log('Обновлён клиент: ' + data.id);
      return { message: 'Клиент обновлён' };
    }
  }
  return { error: 'Клиент не найден' };
}

/**
 * Внести выплату диспетчеру
 */
function addDispatcherPayment(data) {
  // Запись в История_выплат
  const historySheet = getSheet(CONFIG.SHEETS.PAYMENT_HISTORY);
  historySheet.appendRow([
    new Date(),
    data.dispatcherId,
    data.dispatcherName || '',
    data.amount,
    data.type || 'окончательный',
    data.comment || '',
    data.paidBy || ''
  ]);
  
  // Обновляем баланс диспетчера
  const dfSheet = getSheet(CONFIG.SHEETS.DISPATCHER_FINANCE);
  if (dfSheet) {
    const rows = dfSheet.getDataRange().getValues();
    for (let r = 1; r < rows.length; r++) {
      if (rows[r][0] === data.dispatcherId) {
        const currentPaid = safeNumber(rows[r][7]) + safeNumber(data.amount);
        dfSheet.getRange(r + 1, 8).setValue(currentPaid);
        dfSheet.getRange(r + 1, 9).setValue(safeNumber(rows[r][6]) - currentPaid);
        break;
      }
    }
  }
  
  // Также создаём расходный платёж
  addPayment({
    date: formatDate(new Date()),
    type: 'Расход',
    counterpartyId: data.dispatcherId,
    counterpartyName: data.dispatcherName || '',
    amount: data.amount,
    method: data.method || 'Наличные',
    status: 'Проведен',
    comment: 'Выплата диспетчеру: ' + (data.type || 'окончательный')
  });
  
  log('Выплата диспетчеру: ' + data.dispatcherName + ' ' + data.amount);
  return { message: 'Выплата внесена' };
}

// ============ ОБНОВЛЕНИЕ ВЗАИМОРАСЧЁТОВ ============

/**
 * Пересчитывает взаиморасчёты с клиентами
 */
function updateClientSettlements() {
  const clientSheet = getSheet(CONFIG.SHEETS.CLIENTS);
  const shiftSheet = getSheet(CONFIG.SHEETS.SHIFTS);
  const paymentSheet = getSheet(CONFIG.SHEETS.PAYMENTS);
  
  if (!clientSheet || !shiftSheet) return;
  
  const clients = clientSheet.getDataRange().getValues();
  const shifts = shiftSheet.getDataRange().getValues();
  const payments = paymentSheet.getDataRange().getValues();
  
  for (let cr = 1; cr < clients.length; cr++) {
    if (!clients[cr][0]) continue;
    const clientName = clients[cr][1]; // Название клиента
    
    let totalServices = 0;
    let totalAccrued = 0;
    
    // Считаем услуги по сменам
    for (let sr = 1; sr < shifts.length; sr++) {
      if (!shifts[sr][0]) continue;
      if (shifts[sr][3] === clientName) {
        totalServices++;
        totalAccrued += safeNumber(shifts[sr][11]);
      }
    }
    
    // Считаем оплаты от клиента
    let totalPaidToUs = 0;
    const clientId = clients[cr][0];
    for (let pr = 1; pr < payments.length; pr++) {
      if (!payments[pr][0]) continue;
      if (payments[pr][3] === clientId || payments[pr][4] === clientName) {
        if (String(payments[pr][2]).toLowerCase() === 'приход') {
          totalPaidToUs += safeNumber(payments[pr][5]);
        }
      }
    }
    
    const debt = totalAccrued - totalPaidToUs;
    let status = 'Расчитан';
    if (debt > 0) status = 'Должен нам';
    if (debt < 0) status = 'Аванс';
    
    const rowNum = cr + 1;
    clientSheet.getRange(rowNum, 9).setValue(totalServices);
    clientSheet.getRange(rowNum, 10).setValue(totalPaidToUs);
    clientSheet.getRange(rowNum, 11).setValue(Math.max(0, debt));
    clientSheet.getRange(rowNum, 12).setValue(Math.max(0, -debt));
    clientSheet.getRange(rowNum, 13).setValue(status);
  }
}

// ============ ОБРАБОТЧИК ИЗМЕНЕНИЙ В ТАБЛИЦЕ ============

// ============ СИНХРОНИЗАЦИЯ С DISPATCHER.PRO (сайт) ============

/**
 * Синхронизация смены из Dispatcher.PRO в Google Таблицу
 * Вызывается через GET: ?action=syncShift&shift_date=...&shift_client=...&shift_worker=...&shift_service=...&shift_hours=...&shift_start=...&shift_end=...&shift_rate_client=...&shift_rate_worker=...&shift_address=...&shift_comment=...&shift_dispatcher=...&shift_status=...&shift_id=...
 */
function syncShiftFromDispatcher(params) {
  var sheet = getSheet(CONFIG.SHEETS.SHIFTS);
  var existingId = params.shift_id || '';
  
  // Check if shift already exists by ID in column A
  if (existingId) {
    var rows = sheet.getDataRange().getValues();
    for (var r = 1; r < rows.length; r++) {
      if (rows[r][0] === existingId) {
        var rowNum = r + 1;
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.DATE).setValue(params.shift_date || '');
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.ORG).setValue(params.shift_client || '');
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.SERVICE).setValue(params.shift_service || '');
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.WORKER).setValue(params.shift_worker || '');
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.START).setValue(params.shift_start || '');
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.END).setValue(params.shift_end || '');
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.HOURS).setValue(Number(params.shift_hours) || 0);
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.RATE).setValue(Number(params.shift_rate_client) || 520);
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.ADDRESS).setValue(params.shift_address || '');
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.DISPATCHER).setValue(params.shift_dispatcher || '');
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.SHIFT_STATUS).setValue(params.shift_status || 'planned');
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.TIMESTAMP).setValue(new Date());
        recalculateAllShifts();
        recalculateSummary();
        log('Синхронизация: обновлена смена ' + existingId);
        return { message: 'Смена обновлена', id: existingId };
      }
    }
  }
  
  // Create new shift
  var newRow = [];
  newRow[CONFIG.SHIFT_COLS.ID_SHIFT - 1] = existingId || generateUUID();
  newRow[CONFIG.SHIFT_COLS.ID_ASSIGN - 1] = '';
  newRow[CONFIG.SHIFT_COLS.DATE - 1] = params.shift_date || '';
  newRow[CONFIG.SHIFT_COLS.ORG - 1] = params.shift_client || '';
  newRow[CONFIG.SHIFT_COLS.SERVICE - 1] = params.shift_service || '';
  newRow[CONFIG.SHIFT_COLS.WORKER - 1] = params.shift_worker || '';
  newRow[CONFIG.SHIFT_COLS.START - 1] = params.shift_start || '';
  newRow[CONFIG.SHIFT_COLS.END - 1] = params.shift_end || '';
  newRow[CONFIG.SHIFT_COLS.HOURS - 1] = Number(params.shift_hours) || 0;
  newRow[CONFIG.SHIFT_COLS.COEF - 1] = 1;
  newRow[CONFIG.SHIFT_COLS.RATE - 1] = Number(params.shift_rate_client) || 520;
  newRow[CONFIG.SHIFT_COLS.ACCRUED - 1] = (Number(params.shift_hours) || 0) * (Number(params.shift_rate_client) || 520);
  newRow[CONFIG.SHIFT_COLS.PAID - 1] = 0;
  newRow[CONFIG.SHIFT_COLS.DEBT - 1] = (Number(params.shift_hours) || 0) * (Number(params.shift_rate_client) || 520);
  newRow[CONFIG.SHIFT_COLS.PAY_STATUS - 1] = 'не оплачен';
  newRow[CONFIG.SHIFT_COLS.SHIFT_STATUS - 1] = params.shift_status || 'planned';
  newRow[CONFIG.SHIFT_COLS.DISPATCHER - 1] = params.shift_dispatcher || '';
  newRow[CONFIG.SHIFT_COLS.ADDRESS - 1] = params.shift_address || '';
  newRow[CONFIG.SHIFT_COLS.BONUS - 1] = 0;
  newRow[CONFIG.SHIFT_COLS.FINE - 1] = 0;
  newRow[CONFIG.SHIFT_COLS.TOTAL_CLIENT - 1] = (Number(params.shift_hours) || 0) * (Number(params.shift_rate_client) || 520);
  newRow[CONFIG.SHIFT_COLS.TIMESTAMP - 1] = new Date();
  
  sheet.appendRow(newRow);
  recalculateAllShifts();
  recalculateSummary();
  log('Синхронизация: создана смена ' + (existingId || 'новая'));
  return { message: 'Смена создана', id: existingId };
}

/**
 * Синхронизация сотрудника из Dispatcher.PRO
 */
function syncWorkerFromDispatcher(data) {
  var sheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  var rows = sheet.getDataRange().getValues();
  
  // Find by ID
  for (var r = 1; r < rows.length; r++) {
    if (rows[r][0] === data.id) {
      var rowNum = r + 1;
      if (data.full_name) sheet.getRange(rowNum, CONFIG.EMP_COLS.NAME).setValue(data.full_name);
      if (data.phone) sheet.getRange(rowNum, CONFIG.EMP_COLS.PHONE).setValue(data.phone);
      if (data.rating !== undefined) sheet.getRange(rowNum, CONFIG.EMP_COLS.RATING).setValue(data.rating);
      if (data.is_active !== undefined) sheet.getRange(rowNum, CONFIG.EMP_COLS.ACTIVE).setValue(data.is_active ? 'Да' : 'Нет');
      if (data.telegram_chat_id) sheet.getRange(rowNum, CONFIG.EMP_COLS.TELEGRAM).setValue(data.telegram_chat_id);
      log('Синхронизация: обновлён сотрудник ' + data.id);
      return { message: 'Сотрудник обновлён', id: data.id };
    }
  }
  
  // Create new
  var id = data.id || generateUUID();
  sheet.appendRow([
    id,
    data.full_name || '',
    data.phone || '',
    data.rating || 5,
    data.is_active !== false ? 'Да' : 'Нет',
    new Date(),
    data.telegram_chat_id || '',
    data.note || '',
    'Нет', // selfEmployed
    6, // taxRate
    0  // taxWithheld
  ]);
  log('Синхронизация: создан сотрудник ' + id);
  return { message: 'Сотрудник создан', id: id };
}

/**
 * Синхронизация клиента из Dispatcher.PRO
 */
function syncClientFromDispatcher(data) {
  var sheet = getSheet(CONFIG.SHEETS.CLIENTS);
  var rows = sheet.getDataRange().getValues();
  
  for (var r = 1; r < rows.length; r++) {
    if (rows[r][0] === data.id) {
      var rowNum = r + 1;
      if (data.name) sheet.getRange(rowNum, 2).setValue(data.name);
      if (data.contact) sheet.getRange(rowNum, 3).setValue(data.contact);
      if (data.default_client_rate) sheet.getRange(rowNum, 4).setValue(data.default_client_rate);
      if (data.default_worker_rate) sheet.getRange(rowNum, 5).setValue(data.default_worker_rate);
      if (data.archived !== undefined) sheet.getRange(rowNum, 8).setValue(data.archived ? 'Да' : 'Нет');
      log('Синхронизация: обновлён клиент ' + data.id);
      return { message: 'Клиент обновлён', id: data.id };
    }
  }
  
  var id = data.id || generateUUID();
  sheet.appendRow([
    id,
    data.name || '',
    data.contact || '',
    data.default_client_rate || 520,
    data.default_worker_rate || 400,
    new Date(),
    data.archived ? 'Да' : 'Нет',
    '' // note
  ]);
  log('Синхронизация: создан клиент ' + id);
  return { message: 'Клиент создан', id: id };
}

/**
 * Синхронизация платежа из Dispatcher.PRO
 */
function syncPaymentFromDispatcher(data) {
  var sheet = getSheet(CONFIG.SHEETS.PAYMENTS);
  var rows = sheet.getDataRange().getValues();
  
  for (var r = 1; r < rows.length; r++) {
    if (rows[r][0] === data.id) {
      var rowNum = r + 1;
      if (data.amount !== undefined) sheet.getRange(rowNum, CONFIG.PAYMENT_COLS.AMOUNT).setValue(data.amount);
      if (data.method) sheet.getRange(rowNum, CONFIG.PAYMENT_COLS.METHOD).setValue(data.method);
      if (data.status) sheet.getRange(rowNum, CONFIG.PAYMENT_COLS.STATUS).setValue(data.status);
      if (data.note) sheet.getRange(rowNum, CONFIG.PAYMENT_COLS.COMMENT).setValue(data.note);
      sheet.getRange(rowNum, CONFIG.PAYMENT_COLS.TIMESTAMP).setValue(new Date());
      recalculateSummary();
      updateClientSettlements();
      log('Синхронизация: обновлён платёж ' + data.id);
      return { message: 'Платёж обновлён', id: data.id };
    }
  }
  
  // Create new payment
  var id = data.id || generateUUID();
  sheet.appendRow([
    id,
    data.date || formatDate(new Date()),
    data.type || 'Приход',
    data.counterpartyId || '',
    data.counterpartyName || '',
    data.amount || 0,
    data.method || 'Безналичный',
    data.status || 'Проведен',
    data.shiftId || '',
    data.note || data.comment || '',
    new Date()
  ]);
  recalculateSummary();
  updateClientSettlements();
  log('Синхронизация: создан платёж ' + id);
  return { message: 'Платёж создан', id: id };
}

/**
 * Синхронизация назначения (worker assignment) из Dispatcher.PRO
 * Обновляет строку смены данными назначения
 */
function syncAssignmentFromDispatcher(data) {
  var sheet = getSheet(CONFIG.SHEETS.SHIFTS);
  var rows = sheet.getDataRange().getValues();
  
  // Find by assignment ID in column B
  for (var r = 1; r < rows.length; r++) {
    if (rows[r][CONFIG.SHIFT_COLS.ID_ASSIGN - 1] === data.id) {
      var rowNum = r + 1;
      if (data.worker_name) sheet.getRange(rowNum, CONFIG.SHIFT_COLS.WORKER).setValue(data.worker_name);
      if (data.hours_worked !== undefined) sheet.getRange(rowNum, CONFIG.SHIFT_COLS.HOURS).setValue(Number(data.hours_worked) || 0);
      if (data.actual_start_time) sheet.getRange(rowNum, CONFIG.SHIFT_COLS.START).setValue(data.actual_start_time);
      if (data.actual_end_time) sheet.getRange(rowNum, CONFIG.SHIFT_COLS.END).setValue(data.actual_end_time);
      if (data.rate_per_hour) sheet.getRange(rowNum, CONFIG.SHIFT_COLS.RATE).setValue(Number(data.rate_per_hour));
      if (data.paid_amount !== undefined) sheet.getRange(rowNum, CONFIG.SHIFT_COLS.PAID).setValue(Number(data.paid_amount) || 0);
      if (data.payment_status) sheet.getRange(rowNum, CONFIG.SHIFT_COLS.PAY_STATUS).setValue(data.payment_status);
      if (data.extra_amount) sheet.getRange(rowNum, CONFIG.SHIFT_COLS.BONUS).setValue(Number(data.extra_amount));
      sheet.getRange(rowNum, CONFIG.SHIFT_COLS.TIMESTAMP).setValue(new Date());
      recalculateAllShifts();
      recalculateSummary();
      log('Синхронизация: обновлено назначение ' + data.id);
      return { message: 'Назначение обновлено', id: data.id };
    }
  }
  
  // If not found by assignment ID, try to find shift and add assignment ID
  if (data.shift_id) {
    for (var r = 1; r < rows.length; r++) {
      if (rows[r][0] === data.shift_id) {
        var rowNum = r + 1;
        sheet.getRange(rowNum, CONFIG.SHIFT_COLS.ID_ASSIGN).setValue(data.id);
        if (data.worker_name) sheet.getRange(rowNum, CONFIG.SHIFT_COLS.WORKER).setValue(data.worker_name);
        recalculateAllShifts();
        log('Синхронизация: привязано назначение к смене ' + data.shift_id);
        return { message: 'Назначение привязано', id: data.id };
      }
    }
  }
  
  return { message: 'Смена не найдена для назначения', id: data.id };
}

/**
 * Синхронизация диспетчера (user) из Dispatcher.PRO
 */
function syncUserFromDispatcher(data) {
  var sheet = getSheet(CONFIG.SHEETS.DISPATCHER_FINANCE);
  if (!sheet) return { error: 'Лист Диспетчеры_Финансы не найден' };
  var rows = sheet.getDataRange().getValues();
  
  // Find by ID in column A
  for (var r = 1; r < rows.length; r++) {
    if (rows[r][0] === data.id) {
      var rowNum = r + 1;
      if (data.full_name) sheet.getRange(rowNum, 2).setValue(data.full_name);
      if (data.phone) sheet.getRange(rowNum, 3).setValue(data.phone);
      if (data.is_active !== undefined) sheet.getRange(rowNum, 4).setValue(data.is_active ? 'Активен' : 'Отключён');
      log('Синхронизация: обновлён диспетчер ' + data.id);
      return { message: 'Диспетчер обновлён', id: data.id };
    }
  }
  
  // Create new
  var id = data.id || generateUUID();
  sheet.appendRow([
    id,
    data.full_name || '',
    data.phone || '',
    data.is_active !== false ? 'Активен' : 'Отключён',
    new Date(),
    0,   // смен всего
    0,   // заработано
    0,   // получено
    0    // остаток
  ]);
  log('Синхронизация: создан диспетчер ' + id + ' (' + (data.full_name || '') + ')');
  return { message: 'Диспетчер создан', id: id };
}

/**
 * Проверяет и заполняет заголовки во всех листах
 */
function fixAllHeaders() {
  var fixed = [];
  
  // Employees headers
  var empSheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  var empHeaders = ['ID', 'ФИО', 'Телефон', 'Рейтинг', 'Активен', 'Дата добавления', 'Telegram', 'Примечание', 'Самозанятый', 'Налог %', 'Удержано налога'];
  fixSheetHeaders(empSheet, empHeaders, fixed, 'Сотрудники');
  
  // Clients headers
  var clSheet = getSheet(CONFIG.SHEETS.CLIENTS);
  var clHeaders = ['ID', 'Название', 'Контакт', 'Ставка клиента', 'Ставка рабочего', 'Дата добавления', 'Архив', 'Примечание', 'Услуг', 'Оплачено', 'Долг клиента', 'Наш долг', 'Статус расчётов'];
  fixSheetHeaders(clSheet, clHeaders, fixed, 'Клиенты');
  
  // Shifts headers
  var shSheet = getSheet(CONFIG.SHEETS.SHIFTS);
  var shHeaders = ['ID смены', 'ID назначения', 'Дата', 'Организация', 'Услуга', 'Рабочий', 'Начало', 'Конец', 'Часы', 'Коэфф.', 'Ставка', 'Начислено', 'Оплачено', 'Долг', 'Статус оплаты', 'Статус смены', 'Диспетчер', 'Адрес', 'Доплата', 'Штраф', 'Итого клиенту', 'Время'];
  fixSheetHeaders(shSheet, shHeaders, fixed, 'Смены');
  
  // Payments headers
  var paySheet = getSheet(CONFIG.SHEETS.PAYMENTS);
  var payHeaders = ['ID', 'Дата', 'Тип', 'Контрагент ID', 'Контрагент', 'Сумма', 'Способ', 'Статус', 'ID смены', 'Комментарий', 'Время'];
  fixSheetHeaders(paySheet, payHeaders, fixed, 'Платежи');
  
  log('Исправлены заголовки: ' + fixed.join(', '));
  return { message: 'Заголовки исправлены', fixed: fixed };
}

function fixSheetHeaders(sheet, headers, fixedLog, sheetName) {
  if (!sheet) return;
  for (var i = 0; i < headers.length; i++) {
    var cell = sheet.getRange(1, i + 1);
    var current = cell.getValue();
    if (!current || current.trim() === '') {
      cell.setValue(headers[i]);
      fixedLog.push(sheetName + ' col ' + (i + 1) + ': ' + headers[i]);
    }
  }
}

/**
 * Триггер onEdit — запускается при ручном изменении ячеек
 * Обеспечивает пересчёт при редактировании таблицы
 */
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  const sheetName = sheet.getName();
  const range = e.range;
  const row = range.getRow();
  const col = range.getColumn();
  
  // Пропускаем заголовки
  if (row <= 1) return;
  
  // Если изменили данные в Сменах — пересчитываем строку
  if (sheetName === CONFIG.SHEETS.SHIFTS) {
    // Проверяем что это колонка с данными (A-V)
    if (col >= 1 && col <= 22) {
      const data = sheet.getRange(row, 1, 1, 22).getValues()[0];
      if (!data[0]) return; // Пустая строка
      
      // Пересчитываем
      const startTime = data[6];
      const endTime = data[7];
      const coef = safeNumber(data[9]);
      const rate = safeNumber(data[10]);
      const paid = safeNumber(data[12]);
      const bonus = safeNumber(data[18]);
      const fine = safeNumber(data[19]);
      
      const hours = calcHours(startTime, endTime);
      const accrued = hours * coef * rate + bonus - fine;
      const debt = accrued - paid;
      
      let payStatus = '';
      if (accrued === 0) {
        payStatus = 'Не рассчитан';
      } else if (paid >= accrued) {
        payStatus = 'Оплачен';
      } else if (paid > 0) {
        payStatus = 'Частично оплачен';
      } else {
        payStatus = 'Не оплачен';
      }
      
      // Записываем только вычисляемые колонки
      sheet.getRange(row, 9).setValue(hours);
      sheet.getRange(row, 12).setValue(accrued);
      sheet.getRange(row, 14).setValue(debt);
      sheet.getRange(row, 15).setValue(payStatus);
      sheet.getRange(row, 21).setValue(accrued);
      sheet.getRange(row, 22).setValue(new Date());
      
      // === PUSH TO APP ===
      // Column A = shift_id, column B = assignment_id
      const shiftId = String(data[0]);
      const assignmentId = String(data[1]);
      
      if (shiftId && shiftId !== 'undefined') {
        // Update shift_assignments if assignment exists
        if (assignmentId && assignmentId !== 'undefined') {
          pushEditToApp('shift_assignments', assignmentId, {
            hours_worked: hours,
            rate_per_hour: rate,
            extra_amount: bonus - fine,
            paid_amount: paid
          });
        }
      }
    }
  }
  
  // Если изменили данные в Сотрудниках — push worker
  if (sheetName === CONFIG.SHEETS.EMPLOYEES) {
    const data = sheet.getRange(row, 1, 1, 11).getValues()[0];
    const workerId = String(data[0]);
    if (workerId && workerId !== 'undefined') {
      pushEditToApp('workers', workerId, {
        full_name: String(data[1] || ''),
        phone: String(data[2] || ''),
        is_active: data[4] !== false && data[4] !== 'FALSE' && data[4] !== ''
      });
    }
  }
  
  // Если изменили данные в Клиентах — push client
  if (sheetName === CONFIG.SHEETS.CLIENTS) {
    const data = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const clientId = String(data[0]);
    if (clientId && clientId !== 'undefined') {
      pushEditToApp('clients', clientId, {
        name: String(data[1] || ''),
        contact: String(data[2] || '')
      });
    }
  }
  
  // Если изменили данные в Платежах — обновляем взаиморасчёты
  if (sheetName === CONFIG.SHEETS.PAYMENTS) {
    updateClientSettlements();
    const data = sheet.getRange(row, 1, 1, 11).getValues()[0];
    const paymentId = String(data[0]);
    if (paymentId && paymentId !== 'undefined') {
      pushEditToApp('payments', paymentId, {
        paid_amount: safeNumber(data[5])
      });
    }
  }
}

// ============ PUSH TO APP (GAS → Supabase) ============

/**
 * Sends edited row data back to the Dispatcher.PRO Node.js app
 * Called from onEdit when user manually changes data in Google Sheets
 */
function pushEditToApp(table, id, data) {
  try {
    const WEBHOOK_URL = 'https://xn----gtbdan3bddhceo9d.xn--p1ai/api/gas-webhook';
    const SECRET = 'dp_gas_sync_2026';
    
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'X-GAS-Secret': SECRET
      },
      payload: JSON.stringify({ table: table, id: id, data: data }),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200) {
      log('Pushed to app: ' + table + '/' + id, 'SYNC');
    } else {
      log('Push failed: ' + table + '/' + id + ' - ' + response.getResponseCode() + ' ' + JSON.stringify(result), 'ERROR');
    }
    return result;
  } catch (e) {
    log('Push error: ' + table + '/' + id + ' - ' + e.toString(), 'ERROR');
    return { error: e.toString() };
  }
}

// ============ ФОРМАТИРОВАНИЕ ============

function formatDate(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return dd + '.' + mm + '.' + yyyy;
}

function formatTime(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.getHours) {
    return String(val.getHours()).padStart(2, '0') + ':' + String(val.getMinutes()).padStart(2, '0');
  }
  return String(val);
}

// ============ WEB APP HTML ============

/**
 * Возвращает HTML интерфейс приложения
 */
function getHtmlTemplate() {
  return HtmlService.createTemplateFromFile('Index');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============ ТРИГГЕРЫ ============

/**
 * Установить триггеры
 */
function installTriggers() {
  // Удаляем старые триггеры
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  
  // Триггер onEdit — не нужен, он встроенный
  // Но можно добавить триггер для регулярного пересчёта
  
  // Каждые 5 минут — пересчёт сводки
  ScriptApp.newTrigger('recalculateSummary')
    .timeBased()
    .everyMinutes(5)
    .create();
  
  // Каждые 10 минут — обновление взаиморасчётов
  ScriptApp.newTrigger('updateClientSettlements')
    .timeBased()
    .everyMinutes(10)
    .create();
  
  log('Триггеры установлены');
  return 'Триггеры установлены';
}

function fixShiftFormulas() {
  const sheet = getSheet(CONFIG.SHEETS.SHIFTS);
  if (!sheet) return 'Лист Смены не найден';
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return 'Нет данных';
  
  // Read all values and formulas
  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const formulas = range.getFormulas();
  const values = range.getValues();
  
  let fixed = 0;
  for (let r = 0; r < formulas.length; r++) {
    for (let c = 0; c < formulas[r].length; c++) {
      if (formulas[r][c] && String(formulas[r][c]).startsWith('=')) {
        // Replace formula with its current value
        const val = values[r][c];
        sheet.getRange(r + 2, c + 1).setValue(val);
        fixed++;
      }
    }
  }
  
  // After fixing formulas, recalculate with GAS
  recalculateAllShifts();
  recalculateSummary();
  
  log('Исправлено формул: ' + fixed);
  return 'Исправлено формул: ' + fixed;
}
