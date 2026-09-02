/**
 * Spreadsheet connection, section labels, and cell fallbacks.
 * Keep in sync with DESIGN_SPEC.md section 7.
 */
window.DashboardConfig = {
  spreadsheetId: "1eMr-oGMc1WcreQ69h4V8MRkTBz4sEQ1j1t4vbUMLvuU",
  gid: "0",
  sheetName: "01_Dashboard",
  csvUrls: [
    "https://docs.google.com/spreadsheets/d/1eMr-oGMc1WcreQ69h4V8MRkTBz4sEQ1j1t4vbUMLvuU/export?format=csv&gid=0",
    "https://docs.google.com/spreadsheets/d/1eMr-oGMc1WcreQ69h4V8MRkTBz4sEQ1j1t4vbUMLvuU/gviz/tq?tqx=out:csv&gid=0",
  ],
  titleFallback: "งาน Gift โรงเรียนไตรพัฒน์ — เงินกองกลาง",
  version: "1.0.2",
  refreshIntervalMs: 5000,
  phoneList: {
    spreadsheetId: "16AI3IFbP9ac2ll1tupaF6-7WEn4r4DQKK_zY1dxKaeA",
    gid: "0",
    csvUrls: [
      "https://docs.google.com/spreadsheets/d/16AI3IFbP9ac2ll1tupaF6-7WEn4r4DQKK_zY1dxKaeA/export?format=csv&gid=0",
      "https://docs.google.com/spreadsheets/d/16AI3IFbP9ac2ll1tupaF6-7WEn4r4DQKK_zY1dxKaeA/gviz/tq?tqx=out:csv&gid=0",
    ],
  },
  sections: {
    overview: "A. Financial Overview",
    income: "B. Income by Source",
    team: "C. Expense by Team",
    category: "D. Expense by Category",
    recent: "E. Recent Transactions",
  },
  fallback: {
    cells: {
      title: "A1",
      subtitle: "A2",
      income: "A6",
      refunds: "C6",
      expense: "E6",
      balance: "G6",
    },
    income: { startRow: 10, endRow: 16, nameCol: "A", valueCol: "B" },
    team: { startRow: 21, endRow: 26 },
    category: { startRow: 21, endRow: 28, nameCol: "F", valueCol: "G" },
    recent: { startRow: 33, endRow: 42 },
  },
  colors: {
    income: ["#3B6EF5", "#F5A524", "#8B5CF6", "#EC4899", "#84CC16", "#22D3EE", "#FACC15"],
    team: ["#3B6EF5", "#F5A524", "#8B5CF6", "#84CC16", "#22D3EE", "#FACC15"],
    category: ["#3B6EF5", "#F5A524", "#8B5CF6", "#EC4899", "#84CC16", "#22D3EE", "#FACC15", "#94A3B8"],
  },
};
