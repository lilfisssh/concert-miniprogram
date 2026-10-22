// pages/order/order.js  确认锁座(无站内支付; 票款已在微信小店付过)
const venue = require('../../utils/venue.js');
const app = getApp();

Page({
  data: {
    orderNo: '',
    zoneName: '',
    seats: [],
    claiming: false,
    zoneColors: venue.ZONES.map((z) => z.color)
  },

  onLoad() {
    const ticket = app.globalData.ticket || {};
    const seats = app.globalData.pendingSeats || [];
    this.setData({
      orderNo: ticket.orderNo || '',
      zoneName: ticket.zone != null ? venue.ZONES[ticket.zone].name : '',
      seats
    });
  },

  onClaim() {
    const ticket = app.globalData.ticket;
    const seats = this.data.seats;
    if (!ticket || seats.length === 0) return;
    this.setData({ claiming: true });

    // 演示模式: 云环境未配置时, 模拟锁座成功
    if (!app.globalData.cloudEnv || app.globalData.cloudEnv.indexOf('TODO') === 0) {
      setTimeout(() => {
        this.setData({ claiming: false });
        this.goResult(true, ticket.orderNo, seats);
      }, 700);
      return;
    }

    wx.cloud.callFunction({
      name: 'claimSeats',
      data: {
        orderNo: ticket.orderNo,
        sessionId: ticket.sessionId,
        seats: seats.map((s) => s.key)
      }
    }).then((res) => {
      const r = res.result || {};
      this.setData({ claiming: false });
      if (!r.success) {
        wx.showModal({
          title: '锁座失败',
          content: r.message || '部分座位刚被选走，请返回重新选择',
          showCancel: false
        });
        return;
      }
      this.goResult(true, ticket.orderNo, seats);
    }).catch((err) => {
      console.error('claimSeats 失败', err);
      this.setData({ claiming: false });
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    });
  },

  goResult(success, orderNo, seats) {
    const labels = (seats || []).map((s) => s.label).join('、');
    app.globalData.ticket = null;
    app.globalData.pendingSeats = [];
    wx.redirectTo({
      url: '/pages/result/result?success=' + (success ? 1 : 0) +
        '&orderId=' + orderNo + '&seats=' + encodeURIComponent(labels)
    });
  }
});
