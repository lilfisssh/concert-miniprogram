// pages/seat/seat.js
const venue = require('../../utils/venue.js');
const app = getApp();

// 世界坐标(scale=1)下的座位尺寸, 单位 px
const SEAT_W = 24;
const SEAT_H = 20;
const GAP_X = 4;
const GAP_Y = 6;
const CELL_W = SEAT_W + GAP_X;
const CELL_H = SEAT_H + GAP_Y;
const PAD = 16; // 画布内边距

const COLOR_SOLD = '#C8C8C8';     // 已售
const COLOR_SELECTED = '#2ECC71'; // 已选
const COLOR_DISABLED = '#E6E6E6'; // 非本票档分区(不可选)

Page({
  data: {
    zoneName: '',
    qty: 1,
    count: 0,
    selectedText: '',
    loading: true
  },

  // 非渲染状态(不放 data, 避免频繁 setData)
  ticket: null,
  allowedZone: -1,
  qty: 1,
  canvas: null,
  ctx: null,
  dpr: 1,
  cssW: 0,
  cssH: 0,
  scale: 1,
  baseScale: 1,
  offsetX: 0,
  offsetY: 0,
  sold: {},        // { seatKey: true } 已售
  selected: {},    // { seatKey: {row,col} } 我选中的
  // 手势
  touchMode: '',
  lastX: 0,
  lastY: 0,
  startX: 0,
  startY: 0,
  moved: false,
  pinchDist: 0,
  pinchMidX: 0,
  pinchMidY: 0,

  onLoad() {
    const ticket = app.globalData.ticket;
    // 未核验直接进入 -> 退回核验页
    if (!ticket) {
      wx.redirectTo({ url: '/pages/verify/verify' });
      return;
    }
    this.ticket = ticket;
    this.allowedZone = ticket.zone;
    this.qty = ticket.qty;
    this.setData({ zoneName: venue.ZONES[ticket.zone].name, qty: ticket.qty });
    this.initCanvas();
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#seatCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;

        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        this.canvas = canvas;
        this.ctx = ctx;
        this.dpr = dpr;
        this.cssW = res[0].width;
        this.cssH = res[0].height;

        this.fitView();
        this.loadSeats();
      });
  },

  fitView() {
    const contentW = venue.COLS * CELL_W - GAP_X;
    this.baseScale = (this.cssW - PAD * 2) / contentW;
    this.scale = this.baseScale;
    const drawnW = contentW * this.scale;
    this.offsetX = (this.cssW - drawnW) / 2;
    this.offsetY = PAD;
  },

  // ---------- 数据加载 ----------
  loadSeats() {
    if (!app.globalData.cloudEnv || app.globalData.cloudEnv.indexOf('TODO') === 0) {
      this.applyMockSeats();
      return;
    }
    wx.cloud.callFunction({
      name: 'getSeats',
      data: { sessionId: this.ticket.sessionId }
    }).then((res) => {
      const r = res.result || {};
      this.sold = arrToMap(r.sold);
      this.setData({ loading: false });
      this.draw();
    }).catch((err) => {
      console.warn('getSeats 调用失败, 使用 mock 数据', err);
      this.applyMockSeats();
    });
  },

  applyMockSeats() {
    const soldPairs = [[0, 6], [0, 7], [4, 10], [4, 11], [5, 0], [6, 20], [10, 7], [12, 1]];
    const sold = {};
    soldPairs.forEach(([r, c]) => {
      if (venue.isSeat(r, c)) sold[venue.seatKey(r, c)] = true;
    });
    this.sold = sold;
    this.setData({ loading: false });
    this.draw();
  },

  // ---------- 绘制 ----------
  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    const showNo = SEAT_W * this.scale >= 18;
    const fontSize = Math.max(8, Math.min(14, SEAT_W * this.scale * 0.42));
    ctx.font = fontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < venue.ROWS; r++) {
      const wy = r * CELL_H;
      const sy = wy * this.scale + this.offsetY;
      if (sy + SEAT_H * this.scale < 0 || sy > this.cssH) continue;

      const labelX = (-CELL_W) * this.scale + this.offsetX + (SEAT_W * this.scale) / 2;
      if (labelX > -20 && labelX < this.cssW) {
        ctx.fillStyle = '#999';
        ctx.fillText(String(r + 1), labelX, sy + (SEAT_H * this.scale) / 2);
      }

      for (let c = 0; c < venue.COLS; c++) {
        if (!venue.isSeat(r, c)) continue;
        const wx_ = c * CELL_W;
        const sx = wx_ * this.scale + this.offsetX;
        const w = SEAT_W * this.scale;
        const h = SEAT_H * this.scale;
        if (sx + w < 0 || sx > this.cssW) continue;

        const key = venue.seatKey(r, c);
        const inZone = venue.zoneOf(r, c) === this.allowedZone;
        let fill;
        if (this.selected[key]) fill = COLOR_SELECTED;
        else if (this.sold[key]) fill = COLOR_SOLD;
        else if (!inZone) fill = COLOR_DISABLED;       // 非本票档分区: 淡灰不可选
        else fill = venue.colorOf(r, c);

        roundRect(ctx, sx, sy, w, h, Math.min(4, w / 4));
        ctx.fillStyle = fill;
        ctx.fill();

        // 仅本分区可选座位画白色座位号
        if (showNo && inZone && !this.sold[key]) {
          ctx.fillStyle = '#fff';
          ctx.fillText(String(venue.seatNoAt(r, c)), sx + w / 2, sy + h / 2);
        }
      }
    }
  },

  // ---------- 手势 ----------
  onTouchStart(e) {
    const t = e.touches;
    if (t.length >= 2) {
      this.touchMode = 'pinch';
      this.pinchDist = dist(t[0], t[1]);
      this.pinchMidX = (t[0].x + t[1].x) / 2;
      this.pinchMidY = (t[0].y + t[1].y) / 2;
    } else {
      this.touchMode = 'pan';
      this.lastX = t[0].x;
      this.lastY = t[0].y;
      this.startX = t[0].x;
      this.startY = t[0].y;
      this.moved = false;
    }
  },

  onTouchMove(e) {
    const t = e.touches;
    if (this.touchMode === 'pinch' && t.length >= 2) {
      const nd = dist(t[0], t[1]);
      if (this.pinchDist > 0) {
        const factor = nd / this.pinchDist;
        this.applyZoom(factor, this.pinchMidX, this.pinchMidY);
      }
      this.pinchDist = nd;
      this.pinchMidX = (t[0].x + t[1].x) / 2;
      this.pinchMidY = (t[0].y + t[1].y) / 2;
    } else if (this.touchMode === 'pan' && t.length === 1) {
      const dx = t[0].x - this.lastX;
      const dy = t[0].y - this.lastY;
      if (Math.abs(t[0].x - this.startX) > 6 || Math.abs(t[0].y - this.startY) > 6) {
        this.moved = true;
      }
      this.offsetX += dx;
      this.offsetY += dy;
      this.lastX = t[0].x;
      this.lastY = t[0].y;
      this.clampOffset();
      this.draw();
    }
  },

  onTouchEnd() {
    if (this.touchMode === 'pan' && !this.moved) {
      this.handleTap(this.startX, this.startY);
    }
    this.touchMode = '';
  },

  applyZoom(factor, cx, cy) {
    let ns = this.scale * factor;
    const min = this.baseScale * 0.8;
    const max = this.baseScale * 4;
    if (ns < min) ns = min;
    if (ns > max) ns = max;
    const realFactor = ns / this.scale;
    this.offsetX = cx - (cx - this.offsetX) * realFactor;
    this.offsetY = cy - (cy - this.offsetY) * realFactor;
    this.scale = ns;
    this.clampOffset();
    this.draw();
  },

  zoomIn() { this.applyZoom(1.3, this.cssW / 2, this.cssH / 2); },
  zoomOut() { this.applyZoom(1 / 1.3, this.cssW / 2, this.cssH / 2); },
  resetView() { this.fitView(); this.draw(); },

  clampOffset() {
    const contentW = (venue.COLS * CELL_W - GAP_X) * this.scale;
    const contentH = (venue.ROWS * CELL_H - GAP_Y) * this.scale;
    const minX = Math.min(PAD, this.cssW - contentW - PAD);
    const maxX = Math.max(this.cssW - contentW - PAD, PAD);
    if (contentW <= this.cssW) {
      this.offsetX = (this.cssW - contentW) / 2;
    } else {
      this.offsetX = Math.min(maxX, Math.max(minX, this.offsetX));
    }
    if (contentH <= this.cssH) {
      this.offsetY = Math.max(PAD, this.offsetY);
      this.offsetY = Math.min(this.offsetY, PAD);
    } else {
      const minY = this.cssH - contentH - PAD;
      this.offsetY = Math.min(PAD, Math.max(minY, this.offsetY));
    }
  },

  handleTap(x, y) {
    const worldX = (x - this.offsetX) / this.scale;
    const worldY = (y - this.offsetY) / this.scale;
    const c = Math.floor(worldX / CELL_W);
    const r = Math.floor(worldY / CELL_H);
    if (c < 0 || c >= venue.COLS || r < 0 || r >= venue.ROWS) return;
    const inX = worldX - c * CELL_W;
    const inY = worldY - r * CELL_H;
    if (inX > SEAT_W || inY > SEAT_H) return;
    if (!venue.isSeat(r, c)) return;

    // 限分区
    if (venue.zoneOf(r, c) !== this.allowedZone) {
      wx.showToast({ title: '你的票为' + this.data.zoneName + '，只能选该区座位', icon: 'none' });
      return;
    }

    const key = venue.seatKey(r, c);
    if (this.sold[key]) {
      wx.showToast({ title: '该座位已被选走', icon: 'none' });
      return;
    }

    if (this.selected[key]) {
      delete this.selected[key];
    } else {
      if (Object.keys(this.selected).length >= this.qty) {
        wx.showToast({ title: '你的票为 ' + this.qty + ' 座，已选满', icon: 'none' });
        return;
      }
      this.selected[key] = { row: r, col: c };
    }
    this.draw();
    this.refreshSummary();
  },

  refreshSummary() {
    const list = this.getSelectedList();
    const labels = list.map((s) => venue.seatLabel(s.row, s.col));
    this.setData({
      count: list.length,
      selectedText: labels.join('、')
    });
  },

  getSelectedList() {
    const list = Object.keys(this.selected).map((k) => this.selected[k]);
    list.sort((a, b) => (a.row - b.row) || (a.col - b.col));
    return list;
  },

  onConfirm() {
    const list = this.getSelectedList();
    if (list.length !== this.qty) {
      wx.showToast({ title: '请选择 ' + this.qty + ' 个座位', icon: 'none' });
      return;
    }
    app.globalData.pendingSeats = list.map((s) => ({
      row: s.row,
      col: s.col,
      key: venue.seatKey(s.row, s.col),
      seatNo: venue.seatNoAt(s.row, s.col),
      label: venue.seatLabel(s.row, s.col),
      zone: venue.zoneOf(s.row, s.col)
    }));
    wx.navigateTo({ url: '/pages/order/order' });
  },

  onShow() {
    if (this.ctx) {
      this.loadSeats();
      this.refreshSummary();
    }
  }
});

// ---------- 工具函数 ----------
function arrToMap(arr) {
  const m = {};
  (arr || []).forEach((k) => { m[k] = true; });
  return m;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
