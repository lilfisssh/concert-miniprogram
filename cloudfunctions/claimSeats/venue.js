// 云函数侧座位表 —— 与 miniprogram/utils/venue.js 一致(box 布局 A/B/C), 用于服务端校验分区。
// box 规格: A区 7x8; B区 = BL 5x4 + BR 5x4(左右仅前端镜头分块, 计价/校验同属 B); C区 3x6。
// seatKey 形式: A-2-5 / B-L-1-2 / B-R-4-3 / C-0-1; zone id: 0=A, 1=B, 2=C。
const ZONE_A = 0;
const ZONE_B = 1;
const ZONE_C = 2;

const ZONES = [
  { id: ZONE_A, key: 'A', name: 'A区', price: 76, color: '#2F6B4F' },
  { id: ZONE_B, key: 'B', name: 'B区', price: 69, color: '#5B9A72' },
  { id: ZONE_C, key: 'C', name: 'C区', price: 62, color: '#A8D5B5' }
];

const BLOCKS = [
  { block: 'A',  zone: ZONE_A, rows: 7, cols: 8 },
  { block: 'BL', zone: ZONE_B, rows: 5, cols: 4 },
  { block: 'BR', zone: ZONE_B, rows: 5, cols: 4 },
  { block: 'C',  zone: ZONE_C, rows: 3, cols: 6 }
];

const BLOCK_MAP = {};
BLOCKS.forEach((b) => { BLOCK_MAP[b.block] = b; });

function seatKey(block, row, col) {
  if (block === 'BL') return 'B-L-' + row + '-' + col;
  if (block === 'BR') return 'B-R-' + row + '-' + col;
  return block + '-' + row + '-' + col;
}

function parseKey(key) {
  const p = String(key).split('-');
  if (p[0] === 'B' && (p[1] === 'L' || p[1] === 'R')) {
    return { block: 'B' + p[1], row: parseInt(p[2], 10), col: parseInt(p[3], 10) };
  }
  return { block: p[0], row: parseInt(p[1], 10), col: parseInt(p[2], 10) };
}

function isSeat(block, row, col) {
  const b = BLOCK_MAP[block];
  return !!b && row >= 0 && row < b.rows && col >= 0 && col < b.cols;
}

function zoneOf(block) {
  const b = BLOCK_MAP[block];
  return b ? b.zone : -1;
}

module.exports = { ZONES, BLOCKS, seatKey, parseKey, isSeat, zoneOf };
