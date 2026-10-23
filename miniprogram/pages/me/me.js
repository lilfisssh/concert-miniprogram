// pages/me/me.js —— 我的 Tab（登录/订单）
// 演示 mock（无真微信登录）：storage 键 concert_me_auth = 'out' | 'in' | 'in-empty'
//   out      未登录：登录卡 + 空状态
//   in       已登录有单：资料卡 + 演示订单列表
//   in-empty 已登录空单：资料卡 + 空状态（无登录按钮）
const AUTH_KEY = 'concert_me_auth';

const DEMO_ORDERS = [
  {
    line: 'B区2排3座 · B区2排4座',
    meta: '2026.08.10 18:00 · 智慧山 · 飞鸟剧场',
    orderNo: 'M2026081001',
    status: '已锁座'
  },
  {
    line: 'A区5排2座',
    meta: '2026.08.10 18:00 · 智慧山 · 飞鸟剧场',
    orderNo: 'M2026081002',
    status: '已锁座'
  }
];

Page({
  data: {
    loggedIn: false,
    orders: []
  },

  onShow() {
    const auth = wx.getStorageSync(AUTH_KEY) || 'out';
    this.setData({
      loggedIn: auth !== 'out',
      orders: auth === 'in' ? DEMO_ORDERS : []
    });
  },

  // 演示：点「微信登录」即视为已登录（不接真微信）
  onLogin() {
    wx.setStorageSync(AUTH_KEY, 'in');
    this.onShow();
  },

  onLogout() {
    wx.setStorageSync(AUTH_KEY, 'out');
    this.onShow();
  },

  goBuy() {
    wx.switchTab({ url: '/pages/verify/verify' });
  }
});
