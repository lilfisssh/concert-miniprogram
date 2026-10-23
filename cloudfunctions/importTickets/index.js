// 云函数 importTickets: 渠道无关的「单号入库」。
// 把外部购票订单写入 tickets 集合; 已存在的订单号跳过(幂等)。
//
// 三种用法:
//   1) 手动: 在云开发控制台「云函数测试」里传 { tickets: [...] }
//   2) HTTP: 配置 HTTP 触发, 外部渠道/腾讯轻联 POST { secret, tickets: [...] }
//   3) 被 syncWxStoreOrders 等同步函数内部调用
//
// 每条 ticket: { orderNo, sessionId, zone(0=A区/1=B区/2=C区), qty, buyerPhone? }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ⚠️ HTTP 触发时校验用的密钥, 部署后改成你自己的随机串
const IMPORT_SECRET = 'TODO_REPLACE_WITH_A_RANDOM_SECRET';

exports.main = async (event) => {
  // HTTP 触发时 body 可能是字符串
  let payload = event;
  if (typeof event.body === 'string') {
    try { payload = JSON.parse(event.body); } catch (e) { payload = {}; }
  }

  // HTTP 调用需校验密钥; 云端测试/内部调用(带 internal=true)放行
  const isInternal = payload.internal === true;
  if (!isInternal && payload.secret !== IMPORT_SECRET) {
    return { success: false, message: 'secret 校验失败' };
  }

  const tickets = payload.tickets || [];
  if (!Array.isArray(tickets) || tickets.length === 0) {
    return { success: false, message: '无 tickets 数据' };
  }

  let inserted = 0, skipped = 0, invalid = 0;
  for (const t of tickets) {
    if (!t || !t.orderNo || t.zone == null || !t.qty || !t.sessionId) { invalid++; continue; }

    // 幂等: 订单号已存在则跳过
    const exist = await db.collection('tickets').doc(String(t.orderNo)).get().catch(() => null);
    if (exist && exist.data) { skipped++; continue; }

    await db.collection('tickets').doc(String(t.orderNo)).set({
      data: {
        orderNo: String(t.orderNo),
        sessionId: t.sessionId,
        zone: Number(t.zone),
        qty: Number(t.qty),
        buyerPhone: t.buyerPhone || '',
        status: 'unused',
        boundOpenid: '',
        seats: [],
        source: t.source || 'manual',
        importTime: Date.now()
      }
    }).then(() => { inserted++; }).catch(() => { invalid++; });
  }

  return { success: true, inserted, skipped, invalid };
};
