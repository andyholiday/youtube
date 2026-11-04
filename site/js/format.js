const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember'];

/** "2023-06-12" -> "12. Juni 2023"; alles andere -> "". */
export function formatDatum(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const monat = MONATE[Number(m[2]) - 1];
  return monat ? `${Number(m[3])}. ${monat} ${m[1]}` : '';
}
