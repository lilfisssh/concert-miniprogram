// pages/home/home.js —— 首页 Tab（全屏水墨 + 叠字 + 购票/介绍入口）
Page({
  data: {
    statusBarHeight: 44,
    videoReady: false
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: info.statusBarHeight || 44 });
  },

  // 视频首帧就绪 → 淡入视频层（盖在本地兜底静帧之上）
  onVideoReady() {
    if (!this.data.videoReady) this.setData({ videoReady: true });
  },

  // 主动播放：autoplay 不可靠时用 VideoContext 兜底；Tab 切回 onShow 恢复播放
  onReady() {
    this.playBgVideo();
  },

  onShow() {
    this.playBgVideo();
  },

  playBgVideo() {
    this.videoCtx = this.videoCtx || wx.createVideoContext('bgVideo');
    this.videoCtx.play();
  },

  // 立即购票 → 购票 Tab（核验订单号 → 选座）
  goBuy() {
    wx.switchTab({ url: '/pages/verify/verify' });
  },

  // 活动介绍（独立页，不占 Tab）
  goAbout() {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  // 我的订单 / 我的 → 我的 Tab
  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  }
});
