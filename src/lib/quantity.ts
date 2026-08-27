// ===== 数量解析与分数运算工具 =====
// 共享模块，被 usePantryCooking.ts 和 PantryView.tsx 同时使用

// 辗转相除求最大公约数
export function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

// 约分
export function simplifyFraction(num: number, den: number): { num: number; den: number } {
  if (den === 0) return { num, den: 1 };
  if (den < 0) { num = -num; den = -den; }
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

// 分数加法: a/b + c/d = (ad + cb) / (bd)
export function addFraction(n1: number, d1: number, n2: number, d2: number) {
  return simplifyFraction(n1 * d2 + n2 * d1, d1 * d2);
}

// 分数减法: a/b - c/d = (ad - cb) / (bd)
export function subtractFraction(n1: number, d1: number, n2: number, d2: number) {
  return simplifyFraction(n1 * d2 - n2 * d1, d1 * d2);
}

// 格式化分数为字符串：整数→"5"，带分数→"1 2/3"，真分数→"2/3"
export function formatFraction(num: number, den: number): string {
  if (den === 1) return String(num);
  if (num === 0) return '0';
  const sign = num < 0 ? '-' : '';
  const absNum = Math.abs(num);
  if (absNum > den) {
    const whole = Math.floor(absNum / den);
    const rem = absNum % den;
    return rem === 0 ? `${sign}${whole}` : `${sign}${whole} ${rem}/${den}`;
  }
  return `${sign}${absNum}/${den}`;
}

// 格式化数量（不含"剩"前缀），分数模式保留分数，小数模式保留小数
export function formatQuantity(num: number, den: number, useFraction: boolean): string {
  if (useFraction && den > 1) return formatFraction(num, den);
  const f = num / den;
  return f % 1 === 0 ? String(f) : f.toFixed(2).replace(/\.?0+$/, '');
}

// 格式化剩余量（含"剩"前缀）
export function formatRemaining(num: number, den: number, unit: string, useFraction: boolean): string {
  return `剩${formatQuantity(num, den, useFraction)}${unit}`;
}

// 单位匹配：直接相等；g 与 克 互通（但空单位不算克重，避免"2个"误匹配"2g"）
const GRAM_UNITS = new Set(['g', '克']);
export function unitsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return GRAM_UNITS.has(a) && GRAM_UNITS.has(b);
}

const CHINESE_NUMBERS: Record<string, number> = {
  '半': 0.5, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

// 解析数量文本，保留原始格式信息（分数/小数/中文数字），用于输出时还原
// "200g"   → { numerator: 200, denominator: 1, unit: "g", isFraction: false, isHalf: false, number: 200 }
// "1/3根"  → { numerator: 1, denominator: 3, unit: "根", isFraction: true, isHalf: false, number: 0.333 }
// "半根"   → { numerator: 1, denominator: 2, unit: "根", isFraction: false, isHalf: true, number: 0.5 }
// "两根"   → { numerator: 2, denominator: 1, unit: "根", isFraction: false, isHalf: false, number: 2 }
// "剩100g" → 去掉"剩"前缀后解析
// "少许"   → null
export function parseQuantity(q: string): {
  numerator: number; denominator: number; unit: string;
  isFraction: boolean; isHalf: boolean; number: number;
} | null {
  let s = q.trim();
  if (!s) return null;

  // 去掉"剩"前缀（减法后的剩余量）
  if (s.startsWith('剩')) s = s.slice(1).trim();

  // 混合分数：1 2/3根、2 1/2根（先于纯分数和小数匹配）
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)$/);
  if (m) {
    const whole = parseInt(m[1]);
    const num = parseInt(m[2]);
    const den = parseInt(m[3]);
    if (den === 0) return null;
    return { numerator: whole * den + num, denominator: den, unit: m[4] || '', isFraction: true, isHalf: false, number: whole + num / den };
  }

  // 分数：1/3根、2/3根
  m = s.match(/^(\d+)\/(\d+)\s*(.*)$/);
  if (m) {
    const num = parseInt(m[1]);
    const den = parseInt(m[2]);
    if (den === 0) return null;
    return { numerator: num, denominator: den, unit: m[3] || '', isFraction: true, isHalf: false, number: num / den };
  }

  // 小数/整数：200g、0.5根、100g
  m = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (m) {
    const num = parseFloat(m[1]);
    return { numerator: num, denominator: 1, unit: m[2] || '', isFraction: false, isHalf: false, number: num };
  }

  // 中文数字：半根、两根、三根、一罐
  for (const [cn, num] of Object.entries(CHINESE_NUMBERS)) {
    if (s.startsWith(cn)) {
      const isHalf = cn === '半';
      return { numerator: isHalf ? 1 : num, denominator: isHalf ? 2 : 1, unit: s.slice(cn.length).trim() || '', isFraction: false, isHalf, number: num };
    }
  }

  return null;
}

// 两个数量字符串相减，返回剩余的字符串（不含"剩"前缀）。
// 用于「报损」场景下由损耗量反推剩余量：base 是当前剩余，sub 是本次损耗。
// - 损耗量缺单位时，默认借用基准单位（基准 "500g"、损耗 "100" → 视为 100g）
// - 单位不匹配或解析失败返回 null（调用方据此视为「无损耗 / 不折算」）
// - 结果为负时归零（损耗不可能超过库存）
export function quantitySubtract(baseQty: string, subQty: string): string | null {
  const a = parseQuantity(baseQty);
  const b = parseQuantity(subQty);
  if (!a || !b) return null;
  const bUnit = b.unit || a.unit; // 损耗量缺单位时借用基准单位
  if (!unitsMatch(a.unit, bUnit)) return null;
  const d = subtractFraction(a.numerator, a.denominator, b.numerator, b.denominator);
  if (d.num < 0) return '0' + a.unit;
  return formatQuantity(d.num, d.den, a.isFraction || a.isHalf) + a.unit;
}
