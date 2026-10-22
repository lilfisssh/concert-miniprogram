// 云函数侧座位表 —— 与 miniprogram/utils/venue.js 一致, 用于服务端校验分区。
const ROWS = 13;
const COLS = 21;

function buildSeatNo() {
  const seatNo = [];
  const full = [19, 18, 17, 16, 15, 0, 14, 13, 12, 11, 10, 9, 8, 7, 6, 0, 5, 4, 3, 2, 1];
  for (let r = 0; r <= 9; r++) seatNo.push(full.slice());
  const backRow = [11, 10, 0, 0, 0, 0, 0, 9, 8, 7, 6, 5, 4, 3, 0, 0, 0, 0, 0, 2, 1];
  seatNo.push(backRow.slice());
  seatNo.push(backRow.slice());
  seatNo.push([12, 11, 10, 0, 0, 0, 0, 9, 8, 7, 6, 5, 4, 3, 0, 0, 0, 0, 0, 2, 1]);
  return seatNo;
}
const SEAT_NO = buildSeatNo();

function parseKey(key) {
  const p = String(key).split('_');
  return { row: parseInt(p[0], 10), col: parseInt(p[1], 10) };
}
function isSeat(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS && SEAT_NO[row][col] !== 0;
}
function zoneOf(row, col) {
  if (row <= 1) return 0;
  if (row >= 10) return 3;
  if (col >= 6 && col <= 14) return 1;
  return 2;
}

module.exports = { ROWS, COLS, isSeat, zoneOf, parseKey };
