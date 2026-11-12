const pad = (n: number) => String(n).padStart(2, '0');

/** 分 → ¥1,234（整数元不带小数） */
export const yuan = (cents: number) =>
  '¥' + (cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

export const fmtDate = (t: string | number | Date) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const fmtTime = (t: string | number | Date) => {
  const d = new Date(t);
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const ago = (t: string | number | Date) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(t).getTime()) / 60000));
  return m < 60
    ? `${m} 分钟前`
    : m < 1440
      ? `${Math.round(m / 60)} 小时前`
      : `${Math.round(m / 1440)} 天前`;
};
/** 距离某时刻的剩余天数（向上取整，已过期为负或 0） */
export const daysLeft = (t: string | number | Date) =>
  Math.ceil((new Date(t).getTime() - Date.now()) / 86_400_000);
