// pages/result/result.js
Page({
  data: {
    success: false,
    orderId: '',
    seats: ''
  },
  onLoad(query) {
    this.setData({
      success: query.success === '1',
      orderId: query.orderId || '',
      seats: query.seats ? decodeURIComponent(query.seats) : ''
    });
  },
  backHome() {
    wx.reLaunch({ url: '/pages/verify/verify' });
  }
});
