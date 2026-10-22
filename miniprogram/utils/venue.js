/**
 * 场地座位建模 (面向观众视角) —— 从 Android SeatTable 版本移植。
 *
 * 场地共 13 排, 统一映射为 13 行 x 21 列网格, 过道/空位用 0 表示(不可选)。
 * 座位号沿用场地图: 从左到右递减, 每排独立编号。
 *
 * 票价分区(4 档):
 *   - 前排   : 第 1-2 排整排
 *   - 中区VIP: 第 3-10 排中段(座 14~6)
 *   - 侧区   : 第 3-10 排两侧(座 19~15 与 5~1)
 *   - 后排   : 第 11-13 排整排
 *
 * 该文件在小程序前端与云函数中复用, 保证前后端座位/价格口径一致。
 */

const ROWS = 13;
const COLS = 21;

const ZONE_FRONT = 0; // 前排 1-2 排
const ZONE_VIP = 1;   // 中区 3-10 排中段
const ZONE_SIDE = 2;  // 侧区 3-10 排两侧
const ZONE_BACK = 3;  // 后排 11-13 排

const ZONES = [
  { id: ZONE_FRONT, name: '前排', price: 680, color: '#F5A623' },
  { id: ZONE_VIP, name: '中区VIP', price: 880, color: '#9B59B6' },
  { id: ZONE_SIDE, name: '侧区', price: 480, color: '#3498DB' },
  { id: ZONE_BACK, name: '后排', price: 280, color: '#607D8B' }
];

// 每个网格的座位号; 0 表示过道/空位(不可选)
function buildSeatNo() {
  const seatNo = [];

  // 第 1-10 排: 左 19~15 | 过道 | 中 14~6 | 过道 | 右 5~1
  const full = [19, 18, 17, 16, 15, 0, 14, 13, 12, 11, 10, 9, 8, 7, 6, 0, 5, 4, 3, 2, 1];
  for (let r = 0; r <= 9; r++) {
    seatNo.push(full.slice());
  }

  // 第 11-12 排: 左 11,10 | 中(居中) 9~3 | 右 2,1
  const backRow = [11, 10, 0, 0, 0, 0, 0, 9, 8, 7, 6, 5, 4, 3, 0, 0, 0, 0, 0, 2, 1];
  seatNo.push(backRow.slice());
  seatNo.push(backRow.slice());

  // 第 13 排: 左 12,11,10 | 中 9~3 | 右 2,1
  seatNo.push([12, 11, 10, 0, 0, 0, 0, 9, 8, 7, 6, 5, 4, 3, 0, 0, 0, 0, 0, 2, 1]);

  return seatNo;
}

const SEAT_NO = buildSeatNo();

function isSeat(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS && SEAT_NO[row][col] !== 0;
}

function zoneOf(row, col) {
  if (row <= 1) return ZONE_FRONT;        // 第 1-2 排
  if (row >= 10) return ZONE_BACK;        // 第 11-13 排
  if (col >= 6 && col <= 14) return ZONE_VIP; // 第 3-10 排中段
  return ZONE_SIDE;                       // 第 3-10 排两侧
}

function priceOf(row, col) {
  return ZONES[zoneOf(row, col)].price;
}

function colorOf(row, col) {
  return ZONES[zoneOf(row, col)].color;
}

// 座位唯一标识, 用于已售/锁座/订单, 前后端一致
function seatKey(row, col) {
  return row + '_' + col;
}

function seatNoAt(row, col) {
  return SEAT_NO[row][col];
}

// 展示用文字, 如 "第3排12座"
function seatLabel(row, col) {
  return '第' + (row + 1) + '排' + SEAT_NO[row][col] + '座';
}

module.exports = {
  ROWS,
  COLS,
  ZONES,
  SEAT_NO,
  isSeat,
  zoneOf,
  priceOf,
  colorOf,
  seatKey,
  seatNoAt,
  seatLabel
};
