/**
 * 场地座位建模 —— A/B/C 三档 box 布局（对照原型 proto/index.html 的 buildLayout 与 SEAT_SPEC.md）。
 *
 * box 规格：
 *   - A 区: 7 排 x 8 座 = 56 座, ¥76, 深绿 #2F6B4F
 *   - B 区: 左(BL) 5排 x 4座 + 右(BR) 5排 x 4座 = 40 座, ¥69, 中绿 #5B9A72
 *           BL/BR 仅为前端镜头聚焦分块, 计价与锁座校验同属 B 区
 *   - C 区: 3 排 x 6 座 = 18 座, ¥62, 浅绿 #A8D5B5
 *
 * zone id 为数字(0=A, 1=B, 2=C), 与 tickets 集合的 zone 字段(Number)口径一致。
 * seatKey 沿用原型 id 形式: A-2-5 / B-L-1-2 / B-R-4-3 / C-0-1。
 *
 * 该文件在小程序前端与云函数 claimSeats 中各持一份, 改布局/分区时两处必须同步。
 */

const ZONE_A = 0;
const ZONE_B = 1;
const ZONE_C = 2;

const ZONES = [
  { id: ZONE_A, key: 'A', name: 'A区', price: 76, color: '#2F6B4F' },
  { id: ZONE_B, key: 'B', name: 'B区', price: 69, color: '#5B9A72' },
  { id: ZONE_C, key: 'C', name: 'C区', price: 62, color: '#A8D5B5' }
];

// 座位块: BL/BR 是 B 区的左右两个镜头块, 计价归 B
const BLOCKS = [
  { block: 'A',  zone: ZONE_A, rows: 7, cols: 8 },
  { block: 'BL', zone: ZONE_B, rows: 5, cols: 4 },
  { block: 'BR', zone: ZONE_B, rows: 5, cols: 4 },
  { block: 'C',  zone: ZONE_C, rows: 3, cols: 6 }
];

const BLOCK_MAP = {};
BLOCKS.forEach((b) => { BLOCK_MAP[b.block] = b; });

// 块展示名: BL/BR 显示为 B左/B右
function blockName(block) {
  if (block === 'BL') return 'B左';
  if (block === 'BR') return 'B右';
  const b = BLOCK_MAP[block];
  return b ? ZONES[b.zone].name : '';
}

// 座位唯一标识, 用于已售/锁座/订单, 前后端一致
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

// 块内每格都是座位(无过道/空位)
function isSeat(block, row, col) {
  const b = BLOCK_MAP[block];
  return !!b && row >= 0 && row < b.rows && col >= 0 && col < b.cols;
}

// BL/BR 同属 B 区
function zoneOf(block) {
  const b = BLOCK_MAP[block];
  return b ? b.zone : -1;
}

function priceOf(block) {
  return ZONES[zoneOf(block)].price;
}

function colorOf(block) {
  return ZONES[zoneOf(block)].color;
}

// 块内座位号: 每排从左到右 1..cols
function seatNoAt(block, row, col) {
  return col + 1;
}

// 展示用文字, 如 "B左2排3座"
function seatLabel(block, row, col) {
  return blockName(block) + (row + 1) + '排' + seatNoAt(block, row, col) + '座';
}

module.exports = {
  ZONE_A,
  ZONE_B,
  ZONE_C,
  ZONES,
  BLOCKS,
  blockName,
  seatKey,
  parseKey,
  isSeat,
  zoneOf,
  priceOf,
  colorOf,
  seatNoAt,
  seatLabel
};
