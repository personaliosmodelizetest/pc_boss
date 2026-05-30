/* ===========================================================
   装机大亨 · PC Parts Tycoon
   纯前端电脑配件低买高卖模拟经营游戏
   =========================================================== */

(function () {
  "use strict";

  const MAX_WEEK = 52;
  const START_CASH = 100000;
  const START_CAP = 60;
  const CAP_STEP = 25;
  const HISTORY_LEN = 16;
  const SAVE_KEY = "pc-parts-tycoon-save-v1";

  /* ---------- 配件定义 ----------
     base: 基础价格  vol: 周波动幅度(标准差比例)
     floor/ceil: 价格相对基础价的下限/上限倍数 */
  const PARTS = [
    { id: "cpu",  name: "CPU 处理器",   cat: "运算核心", pic: "🧠", base: 2200, vol: 0.10, floor: 0.45, ceil: 2.4 },
    { id: "gpu",  name: "显卡 GPU",     cat: "图形核心", pic: "🎮", base: 4500, vol: 0.18, floor: 0.35, ceil: 4.0 },
    { id: "ram",  name: "内存 RAM",     cat: "存储",     pic: "📊", base: 600,  vol: 0.14, floor: 0.4,  ceil: 3.2 },
    { id: "mb",   name: "主板",         cat: "平台",     pic: "🔌", base: 1300, vol: 0.09, floor: 0.5,  ceil: 2.2 },
    { id: "ssd",  name: "固态硬盘 SSD", cat: "存储",     pic: "💾", base: 700,  vol: 0.12, floor: 0.4,  ceil: 2.6 },
    { id: "psu",  name: "电源 PSU",     cat: "供电",     pic: "⚡", base: 550,  vol: 0.08, floor: 0.55, ceil: 2.0 },
    { id: "case", name: "机箱",         cat: "结构",     pic: "🗄️", base: 400,  vol: 0.07, floor: 0.6,  ceil: 1.9 },
    { id: "cool", name: "散热器",       cat: "散热",     pic: "❄️", base: 350,  vol: 0.09, floor: 0.55, ceil: 2.1 },
  ];
  const PART_MAP = Object.fromEntries(PARTS.map((p) => [p.id, p]));

  /* ---------- 季节(每13周一季) ---------- */
  const SEASONS = [
    { name: "春季 · 平稳", mult: 1.0 },
    { name: "夏季 · 游戏旺季", mult: 1.06 },
    { name: "秋季 · 新品季", mult: 0.97 },
    { name: "冬季 · 年末促销", mult: 1.03 },
  ];

  /* ---------- 市场事件 ----------
     effects: { partId: 倍率 }  tone: good/bad/neutral
     倍率作用于当周价格冲击, 之后会逐渐均值回归 */
  const EVENTS = [
    { icon: "⛏️", title: "加密货币挖矿热潮", desc: "矿工疯狂扫货，显卡需求暴涨、价格飙升！", tone: "bad",
      eff: { gpu: [1.45, 1.85] } },
    { icon: "💥", title: "加密货币崩盘", desc: "矿难来袭，二手显卡疯狂抛售，显卡价格雪崩。", tone: "good",
      eff: { gpu: [0.5, 0.7] } },
    { icon: "🆕", title: "新一代显卡发布", desc: "新卡上市，上代显卡降价清仓。", tone: "good",
      eff: { gpu: [0.68, 0.85] } },
    { icon: "🏭", title: "内存原厂减产", desc: "存储颗粒减产，内存与固态价格上涨。", tone: "bad",
      eff: { ram: [1.35, 1.6], ssd: [1.15, 1.35] } },
    { icon: "📉", title: "内存价格战", desc: "厂商打响价格战，内存大幅跳水。", tone: "good",
      eff: { ram: [0.6, 0.8] } },
    { icon: "🛒", title: "618 / 双11 大促", desc: "电商大促，全线需求高涨，价格普遍上扬。", tone: "bad",
      eff: { cpu: [1.12, 1.25], gpu: [1.12, 1.28], ram: [1.1, 1.2], mb: [1.08, 1.18], ssd: [1.1, 1.2] } },
    { icon: "🚚", title: "海运物流中断", desc: "供应链受阻，多类进口配件出现短缺。", tone: "bad",
      eff: { cpu: [1.2, 1.45], mb: [1.2, 1.4], psu: [1.15, 1.3] } },
    { icon: "🛂", title: "进口关税上调", desc: "关税提高，整体进货成本上升。", tone: "bad",
      eff: { cpu: [1.1, 1.22], gpu: [1.1, 1.22], mb: [1.08, 1.18] } },
    { icon: "🤖", title: "AI 算力需求爆发", desc: "AI 训练抢购高端显卡，显卡与内存齐涨。", tone: "bad",
      eff: { gpu: [1.4, 1.75], ram: [1.15, 1.3] } },
    { icon: "🎯", title: "3A 游戏大作发布", desc: "玩家升级装备，显卡与处理器需求上升。", tone: "bad",
      eff: { gpu: [1.18, 1.4], cpu: [1.12, 1.28] } },
    { icon: "💽", title: "固态硬盘大降价", desc: "新工艺量产，SSD 价格走低。", tone: "good",
      eff: { ssd: [0.6, 0.8] } },
    { icon: "🔧", title: "主板芯片组缺货", desc: "芯片组供应紧张，主板价格上涨。", tone: "bad",
      eff: { mb: [1.25, 1.5] } },
    { icon: "📜", title: "电源新国标实施", desc: "认证成本上升，电源价格走高。", tone: "bad",
      eff: { psu: [1.15, 1.35] } },
    { icon: "🏪", title: "厂商清仓补贴", desc: "厂商发放补贴清库存，随机配件低价甩卖。", tone: "good",
      eff: "RANDOM_DOWN" },
    { icon: "📦", title: "渠道囤货抢购", desc: "渠道商囤货，随机配件价格被炒高。", tone: "bad",
      eff: "RANDOM_UP" },
    { icon: "🌤️", title: "平静的一周", desc: "市场风平浪静，价格小幅随机波动。", tone: "neutral",
      eff: {} },
    { icon: "🌤️", title: "市场观望情绪", desc: "买家持币观望，成交清淡，价格略有回落。", tone: "neutral",
      eff: { cpu: [0.92, 1.0], gpu: [0.9, 1.0], ram: [0.92, 1.0] } },
    { icon: "🔥", title: "电商爆款种草", desc: "网红带货引爆某款配件，需求骤增。", tone: "bad",
      eff: "RANDOM_UP" },
  ];

  /* ---------- 工具函数 ---------- */
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randn() {
    // Box-Muller 近似正态分布
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fmt(n) { return "¥" + Math.round(n).toLocaleString("zh-CN"); }

  /* ---------- 游戏状态 ---------- */
  let state = null;

  function newGame() {
    state = {
      week: 1,
      cash: START_CASH,
      cap: START_CAP,
      prices: {},
      prevPrices: {},
      history: {},
      inv: {},        // { id: { qty, avgCost } }
      currentEvent: null,
      over: false,
    };
    PARTS.forEach((p) => {
      const start = Math.round(p.base * rand(0.9, 1.1));
      state.prices[p.id] = start;
      state.prevPrices[p.id] = start;
      state.history[p.id] = [start];
      state.inv[p.id] = { qty: 0, avgCost: 0 };
    });
    state.currentEvent = {
      icon: "📰", title: "开业大吉",
      desc: "欢迎来到电脑配件批发市场！趁低价囤货，等行情上涨再出手。",
      tone: "neutral",
    };
    save();
    render();
    setLog("新游戏开始，祝你生意兴隆！", "ok");
  }

  function seasonOf(week) {
    return SEASONS[Math.floor((week - 1) / 13) % 4];
  }

  /* ---------- 周结算: 推进到下一周并刷新价格 ---------- */
  function advanceWeek() {
    if (state.over) return;
    if (state.week >= MAX_WEEK) { endGame(false); return; }

    state.week += 1;

    // 选取事件
    const ev = JSON.parse(JSON.stringify(pickRandom(EVENTS)));
    let effects = {};
    if (ev.eff === "RANDOM_DOWN") {
      const t = pickRandom(PARTS).id;
      effects[t] = rand(0.62, 0.82);
      ev.desc = `${PART_MAP[t].name} 大幅降价，抄底好时机！`;
    } else if (ev.eff === "RANDOM_UP") {
      const t = pickRandom(PARTS).id;
      effects[t] = rand(1.25, 1.6);
      ev.desc = `${PART_MAP[t].name} 被疯抢，价格水涨船高。`;
    } else {
      for (const k in ev.eff) effects[k] = rand(ev.eff[k][0], ev.eff[k][1]);
    }
    ev.appliedEff = effects;
    state.currentEvent = { icon: ev.icon, title: ev.title, desc: ev.desc, tone: ev.tone };

    const season = seasonOf(state.week);

    // 更新价格
    PARTS.forEach((p) => {
      const old = state.prices[p.id];
      state.prevPrices[p.id] = old;

      // 1) 均值回归 (向季节调整后的基础价靠拢)
      const target = p.base * season.mult;
      let price = old + (target - old) * 0.12;
      // 2) 日常随机波动
      price *= 1 + randn() * p.vol;
      // 3) 事件冲击
      if (effects[p.id]) price *= effects[p.id];
      // 4) 限幅
      price = clamp(price, p.base * p.floor, p.base * p.ceil);
      price = Math.max(1, Math.round(price));

      state.prices[p.id] = price;
      const h = state.history[p.id];
      h.push(price);
      if (h.length > HISTORY_LEN) h.shift();
    });

    checkBankruptcy();
    save();
    render();
    if (!state.over && state.week >= MAX_WEEK) {
      // 到达最后一周, 提示
      setLog(`已是最后一周(第 ${MAX_WEEK} 周)，清仓后结算吧！`, "");
    }
  }

  function checkBankruptcy() {
    const invVal = inventoryValue();
    if (state.cash < 0 && invVal <= 0) {
      endGame(true);
    }
  }

  /* ---------- 交易 ---------- */
  function usedCap() {
    return PARTS.reduce((s, p) => s + state.inv[p.id].qty, 0);
  }
  function inventoryValue() {
    return PARTS.reduce((s, p) => s + state.inv[p.id].qty * state.prices[p.id], 0);
  }
  function netWorth() {
    return state.cash + inventoryValue();
  }

  function buy(id, qty) {
    if (state.over) return;
    qty = Math.floor(qty);
    if (!qty || qty <= 0) { setLog("请输入正确的数量", "err"); return; }
    const price = state.prices[id];
    const cost = price * qty;
    if (cost > state.cash) { setLog("现金不足，买不起这么多。", "err"); return; }
    if (usedCap() + qty > state.cap) {
      setLog(`仓库容量不足（剩余 ${state.cap - usedCap()} 件），可扩建仓库。`, "err");
      return;
    }
    const it = state.inv[id];
    const newQty = it.qty + qty;
    it.avgCost = (it.avgCost * it.qty + cost) / newQty;
    it.qty = newQty;
    state.cash -= cost;
    save();
    render();
    setLog(`买入 ${qty} 件 ${PART_MAP[id].name}，花费 ${fmt(cost)}。`, "ok");
  }

  function sell(id, qty) {
    if (state.over) return;
    qty = Math.floor(qty);
    if (!qty || qty <= 0) { setLog("请输入正确的数量", "err"); return; }
    const it = state.inv[id];
    if (qty > it.qty) { setLog(`持有不足，仅有 ${it.qty} 件。`, "err"); return; }
    const price = state.prices[id];
    const revenue = price * qty;
    const profit = (price - it.avgCost) * qty;
    it.qty -= qty;
    if (it.qty === 0) it.avgCost = 0;
    state.cash += revenue;
    save();
    render();
    const tag = profit >= 0 ? "ok" : "err";
    const word = profit >= 0 ? "赚" : "亏";
    setLog(`卖出 ${qty} 件 ${PART_MAP[id].name}，收入 ${fmt(revenue)}，${word} ${fmt(Math.abs(profit))}。`, tag);
  }

  function expandWarehouse() {
    if (state.over) return;
    const cost = Math.round(8000 * Math.pow(1.5, (state.cap - START_CAP) / CAP_STEP));
    if (cost > state.cash) { setLog(`扩建需 ${fmt(cost)}，现金不足。`, "err"); return; }
    state.cash -= cost;
    state.cap += CAP_STEP;
    save();
    render();
    setLog(`仓库扩建至 ${state.cap} 件，花费 ${fmt(cost)}。`, "ok");
  }

  /* ---------- 结束 ---------- */
  function endGame(bankrupt) {
    state.over = true;
    save();
    const worth = netWorth();
    let rank, title, desc;
    if (bankrupt) {
      title = "💀 破产清算";
      desc = "现金见底且无货可卖，生意做不下去了……再接再厉！";
      rank = "F";
    } else {
      title = "📅 一年经营结束";
      const ratio = worth / START_CASH;
      if (ratio >= 5) { rank = "S · 配件帝国"; }
      else if (ratio >= 3) { rank = "A · 行业大佬"; }
      else if (ratio >= 2) { rank = "B · 精明商人"; }
      else if (ratio >= 1.2) { rank = "C · 小有盈余"; }
      else if (ratio >= 1) { rank = "D · 勉强保本"; }
      else { rank = "E · 入不敷出"; }
      desc = `初始资金 ${fmt(START_CASH)}，一年后净资产 ${fmt(worth)}（${(ratio * 100).toFixed(0)}%）。`;
    }
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalDesc").textContent = desc;
    document.getElementById("finalWorth").textContent = fmt(Math.max(0, worth));
    document.getElementById("finalRank").textContent = rank;
    document.getElementById("modalOverlay").hidden = false;
    render();
  }

  /* ---------- 存档 ---------- */
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !s.prices || !s.inv) return false;
      state = s;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 渲染 ---------- */
  function sparkline(hist, w, h) {
    if (!hist || hist.length < 2) return "";
    const min = Math.min(...hist), max = Math.max(...hist);
    const range = max - min || 1;
    const step = w / (hist.length - 1);
    const pts = hist.map((v, i) => {
      const x = (i * step).toFixed(1);
      const y = (h - ((v - min) / range) * h).toFixed(1);
      return `${x},${y}`;
    }).join(" ");
    const rising = hist[hist.length - 1] >= hist[0];
    const color = rising ? "#22c55e" : "#ef4444";
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <polyline fill="none" stroke="${color}" stroke-width="1.6" points="${pts}" />
    </svg>`;
  }

  function render() {
    const season = seasonOf(state.week);
    document.getElementById("week").textContent = state.week;
    document.getElementById("maxWeek").textContent = MAX_WEEK;
    document.getElementById("season").textContent = season.name;
    document.getElementById("cash").textContent = fmt(state.cash);
    document.getElementById("netWorth").textContent = fmt(netWorth());
    document.getElementById("usedCap").textContent = usedCap();
    document.getElementById("cap").textContent = state.cap;

    // 事件
    const ev = state.currentEvent || {};
    document.getElementById("eventIcon").textContent = ev.icon || "📰";
    document.getElementById("eventTitle").textContent = ev.title || "";
    document.getElementById("eventDesc").textContent = ev.desc || "";
    const banner = document.getElementById("eventBanner");
    banner.classList.remove("good", "bad");
    if (ev.tone === "good") banner.classList.add("good");
    else if (ev.tone === "bad") banner.classList.add("bad");
    // 重新触发动画
    banner.style.animation = "none";
    void banner.offsetWidth;
    banner.style.animation = "";

    // 扩建按钮文案
    const expandCost = Math.round(8000 * Math.pow(1.5, (state.cap - START_CAP) / CAP_STEP));
    document.getElementById("expandBtn").textContent = `扩建 +${CAP_STEP}（${fmt(expandCost)}）`;

    // 行情表
    const body = document.getElementById("marketBody");
    body.innerHTML = "";
    PARTS.forEach((p) => {
      const price = state.prices[p.id];
      const prev = state.prevPrices[p.id];
      const chg = price - prev;
      const chgPct = prev ? (chg / prev) * 100 : 0;
      let dir = "flat", arrow = "▬";
      if (chg > 0) { dir = "up"; arrow = "▲"; }
      else if (chg < 0) { dir = "down"; arrow = "▼"; }

      const it = state.inv[p.id];
      const pnl = it.qty > 0 ? (price - it.avgCost) * it.qty : 0;
      let pnlDir = "flat";
      if (pnl > 0) pnlDir = "up"; else if (pnl < 0) pnlDir = "down";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="part-name">
            <span class="pic">${p.pic}</span>
            <span><span class="nm">${p.name}</span><br/><span class="cat">${p.cat}</span></span>
          </div>
        </td>
        <td class="price">${fmt(price)}</td>
        <td class="chg ${dir}">${arrow} ${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(1)}%</td>
        <td>${sparkline(state.history[p.id], 84, 26)}</td>
        <td>${it.qty}</td>
        <td>${it.qty > 0 ? fmt(it.avgCost) : "—"}</td>
        <td class="pnl ${pnlDir}">${it.qty > 0 ? (pnl >= 0 ? "+" : "") + fmt(pnl) : "—"}</td>
        <td class="trade-col">
          <div class="trade">
            <input class="qty" type="number" min="1" value="1" data-qty="${p.id}" />
            <button class="buy-btn" data-buy="${p.id}" ${state.over ? "disabled" : ""}>买</button>
            <button class="sell-btn" data-sell="${p.id}" ${state.over || it.qty === 0 ? "disabled" : ""}>卖</button>
          </div>
        </td>`;
      body.appendChild(tr);
    });

    // 绑定交易按钮
    body.querySelectorAll("[data-buy]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-buy");
        const q = body.querySelector(`[data-qty="${id}"]`).value;
        buy(id, Number(q));
      }));
    body.querySelectorAll("[data-sell]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-sell");
        const q = body.querySelector(`[data-qty="${id}"]`).value;
        sell(id, Number(q));
      }));

    // 下一周按钮文案
    const nextBtn = document.getElementById("nextWeekBtn");
    nextBtn.disabled = state.over;
    nextBtn.textContent = state.week >= MAX_WEEK ? "结算本局 🏁" : "进入下一周 ▶";
  }

  function setLog(msg, cls) {
    const el = document.getElementById("log");
    el.className = "log";
    el.innerHTML = `<span class="${cls || ""}">${msg}</span>`;
  }

  /* ---------- 事件绑定 ---------- */
  function bindUI() {
    document.getElementById("nextWeekBtn").addEventListener("click", advanceWeek);
    document.getElementById("expandBtn").addEventListener("click", expandWarehouse);
    document.getElementById("newGameBtn").addEventListener("click", () => {
      if (confirm("确定要重新开始吗？当前进度会丢失。")) {
        document.getElementById("modalOverlay").hidden = true;
        newGame();
      }
    });
    document.getElementById("modalRestart").addEventListener("click", () => {
      document.getElementById("modalOverlay").hidden = true;
      newGame();
    });
    document.getElementById("helpBtn").addEventListener("click", () => {
      document.getElementById("helpOverlay").hidden = false;
    });
    document.getElementById("helpClose").addEventListener("click", () => {
      document.getElementById("helpOverlay").hidden = true;
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    bindUI();
    if (load()) {
      render();
      if (state.over) {
        // 若读档时已结束, 也可重新开局
      }
      setLog("已读取上次存档，继续经营。", "");
    } else {
      newGame();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
