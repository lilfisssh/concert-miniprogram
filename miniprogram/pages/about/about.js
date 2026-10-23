// pages/about/about.js —— 活动介绍（方案 B：独立页，不占 Tab；底部仿 Tab 栏高亮「首页」）
Page({
  data: {
    statusBarHeight: 44,
    showAllPrograms: false,
    // 前 3 首实抄，04-20 占位（实名待补，见 PROTO.md）
    programs: []
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const programs = [
      { num: '01', name: 'Siren + BoomBoomBass（舞蹈串烧）', who: '表演：陈舒桐' },
      { num: '02', name: '像风一样 (live)', who: '演唱：张紫琪' },
      { num: '03', name: '多远都要在一起', who: '演唱：张紫琪' }
    ];
    for (let i = 4; i <= 20; i++) {
      const num = (i < 10 ? '0' : '') + i;
      programs.push({ num, name: '曲目 ' + num, who: '演唱：待定', placeholder: true });
    }
    this.setData({ statusBarHeight: info.statusBarHeight || 44, programs });
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/home/home' })
    });
  },

  togglePrograms() {
    this.setData({ showAllPrograms: !this.data.showAllPrograms });
  },

  goBuy() {
    wx.switchTab({ url: '/pages/verify/verify' });
  },

  // 底部仿 Tab 栏（视觉等同；about 非 Tab 页，原生 tabBar 不出现）
  goTab(e) {
    wx.switchTab({ url: e.currentTarget.dataset.url });
  }
});
