(function (global) {
  function parseCsv(text) {
    const input = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (inQuotes) {
        if (char === '"') {
          if (input[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char !== "\r") {
        field += char;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function columnIndex(letter) {
    let index = 0;
    const col = String(letter || "").toUpperCase();
    for (let i = 0; i < col.length; i += 1) {
      index = index * 26 + (col.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  function cellAt(rows, rowIndex, colIndex) {
    const row = rows[rowIndex];
    if (!row) return "";
    const value = row[colIndex];
    return value == null ? "" : String(value).trim();
  }

  function getCell(rows, a1) {
    const match = /^([A-Za-z]+)(\d+)$/.exec(String(a1 || "").trim());
    if (!match) return "";
    return cellAt(rows, Number(match[2]) - 1, columnIndex(match[1]));
  }

  function normalize(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function parseAmount(raw) {
    if (raw == null) return null;
    const cleaned = String(raw)
      .replace(/บาท/gi, "")
      .replace(/฿/g, "")
      .replace(/,/g, "")
      .trim();
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatDateParts(year, month, day) {
    return pad2(day) + "/" + pad2(month) + "/" + year;
  }

  function parseDate(raw) {
    if (raw == null || String(raw).trim() === "") return "";
    const text = String(raw).trim();
    const serial = Number(text.replace(/,/g, ""));
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
      const date = new Date(utc);
      return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (iso) return formatDateParts(iso[1], iso[2], iso[3]);
    const dmy = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(text);
    if (dmy) return formatDateParts(dmy[3], dmy[2], dmy[1]);
    return text;
  }

  const SECTION_ALIASES = {
    "A. FINANCIAL OVERVIEW": ["FINANCIAL OVERVIEW", "FINANCIAL OVERVIEW"],
    "B. INCOME BY SOURCE": ["INCOME BY SOURCE", "INCOME BY SOURCE"],
    "C. EXPENSE BY TEAM": ["EXPENSE BY TEAM", "EXPENSE BY TEAM"],
    "D. EXPENSE BY CATEGORY": ["EXPENSE BY CATEGORY", "EXPENSE BY CATEGORY"],
    "E. RECENT TRANSACTIONS": ["RECENT TRANSACTIONS", "RECENT TRANSACTIONS"],
  };

  function headingMatches(cell, needle) {
    const value = normalize(cell);
    if (!value) return false;
    const target = normalize(needle);
    const aliases = (SECTION_ALIASES[target] || []).concat([target]);
    return aliases.some(function (alias) {
      return value === alias || value.indexOf(alias) >= 0;
    });
  }

  function findRow(rows, needle, colIndex) {
    for (let r = 0; r < rows.length; r += 1) {
      const start = colIndex == null ? 0 : colIndex;
      const end = colIndex == null ? Math.max((rows[r] || []).length, 1) : colIndex + 1;
      for (let c = start; c < end; c += 1) {
        if (headingMatches(cellAt(rows, r, c), needle)) return r;
      }
    }
    return -1;
  }

  function isTotal(name) {
    return normalize(name) === "TOTAL";
  }

  function isRefundName(name) {
    const value = normalize(name);
    return value.indexOf("REFUND") >= 0 || value.indexOf("คืนเงิน") >= 0;
  }

  function readNamedSeries(rows, startRow, nameCol, valueCol, skipRefunds) {
    const items = [];
    for (let r = startRow; r < rows.length; r += 1) {
      const name = cellAt(rows, r, nameCol);
      if (!name) continue;
      if (isTotal(name)) break;
      if (skipRefunds && isRefundName(name)) continue;
      const value = parseAmount(cellAt(rows, r, valueCol));
      items.push({
        name: name,
        value: value == null ? 0 : value,
      });
    }
    return items;
  }

  const HEADER_ALIASES = {
    TEAM: ["TEAM"],
    TRANSFERRED: ["TRANSFERRED", "TRANSFERRED", "TOTAL PAYMENT"],
    REFUNDED: ["REFUNDED", "REFUNDED"],
    "NET SPENT": ["NET SPENT", "NET SPENT"],
    CATEGORY: ["CATEGORY", "CATEGORY"],
    AMOUNT: ["AMOUNT", "AMOUNT"],
    SOURCE: ["SOURCE", "SOURCE"],
    DATE: ["DATE", "DATE"],
    DESCRIPTION: ["DESCRIPTION", "DESCRIPTION"],
  };

  function headerMatches(cell, name) {
    const value = normalize(cell);
    const key = normalize(name);
    const aliases = HEADER_ALIASES[key] || [key];
    return aliases.some(function (alias) {
      if (value === alias) return true;
      if (key === "TEAM" && value.indexOf("TEAM /") === 0) return true;
      if (key === "SOURCE" && value.indexOf("SOURCE") >= 0 && value.indexOf("EXPENSE") < 0) {
        return value === "SOURCE" || value.indexOf("TEAM / SOURCE") === 0;
      }
      return false;
    });
  }

  function headerIndex(row, names) {
    const map = {};
    names.forEach(function (name) {
      map[name] = -1;
    });
    (row || []).forEach(function (cell, index) {
      names.forEach(function (name) {
        if (map[name] === -1 && headerMatches(cell, name)) {
          map[name] = index;
        }
      });
    });
    return map;
  }

  function readKpis(rows, config) {
    const result = {
      income: null,
      refunds: 0,
      expense: null,
      balance: null,
      hasRefundsColumn: false,
    };

    for (let r = 0; r < rows.length; r += 1) {
      const cols = {};
      (rows[r] || []).forEach(function (cell, c) {
        const label = normalize(cell);
        if (label === "TOTAL INCOME" || label === "TOTAL INCOME") cols.income = c;
        if (label === "TEAM REFUNDS" || label === "TEAM REFUNDS") cols.refunds = c;
        if (label === "TOTAL EXPENSE" || label === "TOTAL EXPENSE") cols.expense = c;
        if (label === "CURRENT BALANCE" || label === "CURRENT BALANCE") cols.balance = c;
      });
      if (cols.income == null) continue;

      const values = rows[r + 1] || [];
      result.income = parseAmount(values[cols.income]);
      result.expense = cols.expense != null ? parseAmount(values[cols.expense]) : null;
      result.balance = cols.balance != null ? parseAmount(values[cols.balance]) : null;
      if (cols.refunds != null) {
        result.hasRefundsColumn = true;
        result.refunds = parseAmount(values[cols.refunds]);
        if (result.refunds == null) result.refunds = 0;
      }
      break;
    }

    if (result.income == null) {
      result.income = parseAmount(getCell(rows, config.fallback.cells.income));
      result.refunds = parseAmount(getCell(rows, config.fallback.cells.refunds));
      result.expense = parseAmount(getCell(rows, config.fallback.cells.expense));
      result.balance = parseAmount(getCell(rows, config.fallback.cells.balance));
      result.hasRefundsColumn = result.refunds != null;
      if (result.refunds == null) result.refunds = 0;
    }

    return result;
  }

  function readIncome(rows, config) {
    const heading = findRow(rows, config.sections.income, 0);
    if (heading >= 0) {
      let headerRow = heading + 1;
      while (headerRow < rows.length && !normalize(cellAt(rows, headerRow, 0))) {
        headerRow += 1;
      }
      const headers = headerIndex(rows[headerRow], ["SOURCE", "AMOUNT"]);
      const nameCol = headers.SOURCE >= 0 ? headers.SOURCE : 0;
      const valueCol = headers.AMOUNT >= 0 ? headers.AMOUNT : 1;
      return readNamedSeries(rows, headerRow + 1, nameCol, valueCol, true);
    }
    return readNamedSeries(
      rows,
      config.fallback.income.startRow - 1,
      columnIndex(config.fallback.income.nameCol),
      columnIndex(config.fallback.income.valueCol),
      true
    );
  }

  function readTeams(rows, config) {
    const heading = findRow(rows, config.sections.team, 0);
    let headerRow = heading >= 0 ? heading + 1 : config.fallback.team.startRow - 2;
    while (headerRow < rows.length && !normalize(cellAt(rows, headerRow, 0))) {
      headerRow += 1;
    }
    const headers = headerIndex(rows[headerRow], [
      "TEAM",
      "TRANSFERRED",
      "REFUNDED",
      "NET SPENT",
      "TOTAL PAYMENT",
    ]);
    const nameCol = headers.TEAM >= 0 ? headers.TEAM : 0;
    const transferredCol =
      headers.TRANSFERRED >= 0
        ? headers.TRANSFERRED
        : headers["TOTAL PAYMENT"] >= 0
          ? headers["TOTAL PAYMENT"]
          : 1;
    const refundedCol = headers.REFUNDED >= 0 ? headers.REFUNDED : -1;
    const netCol = headers["NET SPENT"] >= 0 ? headers["NET SPENT"] : -1;

    const items = [];
    for (let r = headerRow + 1; r < rows.length; r += 1) {
      const name = cellAt(rows, r, nameCol);
      if (!name) continue;
      if (/^[A-E]\.\s/.test(name)) break;
      if (isTotal(name)) break;
      const transferred = parseAmount(cellAt(rows, r, transferredCol)) || 0;
      const refunded = refundedCol >= 0 ? parseAmount(cellAt(rows, r, refundedCol)) || 0 : 0;
      const net = parseAmount(cellAt(rows, r, netCol));
      const value = net == null ? transferred - refunded : net;
      items.push({
        name: name,
        value: value,
        transferred: transferred,
        refunded: refunded,
      });
    }
    return items;
  }

  function readCategories(rows, config) {
    const heading = findRow(rows, config.sections.category);
    if (heading >= 0) {
      const headingCol = (rows[heading] || []).findIndex(function (cell) {
        const value = normalize(cell);
        return (
          value.indexOf("EXPENSE BY CATEGORY") >= 0 ||
          value.indexOf("EXPENSE BY CATEGORY") >= 0
        );
      });
      const col = headingCol >= 0 ? headingCol : 3;
      let headerRow = heading;
      if (normalize(cellAt(rows, heading, col)) !== "CATEGORY") {
        headerRow = heading + 1;
      }
      const headers = headerIndex(rows[headerRow], ["CATEGORY", "AMOUNT"]);
      const nameCol = headers.CATEGORY >= 0 ? headers.CATEGORY : col;
      const valueCol = headers.AMOUNT >= 0 ? headers.AMOUNT : nameCol + 1;
      return readNamedSeries(rows, headerRow + 1, nameCol, valueCol, false);
    }
    return readNamedSeries(
      rows,
      config.fallback.category.startRow - 1,
      columnIndex(config.fallback.category.nameCol),
      columnIndex(config.fallback.category.valueCol),
      false
    );
  }

  function readRecent(rows, config) {
    const heading = findRow(rows, config.sections.recent, 0);
    let headerRow = heading >= 0 ? heading + 1 : config.fallback.recent.startRow - 2;
    while (headerRow < rows.length && !normalize(cellAt(rows, headerRow, 0))) {
      headerRow += 1;
    }
    const headers = headerIndex(rows[headerRow], ["DATE", "TEAM", "SOURCE", "DESCRIPTION", "AMOUNT"]);
    const dateCol = headers.DATE >= 0 ? headers.DATE : 0;
    const teamCol = headers.TEAM >= 0 ? headers.TEAM : headers.SOURCE >= 0 ? headers.SOURCE : 1;
    const descCol = headers.DESCRIPTION >= 0 ? headers.DESCRIPTION : 2;
    const amountCol = headers.AMOUNT >= 0 ? headers.AMOUNT : 3;
    const items = [];

    for (let r = headerRow + 1; r < rows.length && items.length < 10; r += 1) {
      const dateRaw = cellAt(rows, r, dateCol);
      const desc = cellAt(rows, r, descCol);
      if (!dateRaw) break;
      if (
        normalize(dateRaw).indexOf("วิธีใช้งาน") === 0 ||
        normalize(dateRaw).indexOf("ตารางนี้") === 0
      ) {
        break;
      }
      items.push({
        date: parseDate(dateRaw),
        team: cellAt(rows, r, teamCol),
        description: desc,
        amount: parseAmount(cellAt(rows, r, amountCol)),
      });
    }
    return items;
  }

  function looksLikeHtml(text) {
    const start = String(text || "").trim().slice(0, 15).toLowerCase();
    return start.startsWith("<!doctype") || start.startsWith("<html");
  }

  function permissionError(message) {
    const error = new Error(message || "PERMISSION");
    error.code = "PERMISSION";
    return error;
  }

  function hasUsableData(data) {
    return data.income != null && data.expense != null;
  }

  async function fetchCsv(url) {
    const separator = url.indexOf("?") >= 0 ? "&" : "?";
    const cacheBustUrl = url + separator + "_t=" + Date.now();
    const response = await fetch(cacheBustUrl, { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      throw permissionError("HTTP " + response.status);
    }
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const text = await response.text();
    if (!text.trim() || looksLikeHtml(text)) {
      throw permissionError("Did not receive CSV");
    }
    return text;
  }

  function parseDashboard(csvText, config) {
    const rows = parseCsv(csvText);
    const kpis = readKpis(rows, config);
    return {
      title: getCell(rows, config.fallback.cells.title) || config.titleFallback,
      subtitle: getCell(rows, config.fallback.cells.subtitle),
      income: kpis.income,
      refunds: kpis.refunds,
      expense: kpis.expense,
      balance: kpis.balance,
      incomeBySource: readIncome(rows, config),
      expenseByTeam: readTeams(rows, config),
      expenseByCategory: readCategories(rows, config),
      recent: readRecent(rows, config),
    };
  }

  async function loadDashboard(config) {
    let lastError = new Error("ไม่สามารถอ่าน Google Sheets ได้");

    for (let i = 0; i < config.csvUrls.length; i += 1) {
      try {
        const csvText = await fetchCsv(config.csvUrls[i]);
        const data = parseDashboard(csvText, config);
        if (hasUsableData(data)) {
          return data;
        }
        lastError = new Error("CSV did not match the cell map");
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  function headerLooksLike(value, names) {
    const label = normalize(value);
    return names.some(function (name) {
      return label === name || label.indexOf(name) === 0;
    });
  }

  function parsePhoneList(csvText) {
    const rows = parseCsv(csvText);
    if (!rows.length) return [];

    let headerRow = 0;
    let nameCol = 0;
    let phoneCol = 1;
    for (let r = 0; r < Math.min(rows.length, 5); r += 1) {
      const row = rows[r] || [];
      let foundName = -1;
      let foundPhone = -1;
      row.forEach(function (cell, index) {
        if (foundName < 0 && headerLooksLike(cell, ["NAME", "ชื่อ"])) foundName = index;
        if (foundPhone < 0 && headerLooksLike(cell, ["PHONE", "เบอร์", "TEL"])) foundPhone = index;
      });
      if (foundName >= 0 && foundPhone >= 0) {
        headerRow = r;
        nameCol = foundName;
        phoneCol = foundPhone;
        break;
      }
    }

    const items = [];
    for (let r = headerRow + 1; r < rows.length; r += 1) {
      const name = cellAt(rows, r, nameCol);
      const phone = cellAt(rows, r, phoneCol);
      if (!name && !phone) continue;
      items.push({ name: name, phone: phone });
    }
    return items;
  }

  async function loadPhoneList(config) {
    const phoneConfig = config && config.phoneList;
    const urls = phoneConfig && phoneConfig.csvUrls ? phoneConfig.csvUrls : [];
    let lastError = new Error("ไม่สามารถอ่านรายชื่อผู้ปกครองได้");

    for (let i = 0; i < urls.length; i += 1) {
      try {
        const csvText = await fetchCsv(urls[i]);
        const items = parsePhoneList(csvText);
        if (items.length) return items;
        lastError = new Error("Phone sheet had no rows");
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  global.DashboardSheets = {
    parseCsv: parseCsv,
    getCell: getCell,
    parseAmount: parseAmount,
    parseDate: parseDate,
    parseDashboard: parseDashboard,
    loadDashboard: loadDashboard,
    parsePhoneList: parsePhoneList,
    loadPhoneList: loadPhoneList,
  };
})(window);
