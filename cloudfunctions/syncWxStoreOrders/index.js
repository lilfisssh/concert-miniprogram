// 云函数 syncWxStoreOrders: 定时(建议每 2-5 分钟)轮询「微信视频号小店」已支付订单,
// 按商品(SKU)映射成票档, 调用 importTickets 写入 tickets 集合。
//
// 配置定时触发器后即可自动同步。微信订单接口部分需你按官方文档补全(见 fetchPaidOrders)。
//
// 官方文档参考:
//   视频号小店/微信小店 服务端接口: https://developers.weixin.qq.com/doc/store/shop/API/
//   订单接口需在服务端用 access_token 调用, 不能在前端调。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 本场演出ID(与小程序 app.js 的 sessionId 一致; 多场次可改为按商品映射)
const SESSION_ID = 'concert-2026-06-21';

// ⚠️ 关键配置: 把小店里每个「门票商品/SKU」映射到票档分区与每单数量。
// key 用你在微信小店创建商品后拿到的 product_id 或 sku_id; zone: 0=A区 1=B区 2=C区。
// qtyPerUnit: 一个购买数量对应几个座位(通常 1, 即买N张=N座)。
const SKU_ZONE_MAP = {
  'TODO_PRODUCT_ID_A': { zone: 0, qtyPerUnit: 1 }, // A区 ¥76
  'TODO_PRODUCT_ID_B': { zone: 1, qtyPerUnit: 1 }, // B区 ¥69(B左/B右同属此档)
  'TODO_PRODUCT_ID_C': { zone: 2, qtyPerUnit: 1 }  // C区 ¥62
};

exports.main = async () => {
  // 读取上次同步游标
  const cursorDoc = await db.collection('sync_state').doc('wxstore').get().catch(() => null);
  const lastSyncTime = cursorDoc && cursorDoc.data ? cursorDoc.data.lastSyncTime : 0;

  // 1) 拉取自上次以来的已支付订单(需按官方文档补全)
  let orders;
  try {
    orders = await fetchPaidOrders(lastSyncTime);
  } catch (err) {
    console.error('拉取微信小店订单失败', err);
    return { success: false, message: '拉取订单失败' };
  }

  // 2) 映射成 tickets
  const tickets = [];
  for (const o of orders) {
    for (const item of (o.items || [])) {
      const map = SKU_ZONE_MAP[item.productId] || SKU_ZONE_MAP[item.skuId];
      if (!map) {
        console.warn('未配置映射的商品, 跳过:', item.productId, item.skuId);
        continue;
      }
      tickets.push({
        orderNo: o.orderNo,
        sessionId: SESSION_ID,
        zone: map.zone,
        qty: (item.quantity || 1) * map.qtyPerUnit,
        buyerPhone: o.buyerPhone || '',
        source: 'wxstore'
      });
    }
  }

  // 3) 写入 tickets(复用 importTickets 的幂等入库)
  let result = { inserted: 0, skipped: 0 };
  if (tickets.length > 0) {
    const r = await cloud.callFunction({
      name: 'importTickets',
      data: { internal: true, tickets }
    });
    result = r.result || result;
  }

  // 4) 更新游标
  await db.collection('sync_state').doc('wxstore').set({
    data: { lastSyncTime: Date.now(), lastResult: result }
  });

  return { success: true, fetched: orders.length, ...result };
};

/**
 * TODO: 按微信视频号小店官方订单接口实现。
 * 步骤:
 *   1. 获取 access_token(自有小店用 stable token; 第三方代开发用 component 授权 token)。
 *   2. 调用「获取订单列表」接口, 过滤 status=已支付、update_time > lastSyncTime。
 *   3. 拉取每单详情, 取出商品 product_id/sku_id、数量、买家手机号、订单号。
 * 返回结构约定如下, 上面的映射逻辑即可直接使用:
 *   [{ orderNo, buyerPhone, items: [{ productId, skuId, quantity }] }]
 */
async function fetchPaidOrders(lastSyncTime) {
  // 占位实现: 未接入前返回空数组, 不影响其它功能。
  // 接入示例(伪代码):
  //   const token = await getAccessToken();
  //   const res = await rp.post(`https://api.weixin.qq.com/channels/ec/order/list/get?access_token=${token}`, { ... });
  //   return res.orders.map(normalize);
  return [];
}
