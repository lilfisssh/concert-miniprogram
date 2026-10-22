// app.js
App({
  globalData: {
    // 演出场次ID(示例)。真实项目中可由首页选择不同场次后传入。
    sessionId: 'concert-2026-06-21',
    // 核验通过的票: { orderNo, sessionId, zone, qty }。选座页据此限分区/限数量。
    ticket: null,
    // 本次选中的座位(选座页 -> 订单页传递)
    pendingSeats: [],
    // 云开发环境ID。部署后替换为你的云环境ID, 见 README。
    cloudEnv: 'TODO_REPLACE_WITH_YOUR_CLOUD_ENV'
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库版本过低, 请使用 2.2.3 以上基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      // 如果只有一个云环境, 也可用 wx.cloud.DYNAMIC_CURRENT_ENV
      env: this.globalData.cloudEnv,
      traceUser: true
    });
  }
});
