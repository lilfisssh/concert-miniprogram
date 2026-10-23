// pages/verify/verify.js
const venue = require('../../utils/venue.js');
const app = getApp();

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

  onVerify() {
    const orderNo = this.data.orderNo;
    if (!orderNo) {
      wx.showToast({ title: '请输入订单号', icon: 'none' });
      return;
    }
    this.setData({ verifying: true });

    // 演示模式: 任意订单号本地核验通过, 默认 A区·1座
    if (this.data.demoMode) {
      this.setData({ verifying: false });
      this.gotoSeat({ orderNo, sessionId: app.globalData.sessionId, zone: 0, qty: 1 });
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
