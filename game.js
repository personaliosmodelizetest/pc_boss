/* ===========================================================
   装机大亨 · PC Parts Tycoon  (v2)
   纯前端电脑配件低买高卖模拟经营游戏
   新增: 大宗商品(原油/铜)传导 · 银行存款 · 装机档口月度订单
   =========================================================== */

(function () {
  "use strict";

  const MAX_WEEK = 52;
  const START_CASH = 100000;
  const START_CAP = 60;
  const CAP_STEP = 25;
  const HISTORY_LEN = 16;
  const SAVE_KEY = "pc-parts-tycoon-save-v2";

  const BANK_RATE_ANNUAL = 0.052;             // 年化利率
  const BANK_RATE_WEEK = BANK_RATE_ANNUAL / 52; // 每周复利
  const ORDER_EVERY = 4;                       // 每 4 周(每月)一次档口订单

  /* ---------- 配件定义 ---------- */
  const PARTS = [
    { id: "cpu",  name: "CPU 处理器",   cat: "运算核心", pic: "🧠", base: 2200, vol: 0.10, floor: 0.45, ceil: 2.4 },
    { id: "gpu",  name: "显卡 GPU",     cat: "图形核心", pic: "🎮", base: 4500, vol: 0.18, floor: 0.35, ceil: 4.0 },
    { id: "ram",  name: "内存 RAM",     cat: "存储",     pic: "📊", base: 600,  vol: 0.14, floor: 0.4,  ceil: 3.2 },
    { id: "mb",   name: "主板",         cat: "平台",     pic: "🔌", base: 1300, vol: 0.09, floor: 0.5,  ceil: 2.2 },
    { id: "ssd",  name: "固态硬盘 SSD", cat: "存储",     pic: "💾", base: 700,  vol: 0.12, floor: 0.4,  ceil: 2.6 },
    { id: "psu",  name: "电源 PSU",     cat: "供电",     pic: "⚡", base: 550,  vol: 0.08, floor: 0.55, ceil: 2.2 },
    { id: "case", name: "机箱",         cat: "结构",     pic: "🗄️", base: 400,  vol: 0.07, floor: 0.6,  ceil: 2.1 },
    { id: "cool", name: "散热器",       cat: "散热",     pic: "❄️", base: 350,  vol: 0.09, floor: 0.55, ceil: 2.3 },
  ];
  const PART_MAP = Object.fromEntries(PARTS.map((p) => [p.id, p]));

  /* ---------- 大宗商品 ---------- */
  const COMMODITIES = [
    { id: "oil",    name: "原油", pic: "🛢️", vol: 0.07 },
    { id: "copper", name: "铜",   pic: "🟤", vol: 0.06 },
  ];
  // 传导权重: 商品指数偏离 1 时, 对配件成本的影响系数
  const COMMODITY_EFFECT = {
    oil:    { case: 0.50, cool: 0.25, psu: 0.15 },
    copper: { psu: 0.50, cool: 0.30, mb: 0.15 },
  };

  /* ---------- 季节(每13周一季) ---------- */
  const SEASONS = [
    { name: "春季 · 平稳", mult: 1.0 },
    { name: "夏季 · 游戏旺季", mult: 1.06 },
    { name: "秋季 · 新品季", mult: 0.97 },
    { name: "冬季 · 年末促销", mult: 1.03 },
  ];

  /* ---------- 市场事件 ----------
     eff:  { partId:[lo,hi] }  对配件的一次性价格冲击
     comm: { oil:[lo,hi], copper:[lo,hi] } 对大宗商品指数的冲击 */
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
    // —— 新增: 存储颗粒厂起火 / 域外产能 ——
    { icon: "🔥", title: "存储颗粒厂大火", desc: "晶圆厂突发大火停产，内存、固态硬盘大幅减产涨价！", tone: "bad",
      eff: { ram: [1.4, 1.75], ssd: [1.35, 1.65] } },
    { icon: "🏗️", title: "域外新厂投产", desc: "海外新建晶圆厂投产，存储产能释放，内存、固态走低。", tone: "good",
      eff: { ram: [0.6, 0.78], ssd: [0.62, 0.8] } },
    { icon: "🏗️", title: "海外产能爬坡", desc: "境外产线产能爬坡，供给增加，内存、固态承压回落。", tone: "good",
      eff: { ram: [0.72, 0.88], ssd: [0.74, 0.9] } },
    // —— 综合事件 ——
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
    // —— 大宗商品事件 (作用于指数, 再传导到配件) ——
    { icon: "🛢️", title: "地缘冲突推升油价", desc: "地缘局势紧张，国际油价大涨，机箱/散热器/电源成本上行。", tone: "bad",
      comm: { oil: [1.18, 1.42] } },
    { icon: "🛢️", title: "OPEC 增产，油价回落", desc: "产油国增产，油价回落，相关配件成本走低。", tone: "good",
      comm: { oil: [0.66, 0.84] } },
    { icon: "🟤", title: "智利铜矿大罢工", desc: "全球最大铜矿罢工停产，铜价飙升，电源/散热器成本大涨。", tone: "bad",
      comm: { copper: [1.2, 1.45] } },
    { icon: "🟤", title: "新铜矿投产", desc: "大型铜矿投产，铜价回落，电源/散热器成本下降。", tone: "good",
      comm: { copper: [0.7, 0.86] } },
    { icon: "📈", title: "大宗商品普涨", desc: "通胀升温，原油与铜齐涨，整机金属/塑料件成本上升。", tone: "bad",
      comm: { oil: [1.1, 1.28], copper: [1.1, 1.28] } },
    { icon: "📉", title: "大宗商品回调", desc: "需求转弱，原油与铜同步回调，相关配件成本下行。", tone: "good",
      comm: { oil: [0.78, 0.92], copper: [0.78, 0.92] } },
    // —— 随机/中性 ——
    { icon: "🏪", title: "厂商清仓补贴", desc: "厂商发放补贴清库存，随机配件低价甩卖。", tone: "good",
      eff: "RANDOM_DOWN" },
    { icon: "📦", title: "渠道囤货抢购", desc: "渠道商囤货，随机配件价格被炒高。", tone: "bad",
      eff: "RANDOM_UP" },
    { icon: "🔥", title: "电商爆款种草", desc: "网红带货引爆某款配件，需求骤增。", tone: "bad",
      eff: "RANDOM_UP" },
    { icon: "🌤️", title: "平静的一周", desc: "市场风平浪静，价格小幅随机波动。", tone: "neutral",
      eff: {} },
    { icon: "🌤️", title: "市场观望情绪", desc: "买家持币观望，成交清淡，价格略有回落。", tone: "neutral",
      eff: { cpu: [0.92, 1.0], gpu: [0.9, 1.0], ram: [0.92, 1.0] } },
  ];

  /* ---------- 工具函数 ---------- */
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randn() {
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
      bank: 0,
      cap: START_CAP,
      prices: {},
      prevPrices: {},
      history: {},
      inv: {},
      comm: {},       // { id: { idx, prev, hist } }
      currentEvent: null,
      pendingOrder: null,
      over: false,
    };
    PARTS.forEach((p) => {
      const start = Math.round(p.base * rand(0.9, 1.1));
      state.prices[p.id] = start;
      state.prevPrices[p.id] = start;
      state.history[p.id] = [start];
      state.inv[p.id] = { qty: 0, avgCost: 0 };
    });
    COMMODITIES.forEach((c) => {
      const idx = rand(0.92, 1.08);
      state.comm[c.id] = { idx: idx, prev: idx, hist: [idx] };
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

  function seasonOf(week) { return SEASONS[Math.floor((week - 1) / 13) % 4]; }

  // 大宗商品对某配件的成本系数
  function commodityCostFactor(partId) {
    let factor = 1;
    for (const cid in COMMODITY_EFFECT) {
      const w = COMMODITY_EFFECT[cid][partId];
      if (w && state.comm[cid]) factor += w * (state.comm[cid].idx - 1);
    }
    return Math.max(0.5, factor);
  }

  /* ---------- 周结算 ---------- */
  function advanceWeek() {
    if (state.over || state.pendingOrder) return;
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
    } else if (ev.eff) {
      for (const k in ev.eff) effects[k] = rand(ev.eff[k][0], ev.eff[k][1]);
    }
    state.currentEvent = { icon: ev.icon, title: ev.title, desc: ev.desc, tone: ev.tone };

    // 大宗商品事件冲击
    const commShock = {};
    if (ev.comm) for (const k in ev.comm) commShock[k] = rand(ev.comm[k][0], ev.comm[k][1]);

    // 更新大宗商品指数 (均值回归 + 波动 + 事件冲击)
    COMMODITIES.forEach((c) => {
      const o = state.comm[c.id];
      o.prev = o.idx;
      let idx = o.idx + (1 - o.idx) * 0.08;     // 向基准 1 回归
      idx *= 1 + randn() * c.vol;               // 随机波动
      if (commShock[c.id]) idx *= commShock[c.id];
      idx = clamp(idx, 0.5, 2.4);
      o.idx = idx;
      o.hist.push(idx);
      if (o.hist.length > HISTORY_LEN) o.hist.shift();
    });

    const season = seasonOf(state.week);

    // 更新配件价格
    PARTS.forEach((p) => {
      const old = state.prices[p.id];
      state.prevPrices[p.id] = old;

      const costFactor = commodityCostFactor(p.id);
      const target = p.base * season.mult * costFactor;   // 大宗商品调整后的目标价
      let price = old + (target - old) * 0.14;            // 均值回归
      price *= 1 + randn() * p.vol;                       // 日常波动
      if (effects[p.id]) price *= effects[p.id];          // 事件冲击
      price = clamp(price, p.base * p.floor, p.base * p.ceil);
      price = Math.max(1, Math.round(price));

      state.prices[p.id] = price;
      const h = state.history[p.id];
      h.push(price);
      if (h.length > HISTORY_LEN) h.shift();
    });

    // 银行计息
    let interest = 0;
    if (state.bank > 0) {
      interest = state.bank * BANK_RATE_WEEK;
      state.bank += interest;
    }

    // 每月装机档口订单
    const orderGenerated = maybeGenerateOrder();

    checkBankruptcy();
    save();
    render();

    if (orderGenerated) {
      showOrderModal();
    } else {
      let msg = `第 ${state.week} 周：${state.currentEvent.title}。`;
      if (interest >= 1) msg += ` 银行利息 +${fmt(interest)}。`;
      if (state.week >= MAX_WEEK) msg = `已是最后一周(第 ${MAX_WEEK} 周)，清仓后结算吧！`;
      setLog(msg, "");
    }
  }

  function checkBankruptcy() {
    if (state.cash < 0 && state.bank <= 0 && inventoryValue() <= 0) endGame(true);
  }

  /* ---------- 交易 ---------- */
  function usedCap() { return PARTS.reduce((s, p) => s + state.inv[p.id].qty, 0); }
  function inventoryValue() { return PARTS.reduce((s, p) => s + state.inv[p.id].qty * state.prices[p.id], 0); }
  function netWorth() { return state.cash + state.bank + inventoryValue(); }

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
    save(); render();
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
    save(); render();
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
    save(); render();
    setLog(`仓库扩建至 ${state.cap} 件，花费 ${fmt(cost)}。`, "ok");
  }

  /* ---------- 银行 ---------- */
  function deposit(amount) {
    if (state.over) return;
    amount = Math.floor(amount);
    if (!amount || amount <= 0) { setLog("请输入正确的存入金额", "err"); return; }
    if (amount > state.cash) { setLog("现金不足，无法存入这么多。", "err"); return; }
    state.cash -= amount;
    state.bank += amount;
    save(); render();
    setLog(`存入银行 ${fmt(amount)}，享年化 ${(BANK_RATE_ANNUAL * 100).toFixed(1)}% 复利。`, "ok");
  }
  function withdraw(amount) {
    if (state.over) return;
    amount = Math.floor(amount);
    if (!amount || amount <= 0) { setLog("请输入正确的取出金额", "err"); return; }
    if (amount > state.bank) { setLog(`存款不足，仅有 ${fmt(state.bank)}。`, "err"); return; }
    state.bank -= amount;
    state.cash += amount;
    save(); render();
    setLog(`从银行取出 ${fmt(amount)}。`, "ok");
  }

  /* ---------- 装机档口月度订单 ---------- */
  function maybeGenerateOrder() {
    if (state.week < 5 || (state.week - 1) % ORDER_EVERY !== 0) return false;
    const held = PARTS.filter((p) => state.inv[p.id].qty > 0);
    if (held.length === 0) return false;

    // 随机抽 1~3 类有库存的配件
    const shuffled = held.slice().sort(() => Math.random() - 0.5);
    const n = Math.min(shuffled.length, 1 + Math.floor(Math.random() * 3));
    const chosen = shuffled.slice(0, n);
    const premium = rand(0.03, 0.10);           // 整单装机溢价 3%~10%
    const items = chosen.map((p) => {
      const have = state.inv[p.id].qty;
      const want = Math.max(1, Math.min(have, Math.ceil(have * rand(0.3, 0.7))));
      const unit = Math.round(state.prices[p.id] * (1 + premium));
      return { id: p.id, qty: want, unit: unit };
    });
    const total = items.reduce((s, it) => s + it.qty * it.unit, 0);
    state.pendingOrder = { items: items, total: total, premium: premium };
    return true;
  }

  function acceptOrder() {
    const ord = state.pendingOrder;
    if (!ord) return;
    let profit = 0;
    ord.items.forEach((it) => {
      const inv = state.inv[it.id];
      const q = Math.min(it.qty, inv.qty);       // 防御: 库存可能已变化
      profit += (it.unit - inv.avgCost) * q;
      inv.qty -= q;
      if (inv.qty === 0) inv.avgCost = 0;
      state.cash += q * it.unit;
    });
    state.pendingOrder = null;
    document.getElementById("orderOverlay").hidden = true;
    save(); render();
    const word = profit >= 0 ? "赚" : "亏";
    const tag = profit >= 0 ? "ok" : "err";
    setLog(`接下装机订单，收入 ${fmt(ord.total)}，${word} ${fmt(Math.abs(profit))}。`, tag);
  }
  function rejectOrder() {
    state.pendingOrder = null;
    document.getElementById("orderOverlay").hidden = true;
    save(); render();
    setLog("拒绝了本月装机订单，留货等待更好行情。", "");
  }

  function showOrderModal() {
    const ord = state.pendingOrder;
    if (!ord) return;
    const list = document.getElementById("orderList");
    list.innerHTML = "";
    ord.items.forEach((it) => {
      const p = PART_MAP[it.id];
      const row = document.createElement("div");
      row.className = "order-row";
      row.innerHTML = `<span class="oi-name">${p.pic} ${p.name} × ${it.qty}</span>
        <span class="oi-val">@ ${fmt(it.unit)} = ${fmt(it.qty * it.unit)}</span>`;
      list.appendChild(row);
    });
    document.getElementById("orderPremium").textContent = "+" + (ord.premium * 100).toFixed(1) + "%";
    document.getElementById("orderTotal").textContent = fmt(ord.total);
    document.getElementById("orderOverlay").hidden = false;
  }

  /* ---------- 结束 ---------- */
  function endGame(bankrupt) {
    state.over = true;
    save();
    const worth = netWorth();
    let rank, title, desc;
    if (bankrupt) {
      title = "💀 破产清算";
      desc = "现金见底、存款清零且无货可卖，生意做不下去了……再接再厉！";
      rank = "F";
    } else {
      title = "📅 一年经营结束";
      const ratio = worth / START_CASH;
      if (ratio >= 5) rank = "S · 配件帝国";
      else if (ratio >= 3) rank = "A · 行业大佬";
      else if (ratio >= 2) rank = "B · 精明商人";
      else if (ratio >= 1.2) rank = "C · 小有盈余";
      else if (ratio >= 1) rank = "D · 勉强保本";
      else rank = "E · 入不敷出";
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
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !s.prices || !s.inv || !s.comm) return false;
      // 防御性补全
      if (typeof s.bank !== "number") s.bank = 0;
      if (s.pendingOrder === undefined) s.pendingOrder = null;
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
      <polyline fill="none" stroke="${color}" stroke-width="1.6" points="${pts}" /></svg>`;
  }

  function render() {
    const season = seasonOf(state.week);
    document.getElementById("week").textContent = state.week;
    document.getElementById("maxWeek").textContent = MAX_WEEK;
    document.getElementById("season").textContent = season.name;
    document.getElementById("cash").textContent = fmt(state.cash);
    document.getElementById("bank").textContent = fmt(state.bank);
    document.getElementById("netWorth").textContent = fmt(netWorth());
    document.getElementById("usedCap").textContent = usedCap();
    document.getElementById("cap").textContent = state.cap;
    document.getElementById("bankRate").textContent =
      `年化 ${(BANK_RATE_ANNUAL * 100).toFixed(1)}% · 每周复利 · 无风险`;

    // 事件
    const ev = state.currentEvent || {};
    document.getElementById("eventIcon").textContent = ev.icon || "📰";
    document.getElementById("eventTitle").textContent = ev.title || "";
    document.getElementById("eventDesc").textContent = ev.desc || "";
    const banner = document.getElementById("eventBanner");
    banner.classList.remove("good", "bad");
    if (ev.tone === "good") banner.classList.add("good");
    else if (ev.tone === "bad") banner.classList.add("bad");
    banner.style.animation = "none"; void banner.offsetWidth; banner.style.animation = "";

    // 大宗商品
    const cl = document.getElementById("commodityList");
    cl.innerHTML = "";
    COMMODITIES.forEach((c) => {
      const o = state.comm[c.id];
      const idx = Math.round(o.idx * 100);
      const chgPct = o.prev ? (o.idx - o.prev) / o.prev * 100 : 0;
      let dir = "flat", arrow = "▬";
      if (o.idx > o.prev + 1e-6) { dir = "up"; arrow = "▲"; }
      else if (o.idx < o.prev - 1e-6) { dir = "down"; arrow = "▼"; }
      const span = document.createElement("div");
      span.className = "cb-item";
      span.innerHTML = `<span class="cb-ic">${c.pic}</span>
        <span class="cb-nm">${c.name}</span>
        <span class="cb-idx">${idx}</span>
        <span class="cb-chg ${dir}">${arrow}${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(1)}%</span>
        ${sparkline(o.hist.map((v) => v * 100), 56, 18)}`;
      cl.appendChild(span);
    });

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
        <td><div class="part-name"><span class="pic">${p.pic}</span>
          <span><span class="nm">${p.name}</span><br/><span class="cat">${p.cat}</span></span></div></td>
        <td class="price">${fmt(price)}</td>
        <td class="chg ${dir}">${arrow} ${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(1)}%</td>
        <td>${sparkline(state.history[p.id], 84, 26)}</td>
        <td>${it.qty}</td>
        <td>${it.qty > 0 ? fmt(it.avgCost) : "—"}</td>
        <td class="pnl ${pnlDir}">${it.qty > 0 ? (pnl >= 0 ? "+" : "") + fmt(pnl) : "—"}</td>
        <td class="trade-col"><div class="trade">
          <input class="qty" type="number" min="1" value="1" data-qty="${p.id}" />
          <button class="buy-btn" data-buy="${p.id}" ${state.over ? "disabled" : ""}>买</button>
          <button class="sell-btn" data-sell="${p.id}" ${state.over || it.qty === 0 ? "disabled" : ""}>卖</button>
        </div></td>`;
      body.appendChild(tr);
    });

    body.querySelectorAll("[data-buy]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-buy");
        buy(id, Number(body.querySelector(`[data-qty="${id}"]`).value));
      }));
    body.querySelectorAll("[data-sell]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-sell");
        sell(id, Number(body.querySelector(`[data-qty="${id}"]`).value));
      }));

    const nextBtn = document.getElementById("nextWeekBtn");
    nextBtn.disabled = state.over;
    nextBtn.textContent = state.week >= MAX_WEEK ? "结算本局 🏁" : "进入下一周 ▶";

    // 银行按钮在结束后禁用
    ["depositBtn", "withdrawBtn", "depositAllBtn"].forEach((id) => {
      document.getElementById(id).disabled = state.over;
    });
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

    const amt = () => Number(document.getElementById("bankAmount").value);
    document.getElementById("depositBtn").addEventListener("click", () => deposit(amt()));
    document.getElementById("withdrawBtn").addEventListener("click", () => withdraw(amt()));
    document.getElementById("depositAllBtn").addEventListener("click", () => deposit(state.cash));

    document.getElementById("orderAccept").addEventListener("click", acceptOrder);
    document.getElementById("orderReject").addEventListener("click", rejectOrder);

    document.getElementById("newGameBtn").addEventListener("click", () => {
      if (confirm("确定要重新开始吗？当前进度会丢失。")) {
        document.getElementById("modalOverlay").hidden = true;
        document.getElementById("orderOverlay").hidden = true;
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
      if (state.pendingOrder) showOrderModal();
      setLog("已读取上次存档，继续经营。", "");
    } else {
      newGame();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
