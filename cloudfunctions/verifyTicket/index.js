// 云函数 verifyTicket: 核验外部购票订单号。
// tickets 集合文档结构(由入库层写入):
//   _id=orderNo, orderNo, sessionId, zone(0=A区/1=B区/2=C区), qty, buyerPhone, status('unused'|'used'),
//   boundOpenid, seats[], source, importTime, verifyTime, useTime
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { orderNo, sessionId, phone4 } = event;
  const { OPENID } = cloud.getWXContext();

  if (!orderNo) return { success: false, message: '请输入订单号' };

  let ticket;
  try {
    const res = await db.collection('tickets').doc(orderNo).get();
    ticket = res.data;
  } catch (e) {
    return { success: false, message: '未找到该订单号，请核对后重试' };
  }

  if (sessionId && ticket.sessionId !== sessionId) {
    return { success: false, message: '该订单不属于本场演出' };
  }

  // 可选: 手机号后4位二次校验
  if (ticket.buyerPhone) {
    const last4 = String(ticket.buyerPhone).slice(-4);
    if (phone4 && phone4 !== last4) {
      return { success: false, message: '手机号后四位不匹配' };
    }
  }

  // 已使用(已选座完成)
  if (ticket.status === 'used') {
    if (ticket.boundOpenid === OPENID) {
      return { success: false, message: '该订单已完成选座', seats: ticket.seats || [] };
    }
    return { success: false, message: '该订单已被使用' };
  }

  // 绑定校验: 首次核验绑定当前用户, 之后仅本人可继续
  if (ticket.boundOpenid && ticket.boundOpenid !== OPENID) {
    return { success: false, message: '该订单已被其他微信号核验' };
  }

  if (!ticket.boundOpenid) {
    await db.collection('tickets').doc(orderNo).update({
      data: { boundOpenid: OPENID, verifyTime: Date.now() }
    });
  }

  return {
    success: true,
    ticket: {
      orderNo: ticket.orderNo,
      sessionId: ticket.sessionId,
      zone: ticket.zone,
      qty: ticket.qty
    }
  };
};
