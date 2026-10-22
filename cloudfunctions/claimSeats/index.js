// 云函数 claimSeats: 核验票后绑定座位。无支付。
//   校验: 票存在/属本人/未使用; 座位均在票档分区内; 数量与票一致; 座位未被占。
//   事务内把座位写为 sold(绑定 orderNo), 并把 ticket 置为 used。
const cloud = require('wx-server-sdk');
const venue = require('./venue.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function seatDocId(sessionId, seatKey) {
  return sessionId + '__' + seatKey;
}

exports.main = async (event) => {
  const { orderNo, sessionId, seats } = event;
  const { OPENID } = cloud.getWXContext();

  if (!orderNo || !sessionId || !Array.isArray(seats) || seats.length === 0) {
    return { success: false, message: '参数错误' };
  }

  // 取票校验
  let ticket;
  try {
    ticket = (await db.collection('tickets').doc(orderNo).get()).data;
  } catch (e) {
    return { success: false, message: '订单不存在' };
  }
  if (ticket.sessionId !== sessionId) return { success: false, message: '订单与场次不符' };
  if (ticket.boundOpenid && ticket.boundOpenid !== OPENID) return { success: false, message: '订单已被其他微信号核验' };
  if (ticket.status === 'used') {
    // 幂等: 同一人重复提交且座位一致, 视为成功
    if (ticket.boundOpenid === OPENID) return { success: true, seats: ticket.seats || [] };
    return { success: false, message: '订单已使用' };
  }
  if (seats.length !== ticket.qty) {
    return { success: false, message: '需选择 ' + ticket.qty + ' 个座位' };
  }

  // 校验每个座位: 合法 + 属于票档分区
  for (const key of seats) {
    const { row, col } = venue.parseKey(key);
    if (!venue.isSeat(row, col)) return { success: false, message: '存在非法座位' };
    if (venue.zoneOf(row, col) !== ticket.zone) {
      return { success: false, message: '所选座位超出你的票档区域' };
    }
  }

  // 事务锁定座位
  try {
    await db.runTransaction(async (transaction) => {
      // 再次确认票未被其他事务用掉
      const tk = await transaction.collection('tickets').doc(orderNo).get();
      if (tk.data.status === 'used') throw new Error('TICKET_USED');

      for (const key of seats) {
        const id = seatDocId(sessionId, key);
        let existing = null;
        try {
          existing = (await transaction.collection('seats').doc(id).get()).data;
        } catch (e) {
          existing = null;
        }
        if (existing && existing.status === 'sold') {
          throw new Error('SEAT_TAKEN:' + key);
        }
        const seatData = { sessionId, seatKey: key, status: 'sold', orderNo, holder: OPENID, soldTime: Date.now() };
        if (existing) {
          await transaction.collection('seats').doc(id).update({ data: seatData });
        } else {
          await transaction.collection('seats').doc(id).set({ data: seatData });
        }
      }

      await transaction.collection('tickets').doc(orderNo).update({
        data: { status: 'used', seats, boundOpenid: OPENID, useTime: Date.now() }
      });
    });
  } catch (err) {
    const msg = String(err.message || '');
    if (msg.startsWith('SEAT_TAKEN')) {
      return { success: false, message: '部分座位刚被选走，请返回重新选择' };
    }
    if (msg === 'TICKET_USED') {
      return { success: false, message: '订单已完成选座' };
    }
    console.error('claimSeats 事务失败', err);
    return { success: false, message: '锁座失败，请重试' };
  }

  return { success: true, seats };
};
