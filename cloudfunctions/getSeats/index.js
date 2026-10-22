// 云函数 getSeats: 返回某场次「已售(已被他人锁座绑定)」的座位列表
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { sessionId } = event;

  const soldRes = await db.collection('seats')
    .where({ sessionId, status: 'sold' })
    .field({ seatKey: true })
    .limit(1000)
    .get();

  return {
    sold: soldRes.data.map((d) => d.seatKey)
  };
};
