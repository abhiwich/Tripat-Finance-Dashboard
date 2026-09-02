(function () {
  const config = window.DashboardConfig;
  const sheets = window.DashboardSheets;
  const charts = window.DashboardCharts;
  const refreshMs = config.refreshIntervalMs || 5000;
  const authStorageKey = "tripat_dashboard_auth_session";

  const authGate = document.getElementById("auth-gate");
  const authForm = document.getElementById("auth-form");
  const authPhoneInput = document.getElementById("auth-phone");
  const authMessageEl = document.getElementById("auth-message");
  const dashboardPage = document.getElementById("dashboard-page");
  const viewerInfoEl = document.getElementById("viewer-info");
  const viewerNameEl = document.getElementById("viewer-name");
  const logoutBtn = document.getElementById("logout-btn");
  const titleEl = document.getElementById("dashboard-title");
  const subtitleEl = document.getElementById("dashboard-subtitle");
  const statusEl = document.getElementById("status");
  const incomeEl = document.getElementById("kpi-income");
  const refundsEl = document.getElementById("kpi-refunds");
  const expenseEl = document.getElementById("kpi-expense");
  const balanceEl = document.getElementById("kpi-balance");
  const balanceNoteEl = document.getElementById("kpi-balance-note");
  const recentBody = document.getElementById("recent-body");
  const versionEl = document.getElementById("app-version");
  if (versionEl) {
    versionEl.textContent = "เวอร์ชัน " + (config.version || "—");
  }
  const showCategory = !document.querySelector(".chart-wide[hidden]");
  const showRecent = !document.querySelector(".table-card[hidden]");

  const incomeChart = charts.createBarChart({
    canvas: document.getElementById("income-chart"),
    legend: document.getElementById("income-legend"),
    tooltip: document.getElementById("income-tooltip"),
    srTable: document.getElementById("income-sr-table"),
    palette: config.colors.income,
    orientation: "horizontal",
  });

  const teamChart = charts.createBarChart({
    canvas: document.getElementById("team-chart"),
    legend: document.getElementById("team-legend"),
    tooltip: document.getElementById("team-tooltip"),
    srTable: document.getElementById("team-sr-table"),
    palette: config.colors.team,
    mode: "team",
    orientation: "horizontal",
  });

  const categoryChart = showCategory
    ? charts.createBarChart({
        canvas: document.getElementById("category-chart"),
        legend: document.getElementById("category-legend"),
        tooltip: document.getElementById("category-tooltip"),
        srTable: document.getElementById("category-sr-table"),
        palette: config.colors.category,
      })
    : null;

  let hasData = false;
  let loading = false;
  let timer = null;
  let authPassed = false;

  function setStatus(message, kind) {
    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.className = "status" + (kind ? " status-" + kind : "");
  }

  function formatKpi(value) {
    if (value == null) return "—";
    return Math.round(value).toLocaleString("en-US");
  }

  function clearDashboard() {
    incomeEl.textContent = "—";
    refundsEl.textContent = "—";
    expenseEl.textContent = "—";
    balanceEl.textContent = "—";
    balanceNoteEl.hidden = true;
    incomeChart.setData([]);
    teamChart.setData([]);
    if (categoryChart) categoryChart.setData([]);
    if (showRecent && recentBody) recentBody.innerHTML = "";
  }

  function renderRecent(rows) {
    if (!recentBody) return;
    recentBody.innerHTML = "";
    if (!rows.length) {
      const empty = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "ไม่มีรายการ";
      empty.appendChild(cell);
      recentBody.appendChild(empty);
      return;
    }
    rows.forEach(function (item) {
      const row = document.createElement("tr");
      [item.date, item.team, item.description, charts.formatFull(item.amount)].forEach(
        function (text, index) {
          const cell = document.createElement("td");
          cell.textContent = text == null || text === "" ? "—" : text;
          if (index === 3) cell.className = "num";
          row.appendChild(cell);
        }
      );
      recentBody.appendChild(row);
    });
  }

  function render(data) {
    const title = data.title || config.titleFallback;
    titleEl.textContent = title;
    document.title = title;
    subtitleEl.textContent = data.subtitle || "";
    subtitleEl.hidden = !data.subtitle;

    incomeEl.textContent = formatKpi(data.income);
    refundsEl.textContent = formatKpi(data.refunds);
    expenseEl.textContent = formatKpi(data.expense);
    balanceEl.textContent = formatKpi(data.balance);
    balanceNoteEl.hidden = !(data.balance != null && data.balance < 0);

    incomeChart.setData(data.incomeBySource);
    teamChart.setData(data.expenseByTeam);
    if (categoryChart) categoryChart.setData(data.expenseByCategory);
    if (showRecent) renderRecent(data.recent || []);
    hasData = true;
  }

  function showError() {
    clearDashboard();
    hasData = false;
    setStatus("ไม่สามารถอ่าน Google Sheets ได้", "error");
  }

  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    if (!hasData) setStatus("กำลังโหลดข้อมูล", "loading");
    try {
      const data = await sheets.loadDashboard(config);
      render(data);
      setStatus("");
    } catch (error) {
      console.error(error);
      if (!hasData || error.code === "PERMISSION") {
        showError();
      }
    } finally {
      loading = false;
    }
  }

  function startPolling() {
    refresh();
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(refresh, refreshMs);
  }

  document.addEventListener("visibilitychange", function () {
    if (!authPassed) return;
    if (document.hidden) {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      return;
    }
    startPolling();
  });

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function setAuthMessage(message, kind) {
    if (!authMessageEl) return;
    authMessageEl.textContent = message || "";
    authMessageEl.className = "auth-message" + (kind ? " " + kind : "");
  }

  async function loadAllowedPhones() {
    const response = await fetch("json/phone.json", { cache: "no-store" });
    if (!response.ok) throw new Error("PHONE_LIST_HTTP_" + response.status);
    const rows = await response.json();
    const phones = new Map();
    (rows || []).forEach(function (item) {
      const normalized = normalizePhone(item && item.phone);
      if (!normalized || phones.has(normalized)) return;
      phones.set(normalized, String((item && item.name) || "").trim() || normalized);
    });
    return phones;
  }

  function readStoredSession() {
    const raw = window.localStorage.getItem(authStorageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const phone = normalizePhone(parsed.phone);
      const name = String(parsed.name || "").trim();
      if (!phone) return null;
      return { phone: phone, name: name };
    } catch (_error) {
      const legacyPhone = normalizePhone(raw);
      return legacyPhone ? { phone: legacyPhone, name: "" } : null;
    }
  }

  function saveSession(user) {
    window.localStorage.setItem(
      authStorageKey,
      JSON.stringify({
        phone: user.phone,
        name: user.name || "",
      })
    );
  }

  function showViewer(user) {
    if (!viewerInfoEl || !viewerNameEl) return;
    const displayName = String((user && user.name) || "").trim();
    viewerNameEl.textContent = displayName ? "ผู้ปกครอง: " + displayName : "ผู้ปกครอง: " + user.phone;
    viewerInfoEl.hidden = false;
  }

  function unlockDashboard(user) {
    authPassed = true;
    if (authGate) authGate.hidden = true;
    if (dashboardPage) dashboardPage.hidden = false;
    if (user) showViewer(user);
    startPolling();
  }

  async function initAuth() {
    if (!authGate || !authForm || !authPhoneInput) {
      unlockDashboard();
      return;
    }

    if (dashboardPage) dashboardPage.hidden = true;
    authGate.hidden = false;

    let allowedPhones;
    try {
      allowedPhones = await loadAllowedPhones();
    } catch (error) {
      console.error(error);
      setAuthMessage("โหลดรายชื่อผู้ปกครองไม่สำเร็จ กรุณารีเฟรชหน้า", "error");
      return;
    }

    const rememberedSession = readStoredSession();
    if (rememberedSession && allowedPhones.has(rememberedSession.phone)) {
      const mappedName = allowedPhones.get(rememberedSession.phone);
      unlockDashboard({
        phone: rememberedSession.phone,
        name: mappedName || rememberedSession.name || "",
      });
      return;
    }

    authForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const rawPhone = authPhoneInput.value;
      const normalizedInput = normalizePhone(rawPhone);
      if (!normalizedInput) {
        setAuthMessage("กรุณากรอกเบอร์โทรศัพท์ก่อน", "error");
        authPhoneInput.focus();
        return;
      }

      authForm.querySelector("button").disabled = true;
      setAuthMessage("กำลังตรวจสอบสิทธิ์...", "");
      try {
        const parentName = allowedPhones.get(normalizedInput);
        if (!parentName) {
          setAuthMessage("ไม่พบเบอร์โทรนี้ในรายชื่อผู้ปกครอง ป.1", "error");
          return;
        }
        const session = { phone: normalizedInput, name: parentName };
        saveSession(session);
        setAuthMessage("ยืนยันสำเร็จ กำลังเข้าสู่ Dashboard...", "success");
        unlockDashboard(session);
      } catch (error) {
        console.error(error);
        setAuthMessage("ไม่สามารถตรวจสอบสิทธิ์ได้ กรุณาลองใหม่", "error");
      } finally {
        authForm.querySelector("button").disabled = false;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      window.localStorage.removeItem(authStorageKey);
      window.location.reload();
    });
  }

  initAuth();

  (function setupPullToRefresh() {
    const indicator = document.getElementById("pull-refresh");
    if (!indicator) return;

    const threshold = 72;
    let startY = 0;
    let pulling = false;
    let distance = 0;
    let armed = false;

    function atTop() {
      return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    }

    function setPull(px, label) {
      distance = Math.max(0, px);
      indicator.style.height = Math.min(distance, 96) + "px";
      indicator.style.paddingBottom = distance > 8 ? "10px" : "0";
      indicator.textContent = label;
      indicator.setAttribute("aria-hidden", distance > 0 ? "false" : "true");
    }

    function resetPull() {
      pulling = false;
      armed = false;
      distance = 0;
      indicator.style.height = "0px";
      indicator.style.paddingBottom = "0";
      indicator.setAttribute("aria-hidden", "true");
    }

    document.addEventListener(
      "touchstart",
      function (event) {
        if (!event.touches || event.touches.length !== 1) return;
        if (event.target.closest && event.target.closest(".table-wrap")) return;
        if (!atTop()) {
          pulling = false;
          return;
        }
        startY = event.touches[0].clientY;
        pulling = true;
        armed = false;
      },
      { passive: true }
    );

    document.addEventListener(
      "touchmove",
      function (event) {
        if (!pulling || !event.touches || event.touches.length !== 1) return;
        const dy = event.touches[0].clientY - startY;
        if (dy <= 0 || !atTop()) {
          if (distance) setPull(0, "รูดลงเพื่อรีเฟรช");
          return;
        }
        const px = Math.min(dy * 0.45, 96);
        armed = px >= threshold;
        setPull(px, armed ? "ปล่อยเพื่อรีเฟรช" : "รูดลงเพื่อรีเฟรช");
        if (px > 12 && event.cancelable) event.preventDefault();
      },
      { passive: false }
    );

    document.addEventListener(
      "touchend",
      function () {
        if (!pulling) return;
        if (armed) {
          setPull(Math.max(distance, 56), "กำลังรีเฟรช…");
          window.location.reload();
          return;
        }
        resetPull();
      },
      { passive: true }
    );

    document.addEventListener("touchcancel", resetPull, { passive: true });
  })();
})();
