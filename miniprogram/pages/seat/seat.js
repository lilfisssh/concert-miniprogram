// pages/seat/seat.js —— 选座页（总览 → 分区聚焦 → 选座），交互对照 proto/index.html 移植。
// 正式链路：核验(verify) → 限区限量选座(本页) → 确认锁座(order/claimSeats) → 结果(result)。
// 本页不收款、不能改票价/数量；价格卡/票种 Tab 只做分区聚焦与展示，不绕过核验。
const venue = require('../../utils/venue.js');
const app = getApp();

// ---- 布局常量（map-local px，与 seat.wxss 对齐）----
const SEAT = 22;       // 座位边长
const GAP = 4;         // 座位间距
const PAD = 5;         // 区块内边距
const LABEL_H = 14;    // 区标签高
const LABEL_GAP = 4;
const COL_GAP = 6;     // 区块横向间距
const ROW_GAP = 8;     // 区块纵向间距
const SIDE_DROP = 18;  // BL/BR 相对 A 下移
const STAGE_H = 62;    // 舞台占位（含下间距）
const MAP_PAD = 8;

// ---- 镜头参数（对照原型 FIT）----
const FIT = {
  overviewPad: 0.02, overviewFill: 0.92, overviewMaxWidth: 1.14,
  overviewScaleMin: 0.70, overviewScaleMax: 1.85, overviewYBias: 28,
  focusFillMin: 0.70, focusFillMax: 0.85, focusFill: 0.78,
  focusScaleMin: 0.55, focusScaleMax: 2.40
};
const DRAG_THRESH = 10; // >10px 才算拖拽；未超阈值在 touchend 自合成 tap（对照 proto，不等平台 tap）
const TAP_MAX_MS = 350; // 短按时长上限
const CAM_TRANSITION = 'transform .34s cubic-bezier(.22,.61,.36,1)';

// 演示模式 mock 已售（新 seatKey 格式）
const MOCK_SOLD_KEYS = ['A-1-4', 'A-3-0', 'A-4-6', 'A-5-2', 'B-L-1-2', 'B-L-3-0', 'B-R-2-1', 'B-R-4-3', 'C-0-1', 'C-1-4', 'C-2-2'];

const DISPLAY_ORDER = ['BL', 'A', 'BR', 'C'];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

Page({
  data: {
    zoneName: '',
    qty: 1,
    count: 0,
    detailLine: 'A区0 · B区0 · C区0  合计 ¥0',
    blocks: [],        // 渲染用区块（含座位行）
    priceCards: [],    // A/B/C 价格卡
    ticketTab: 'single',
    focused: '',       // '' = 总览
    mapW: 0,
    mapH: 0,
    stageX: 0,
    mapTransform: '',
    mapTransition: CAM_TRANSITION,
    panelH: 210        // 测量前占位
  },

  // ---- 非渲染状态 ----
  ticket: null,
  allowedZoneKey: '',  // 'A'|'B'|'C'
  layout: null,        // { byId, mapW, mapH, overviewBox, boxOf }
  seatByKey: {},
  sold: {},
  selected: {},        // key -> seat
  focusedTarget: null, // null | 'A' | 'BL' | 'BR' | 'B' | 'C'
  camBase: null,       // { tx, ty, scale, box, usableH, ww }
  panX: 0,
  panY: 0,
  gest: null,
  inertiaTimer: 0,
  wrapW: 0,
  wrapH: 0,
  _onResize: null,

  onLoad() {
    const ticket = app.globalData.ticket;
    // 未核验直接进入 -> 回购票 Tab（核验页）
    if (!ticket) {
      wx.switchTab({ url: '/pages/verify/verify' });
      return;
    }
    this.ticket = ticket;
    const zone = venue.ZONES[ticket.zone];
    this.allowedZoneKey = zone.key;
    this.layout = this.buildLayout();
    this.setData({
      zoneName: zone.name,
      qty: ticket.qty,
      mapW: this.layout.mapW,
      mapH: this.layout.mapH,
      stageX: (this.layout.mapW - 300) / 2,
      // 价格卡只做聚焦入口与展示；价格为核验后档位的七折价，不可在此改价
      priceCards: venue.ZONES.map((z, i) => ({
        key: z.key, name: z.name, price: z.price, old: [108, 98, 88][i], color: z.color
      }))
    });
    this.renderBlocks();
    this.updateSummary();
  },

  onReady() {
    this.measure(() => this.applyCamera(true));
    this._onResize = () => this.measure(() => this.applyCamera(true));
    wx.onWindowResize(this._onResize);
  },

  onShow() {
    // 从确认页返回时刷新已售（选中保留）
    if (this.ticket) this.loadSeats();
  },

  onUnload() {
    if (this._onResize) wx.offWindowResize(this._onResize);
    if (this.inertiaTimer) clearTimeout(this.inertiaTimer);
  },

  // ---------- 布局（全部可算，无需量 DOM） ----------
  buildLayout() {
    const byId = {};
    venue.BLOCKS.forEach((b) => {
      byId[b.block] = {
        ...b,
        w: b.cols * SEAT + (b.cols - 1) * GAP + PAD * 2,
        h: b.rows * SEAT + (b.rows - 1) * GAP + LABEL_H + LABEL_GAP + PAD * 2
      };
    });
    const { A, BL, BR, C } = byId;
    BL.x = MAP_PAD; BL.y = STAGE_H + SIDE_DROP;
    A.x = MAP_PAD + BL.w + COL_GAP; A.y = STAGE_H;
    BR.x = A.x + A.w + COL_GAP; BR.y = STAGE_H + SIDE_DROP;
    const row1Bottom = Math.max(A.y + A.h, BL.y + BL.h, BR.y + BR.h);
    const mapW = BR.x + BR.w + MAP_PAD;
    C.x = Math.round((mapW - C.w) / 2); C.y = row1Bottom + ROW_GAP;
    const mapH = C.y + C.h + MAP_PAD;

    const boxOf = (t) => {
      if (t === 'B') { // B 合框：BL+BR 并集
        const x = Math.min(BL.x, BR.x), y = Math.min(BL.y, BR.y);
        return {
          x, y,
          w: Math.max(BL.x + BL.w, BR.x + BR.w) - x,
          h: Math.max(BL.y + BL.h, BR.y + BR.h) - y
        };
      }
      const g = byId[t];
      return g ? { x: g.x, y: g.y, w: g.w, h: g.h } : { x: 0, y: 0, w: mapW, h: mapH };
    };
    return { byId, mapW, mapH, overviewBox: { x: 0, y: 0, w: mapW, h: mapH }, boxOf };
  },

  // ---------- 渲染模型 ----------
  stateCls(key, zoneKey) {
    if (this.sold[key]) return 'sold';
    if (zoneKey !== this.allowedZoneKey) return 'outzone'; // 非本票档
    if (this.selected[key]) return 'selected';
    return 'available';
  },

  renderBlocks() {
    const blocks = DISPLAY_ORDER.map((bid) => {
      const g = this.layout.byId[bid];
      const zoneNum = venue.zoneOf(bid);
      const zoneKey = venue.ZONES[zoneNum].key;
      const rows = [];
      for (let r = 0; r < g.rows; r++) {
        const row = [];
        for (let c = 0; c < g.cols; c++) {
          const key = venue.seatKey(bid, r, c);
          const seat = {
            key, block: bid, row: r, col: c,
            zone: zoneNum, zoneKey, zoneLc: zoneKey.toLowerCase(),
            letter: zoneKey,
            cls: this.stateCls(key, zoneKey)
          };
          this.seatByKey[key] = seat;
          row.push(seat);
        }
        rows.push(row);
      }
      return {
        block: bid,
        label: venue.blockName(bid),
        x: g.x, y: g.y, w: g.w,
        isTicketZone: zoneKey === this.allowedZoneKey,
        rows
      };
    });
    this.setData({ blocks });
  },

  // ---------- 已售加载（演示 mock / 云端 getSeats） ----------
  loadSeats() {
    if (!app.globalData.cloudEnv || app.globalData.cloudEnv.indexOf('TODO') === 0) {
      const m = {};
      MOCK_SOLD_KEYS.forEach((k) => { m[k] = true; });
      this.applySold(m);
      return;
    }
    wx.cloud.callFunction({
      name: 'getSeats',
      data: { sessionId: this.ticket.sessionId }
    }).then((res) => {
      const r = res.result || {};
      const m = {};
      (r.sold || []).forEach((k) => { m[k] = true; });
      this.applySold(m);
    }).catch((err) => {
      console.warn('getSeats 调用失败, 使用 mock 数据', err);
      const m = {};
      MOCK_SOLD_KEYS.forEach((k) => { m[k] = true; });
      this.applySold(m);
    });
  },

  applySold(map) {
    this.sold = map;
    this.renderBlocks();
  },

  // ---------- 测量与镜头 ----------
  measure(cb) {
    wx.createSelectorQuery()
      .select('#mapWrap').boundingClientRect()
      .select('#seatPanel').boundingClientRect()
      .exec((res) => {
        if (res && res[0]) { this.wrapW = res[0].width; this.wrapH = res[0].height; }
        if (res && res[1]) {
          const h = Math.ceil(res[1].height);
          if (h > 0 && h !== this.data.panelH) this.setData({ panelH: h });
          this.panelH = h;
        }
        if (cb) cb();
      });
  },

  applyCamera(instant) {
    if (!this.wrapW || !this.wrapH || !this.layout) return;
    if (this.inertiaTimer) { clearTimeout(this.inertiaTimer); this.inertiaTimer = 0; }

    const ww = this.wrapW;
    const usableH = Math.max(100, this.wrapH - (this.panelH || 210) - 12);
    const box = this.focusedTarget ? this.layout.boxOf(this.focusedTarget) : this.layout.overviewBox;
    const bw = Math.max(box.w, 1);
    const bh = Math.max(box.h, 1);

    let scale;
    if (!this.focusedTarget) {
      // 总览：优先填满可用高度，允许横向轻微溢出（可拖拽看边缘）
      const padY = usableH * FIT.overviewPad;
      const scaleH = (usableH - padY * 2) / bh;
      const scaleWcap = (ww * FIT.overviewMaxWidth) / bw;
      scale = clamp(Math.min(scaleH * FIT.overviewFill, scaleWcap), FIT.overviewScaleMin, FIT.overviewScaleMax);
    } else {
      // 聚焦：目标占可用视口 70–85%
      scale = Math.min((ww * FIT.focusFill) / bw, (usableH * FIT.focusFill) / bh);
      scale = clamp(scale, FIT.focusScaleMin, FIT.focusScaleMax);
      let maxFill = Math.max((bw * scale) / ww, (bh * scale) / usableH);
      if (maxFill > FIT.focusFillMax) {
        scale *= FIT.focusFillMax / maxFill;
      } else if (maxFill < FIT.focusFillMin) {
        const bumped = scale * (FIT.focusFillMin / maxFill);
        const cap = Math.min((ww * 0.98) / bw, (usableH * 0.98) / bh);
        scale = Math.min(bumped, cap);
      }
      scale = clamp(scale, FIT.focusScaleMin, FIT.focusScaleMax);
      maxFill = Math.max((bw * scale) / ww, (bh * scale) / usableH);
      if (maxFill > 0.98) scale *= 0.98 / maxFill;
    }

    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    // transform-origin 0 0: screen = local * scale + translate
    const tx = ww / 2 - cx * scale;
    let ty = usableH / 2 - cy * scale;
    if (!this.focusedTarget) ty -= FIT.overviewYBias;

    this.camBase = { tx, ty, scale, box, usableH, ww };
    this.panX = 0;
    this.panY = 0;
    this.paintCamera(instant);
  },

  paintCamera(instant) {
    if (!this.camBase) return;
    const { tx, ty, scale } = this.camBase;
    this.setData({
      mapTransform: 'translate(' + (tx + this.panX).toFixed(2) + 'px, ' + (ty + this.panY).toFixed(2) + 'px) scale(' + scale.toFixed(4) + ')',
      mapTransition: instant ? 'none' : CAM_TRANSITION
    });
  },

  // 平移夹取：聚焦时橡皮筋、总览硬夹（对照原型 clampPan）
  clampPan(px, py, rubber) {
    const { tx, ty, scale, box, usableH, ww } = this.camBase;
    const cw = Math.max(box.w, 1) * scale;
    const ch = Math.max(box.h, 1) * scale;
    const margin = 56;
    const left0 = tx + box.x * scale;
    const top0 = ty + box.y * scale;
    let maxPx = (ww - margin) - left0;
    let minPx = margin - left0 - cw;
    let maxPy = (usableH - margin) - top0;
    let minPy = margin - top0 - ch;
    if (cw < ww - margin * 2) {
      const slack = Math.max(24, (ww - cw) * 0.2);
      minPx = -slack; maxPx = slack;
    }
    if (ch < usableH - margin * 2) {
      const slack = Math.max(24, (usableH - ch) * 0.18);
      minPy = -slack; maxPy = slack;
    }
    if (!rubber) return { x: clamp(px, minPx, maxPx), y: clamp(py, minPy, maxPy) };
    const rubber1 = (v, lo, hi) => (v < lo ? lo + (v - lo) * 0.28 : v > hi ? hi + (v - hi) * 0.28 : v);
    return { x: rubber1(px, minPx, maxPx), y: rubber1(py, minPy, maxPy) };
  },

  // ---------- 聚焦状态 ----------
  focusTarget(t) {
    this.focusedTarget = t;
    this.setData({ focused: t });
    this.applyCamera(false);
  },

  setOverview() {
    this.focusedTarget = null;
    this.setData({ focused: '' });
    this.applyCamera(false);
  },

  focusCovers(target, seat) {
    if (target === 'B') return seat.zoneKey === 'B';
    if (target === 'BL' || target === 'BR') return seat.block === target;
    return seat.block === target;
  },

  // ---------- 点选（touchend 自合成 tap 分发；不依赖平台 tap，短点不会被拖动吃掉） ----------
  tapSeat(key) {
    const seat = this.seatByKey[key];
    if (!seat) return;
    // 总览/非聚焦块点座 = 先聚焦该块；仅聚焦后才可选座
    if (!this.focusedTarget || !this.focusCovers(this.focusedTarget, seat)) {
      this.focusTarget(seat.block);
      return;
    }
    if (seat.zoneKey !== this.allowedZoneKey) {
      wx.showToast({ title: '你的票为' + this.data.zoneName + '，只能选该区座位', icon: 'none' });
      return;
    }
    if (this.sold[seat.key]) {
      wx.showToast({ title: '该座位已被选走', icon: 'none' });
      return;
    }
    if (this.selected[seat.key]) {
      delete this.selected[seat.key];
    } else {
      if (Object.keys(this.selected).length >= this.ticket.qty) {
        wx.showToast({ title: '你的票为 ' + this.ticket.qty + ' 座，已选满', icon: 'none' });
        return;
      }
      this.selected[seat.key] = seat;
    }
    this.renderBlocks();
    this.updateSummary();
  },

  // 区框/区标签：未聚焦则聚焦；已聚焦不再动作（不误回全场）
  tapZone(block) {
    if (this.focusedTarget !== block) this.focusTarget(block);
  },

  // 点空白（舞台/缝隙）回全场
  tapBlank() {
    if (this.focusedTarget) this.setOverview();
  },

  // 价格卡：A/C 聚焦或回全场；B 聚焦左右合框
  onPriceCard(e) {
    const z = e.currentTarget.dataset.zone;
    if (z === 'B') {
      if (this.focusedTarget === 'B' || this.focusedTarget === 'BL' || this.focusedTarget === 'BR') this.setOverview();
      else this.focusTarget('B');
    } else if (this.focusedTarget === z) {
      this.setOverview();
    } else {
      this.focusTarget(z);
    }
  },

  // 票种 Tab 仅展示切换，不改价格/数量（票档由核验决定）
  onTicketTab(e) {
    this.setData({ ticketTab: e.currentTarget.dataset.tab });
  },

  // ---------- 手势：拖拽平移（无 pinch/自由缩放）；短按自合成 tap ----------
  onTouchStart(e) {
    if (this.inertiaTimer) { clearTimeout(this.inertiaTimer); this.inertiaTimer = 0; }
    const t = e.touches[0];
    const ds = (e.target && e.target.dataset) || {};
    const now = Date.now();
    this.gest = {
      x0: t.clientX, y0: t.clientY,
      pan0x: this.panX, pan0y: this.panY,
      moved: false,
      lastX: t.clientX, lastY: t.clientY, lastT: now,
      vx: 0, vy: 0,
      t0: now,
      key: ds.key || '',     // 座位
      block: ds.block || '', // 区块/区标签/行缝隙
      act: ds.act || ''      // 「看全场」按钮
    };
  },

  onTouchMove(e) {
    const g = this.gest;
    if (!g) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x0;
    const dy = t.clientY - g.y0;
    const now = Date.now();
    const dt = Math.max(8, now - g.lastT);
    g.vx = (t.clientX - g.lastX) / dt * 1000;
    g.vy = (t.clientY - g.lastY) / dt * 1000;
    g.lastX = t.clientX; g.lastY = t.clientY; g.lastT = now;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESH) return;
    if (!g.moved) g.moved = true; // 进入拖拽：touchend 不再合成 tap
    const c = this.clampPan(g.pan0x + dx, g.pan0y + dy, !!this.focusedTarget);
    this.panX = c.x;
    this.panY = c.y;
    this.paintCamera(true);
  },

  onTouchEnd() {
    const g = this.gest;
    if (!g) return;
    this.gest = null;
    if (!g.moved) {
      // 短按 = 点选（对照 proto：位移未超阈值且非长按即 tap，自行分发）
      if (Date.now() - g.t0 < TAP_MAX_MS) {
        if (g.act === 'overview') this.setOverview();
        else if (g.key) this.tapSeat(g.key);
        else if (g.block) this.tapZone(g.block);
        else this.tapBlank();
      }
      return;
    }
    this.startInertia(g.vx, g.vy);
  },

  startInertia(vx, vy) {
    if (Math.hypot(vx, vy) < 40) { this.settlePan(); return; }
    const t0 = Date.now();
    const dur = 260;
    let ivx = vx * 0.18;
    let ivy = vy * 0.18;
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / dur);
      ivx *= 0.90;
      ivy *= 0.90;
      const hard = t >= 1;
      const c = this.clampPan(this.panX + ivx * 0.35, this.panY + ivy * 0.35, !hard && !!this.focusedTarget);
      this.panX = c.x;
      this.panY = c.y;
      this.paintCamera(true);
      if (t < 1 && Math.hypot(ivx, ivy) > 0.4) {
        this.inertiaTimer = setTimeout(step, 16);
      } else {
        this.settlePan();
      }
    };
    this.inertiaTimer = setTimeout(step, 16);
  },

  settlePan() {
    const c = this.clampPan(this.panX, this.panY, false);
    this.panX = c.x;
    this.panY = c.y;
    this.paintCamera(false);
    this.inertiaTimer = 0;
  },

  // ---------- 汇总与确认 ----------
  updateSummary() {
    let a = 0, b = 0, c = 0;
    Object.keys(this.selected).forEach((k) => {
      const s = this.selected[k];
      if (s.zoneKey === 'A') a++;
      else if (s.zoneKey === 'B') b++;
      else c++;
    });
    const n = a + b + c;
    const total = a * venue.ZONES[0].price + b * venue.ZONES[1].price + c * venue.ZONES[2].price;
    this.setData({
      count: n,
      detailLine: 'A区' + a + ' · B区' + b + ' · C区' + c + '  合计 ¥' + total
    });
  },

  onConfirm() {
    const list = Object.keys(this.selected).map((k) => this.selected[k]);
    if (list.length !== this.ticket.qty) {
      wx.showToast({ title: '请选择 ' + this.ticket.qty + ' 个座位', icon: 'none' });
      return;
    }
    const order = { A: 0, BL: 1, BR: 2, C: 3 };
    list.sort((x, y) => (order[x.block] - order[y.block]) || (x.row - y.row) || (x.col - y.col));
    app.globalData.pendingSeats = list.map((s) => ({
      block: s.block,
      row: s.row,
      col: s.col,
      key: venue.seatKey(s.block, s.row, s.col),
      seatNo: venue.seatNoAt(s.block, s.row, s.col),
      label: venue.seatLabel(s.block, s.row, s.col),
      zone: s.zone
    }));
    wx.navigateTo({ url: '/pages/order/order' });
  }
});
