// pages/verify/verify.js
const venue = require('../../utils/venue.js');
const app = getApp();

// 演示模式测试单号(云环境未配置时可用)
const DEMO_TICKETS = {
  'DEMO-VIP-2': { zone: 1, qty: 2 },
  'DEMO-FRONT-1': { zone: 0, qty: 1 },
  'DEMO-SIDE-3': { zone: 2, qty: 3 },
  'DEMO-BACK-2': { zone: 3, qty: 2 }
};

Page({
  data: {
    orderNo: '',
    phone4: '',
    verifying: false,
    demoMode: false
  },

  onLoad() {
    const isDemo = !app.globalData.cloudEnv || app.globalData.cloudEnv.indexOf('TODO') === 0;
    this.setData({ demoMode: isDemo });
  },

  onOrderInput(e) { this.setData({ orderNo: e.detail.value.trim() }); },
  onPhoneInput(e) { this.setData({ phone4: e.detail.value.trim() }); },
  fillDemo(e) { this.setData({ orderNo: e.currentTarget.dataset.code }); },

  onVerify() {
    const orderNo = this.data.orderNo;
    if (!orderNo) {
      wx.showToast({ title: '请输入订单号', icon: 'none' });
      return;
    }
    this.setData({ verifying: true });

    // 演示模式: 本地校验测试单号
    if (this.data.demoMode) {
      const t = DEMO_TICKETS[orderNo];
      this.setData({ verifying: false });
      if (!t) {
        wx.showModal({ title: '核验失败', content: '未找到该订单号(演示模式请用页面下方测试单号)', showCancel: false });
        return;
      }
      this.gotoSeat({ orderNo, sessionId: app.globalData.sessionId, zone: t.zone, qty: t.qty });
      return;
    }

    wx.cloud.callFunction({
      name: 'verifyTicket',
      data: {
        orderNo,
        sessionId: app.globalData.sessionId,
        phone4: this.data.phone4
      }
    }).then((res) => {
      this.setData({ verifying: false });
      const r = res.result || {};
      if (!r.success) {
        wx.showModal({ title: '核验失败', content: r.message || '订单号无效', showCancel: false });
        return;
      }
      this.gotoSeat(r.ticket);
    }).catch((err) => {
      console.error('verifyTicket 失败', err);
      this.setData({ verifying: false });
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    });
  },

  gotoSeat(ticket) {
    app.globalData.ticket = ticket;
    const zoneName = venue.ZONES[ticket.zone].name;
    wx.showToast({
      title: '核验成功：' + zoneName + ' ' + ticket.qty + '座',
      icon: 'none'
    });
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/seat/seat' });
    }, 600);
  }
});
