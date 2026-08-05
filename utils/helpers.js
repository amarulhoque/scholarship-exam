/** Pure helpers — no Firebase, no DOM. Safe to unit test. */

/* ------------------------------------------------------------- validation */

/** Bangladeshi mobile: 11 digits starting 013–019, optional +88 prefix. */
export const isMobile = (v = '') => /^(?:\+?88)?01[3-9]\d{8}$/.test(String(v).trim());

/** Strips +88 so every stored number has one shape. */
export const normalizeMobile = (v = '') => String(v).trim().replace(/^\+?88/, '');

export const isEmail = (v = '') => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim());

export const required = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/**
 * Validates a plain object against a rule map.
 * rules = { field: [{ test: fn, msg: 'string' }] }
 * @returns {Object} field -> first failing message
 */
export function validate(data, rules) {
  const errors = {};
  for (const [field, checks] of Object.entries(rules)) {
    for (const { test, msg } of checks) {
      if (!test(data[field], data)) { errors[field] = msg; break; }
    }
  }
  return errors;
}

/* ---------------------------------------------------------------- grading */

/** Bangladeshi secondary grading scale. */
export const GRADE_SCALE = [
  { min: 80, grade: 'A+', gpa: 5.00 },
  { min: 70, grade: 'A',  gpa: 4.00 },
  { min: 60, grade: 'A-', gpa: 3.50 },
  { min: 50, grade: 'B',  gpa: 3.00 },
  { min: 40, grade: 'C',  gpa: 2.00 },
  { min: 33, grade: 'D',  gpa: 1.00 },
  { min: 0,  grade: 'F',  gpa: 0.00 }
];

export const gradeFor = (percentage) =>
  GRADE_SCALE.find((g) => percentage >= g.min) ?? GRADE_SCALE.at(-1);

export const PASS_MARK_PERCENT = 33;

/**
 * Turns raw per-subject marks into a full result record.
 * @param {Object} marks    subjectId -> obtained marks
 * @param {Array}  subjects [{ id, name, fullMarks, passMarks }]
 */
export function computeResult(marks, subjects) {
  let total = 0, fullMarks = 0, failedSubjects = [];

  for (const s of subjects) {
    const got = Number(marks[s.id] ?? 0);
    total += got;
    fullMarks += Number(s.fullMarks || 100);
    if (got < Number(s.passMarks ?? Math.round(s.fullMarks * 0.33))) failedSubjects.push(s.name);
  }

  const percentage = fullMarks ? round(total / fullMarks * 100, 2) : 0;
  const failed = failedSubjects.length > 0 || percentage < PASS_MARK_PERCENT;
  const { grade, gpa } = failed ? { grade: 'F', gpa: 0 } : gradeFor(percentage);

  return { total, fullMarks, percentage, grade, gpa, failedSubjects, passed: !failed };
}

/**
 * Assigns merit positions with competition ranking (1, 2, 2, 4).
 * Mutates nothing; returns a new sorted array with `position` added.
 */
export function assignRanks(rows, key = 'total', field = 'position') {
  const sorted = [...rows].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
  let last = null, lastRank = 0;
  return sorted.map((row, i) => {
    const rank = row[key] === last ? lastRank : i + 1;
    last = row[key]; lastRank = rank;
    return { ...row, [field]: rank };
  });
}

/* -------------------------------------------------------------- formatting */

export const round = (n, dp = 2) => Number(Math.round(n + 'e' + dp) + 'e-' + dp);

/** HM-2026-000042 */
export const formatRegNo = (prefix, year, seq) =>
  `${prefix}-${year}-${String(seq).padStart(6, '0')}`;

export const parseRegNo = (regNo = '') => {
  const m = /^([A-Z]{2,4})-(\d{4})-(\d{6})$/.exec(String(regNo).trim().toUpperCase());
  return m ? { prefix: m[1], year: Number(m[2]), seq: Number(m[3]) } : null;
};

export const fmtDate = (value, opts = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!value) return '—';
  const d = value?.toDate ? value.toDate() : new Date(value);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', opts);
};

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

/** Escapes user text before it goes anywhere near innerHTML. */
export const esc = (v = '') => String(v).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* --------------------------------------------------------------------- csv */

export function toCSV(rows, columns) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(
    typeof c.value === 'function' ? c.value(r) : r[c.key]
  )).join(',')).join('\n');
  return `${head}\n${body}`;
}

/** Minimal RFC-4180 parser — handles quoted fields and embedded commas. */
export function parseCSV(text) {
  const rows = []; let row = [], field = '', inQuotes = false;
  const src = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header = [], ...body] = rows.filter((r) => r.some((c) => c !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function downloadFile(filename, content, type = 'text/csv;charset=utf-8;') {
  const url = URL.createObjectURL(new Blob(['\ufeff' + content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------------------------------------------------------- misc */

export const debounce = (fn, ms = 300) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

export const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

export const groupCount = (rows, key) => rows.reduce((acc, r) => {
  const k = (typeof key === 'function' ? key(r) : r[key]) || 'Unknown';
  acc[k] = (acc[k] || 0) + 1; return acc;
}, {});
