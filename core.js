export const percentage = row => row.total !== null && row.total > 0 && row.registered !== null ? 100 * row.registered / row.total : null;
export const color = p => p === null ? 'gray' : p >= 70 ? 'green' : p >= 55 ? 'yellow' : 'red';
export const formatPercent = p => p === null ? '—' : new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 1}).format(p) + '%';
export function summary(rows) {
  const total = rows.reduce((s,r) => s + (r.total ?? 0), 0);
  const registered = rows.reduce((s,r) => s + (r.registered ?? 0), 0);
  const complete = rows.length > 0 && rows.every(r => r.total !== null && r.registered !== null);
  return {total, registered, complete, percent: complete && total > 0 ? 100 * registered / total : null,
    hasTotal: rows.some(r => r.total !== null), hasRegistered: rows.some(r => r.registered !== null)};
}
export function validateRow(r) {
  if (!r || typeof r.id !== 'string' || !r.id || r.id.length > 100 || !['1','2'].includes(r.campus)) throw Error('Проверьте корпус и идентификатор класса.');
  if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 30) throw Error('Укажите название класса (до 30 символов).');
  if (typeof r.teacher !== 'string' || r.teacher.length > 200) throw Error('Проверьте ФИО руководителя.');
  for (const key of ['total', 'registered']) if (r[key] !== null && (!Number.isInteger(r[key]) || r[key] < 0 || r[key] > 1000)) throw Error('Численность — целое число от 0 до 1000 или пустое поле.');
  if (r.total !== null && r.registered !== null && r.registered > r.total) throw Error('Зарегистрированных не может быть больше, чем учеников.');
  return {id:r.id, campus:r.campus, name:r.name.trim(), teacher:r.teacher.trim(), total:r.total, registered:r.registered};
}
export function validateData(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.rows) || data.rows.length > 1000) throw Error('Неверный формат таблицы. Ожидается файл данных версии 1.');
  if (data.updatedAt !== null && (typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt)))) throw Error('Неверная дата обновления.');
  const rows = data.rows.map(validateRow), ids = new Set(), names = new Set();
  for (const r of rows) {
    const key = r.campus + ':' + r.name.replace(/\s/g,'').toUpperCase();
    if (ids.has(r.id) || names.has(key)) throw Error('В таблице есть повторяющиеся классы.');
    ids.add(r.id); names.add(key);
  }
  return {version:1, updatedAt:data.updatedAt, rows};
}
export function encodeData(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(validateData(data), null, 2) + '\n');
  let binary=''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function decodeData(base64) {
  const bytes = Uint8Array.from(atob(base64.replace(/\s/g,'')), c=>c.charCodeAt(0));
  return validateData(JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)));
}
export function csv(rows) {
  // Prevent text cells from being interpreted as formulas by spreadsheet applications.
  const escape = value => {let s=String(value??''); if (/^[=+\-@\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"';};
  const s = summary(rows);
  return '\ufeff'+[['Корпус','Класс','Классный руководитель','Зарегистрировано','Всего учеников','Процент'],
    ...rows.map(r=>[r.campus,r.name,r.teacher,r.registered,r.total,percentage(r)===null?'':formatPercent(percentage(r))]),
    ['Вся школа','','',s.hasRegistered?s.registered:'',s.hasTotal?s.total:'',formatPercent(s.percent)]].map(row=>row.map(escape).join(';')).join('\r\n');
}
