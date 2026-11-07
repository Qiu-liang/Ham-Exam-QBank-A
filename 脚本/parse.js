// Parse the A-class amateur radio exam question bank HTML into structured JSON + CSV.
// Usage: node 脚本/parse.js <input.html> <output.json> <output.csv> [label]
// 省略参数时默认读取 原始网页/a.html；相对路径按当前工作目录解析（建议在仓库根目录执行）。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
    if (g[0] === '#') {
      const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENT[g] !== undefined ? ENT[g] : m;
  });
}

function clean(s) {
  return decode(String(s).replace(/<[^>]*>/g, ' '))
    .replace(/[\u00a0\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const file = process.argv[2] || path.join(ROOT, '原始网页', 'a.html');
const outJson = process.argv[3] || path.join(ROOT, '题库数据', 'a_bank.json');
const outCsv = process.argv[4] || path.join(ROOT, '题库数据', 'a_bank.csv');
const label = process.argv[5] || '';
const html = fs.readFileSync(file, 'utf8');

const dlRe = /<dl class="[^"]*" data-id="(\d+)">([\s\S]*?)<\/dl>/g;
const questions = [];
let m;

while ((m = dlRe.exec(html)) !== null) {
  const id = Number(m[1]);
  const block = m[2];

  const dtMatch = block.match(/<dt>([\s\S]*?)<\/dt>/);
  if (!dtMatch) continue;
  const dt = dtMatch[1];

  const codeMatch = dt.match(/<span class="number">\s*\[([^\]]*)\]\s*<\/span>/);
  const code = codeMatch ? codeMatch[1].trim() : '';
  const typeMatch = code.match(/^MC(\d+)/i);
  const type = typeMatch ? Number(typeMatch[1]) : null;

  const stemRaw = dt.replace(/<span class="number">[\s\S]*?<\/span>/g, ' ')
    .replace(/<span class="translation">[\s\S]*?<\/span>/g, ' ');
  const stem = clean(stemRaw).replace(/^\d+\.\s*/, '');

  const stemTr = dt.match(/<span class="translation">([\s\S]*?)<\/span>/);
  const stemTranslation = stemTr ? clean(stemTr[1]) : '';

  const options = [];
  const liRe = /<li class="([^"]*)">([\s\S]*?)<\/li>/g;
  let li;
  while ((li = liRe.exec(block)) !== null) {
    const cls = li[1];
    const inner = li[2];
    const optMatch = inner.match(/<span class="option">([\s\S]*?)<\/span>/);
    const text = clean(optMatch ? optMatch[1] : inner.replace(/<span class="translation">[\s\S]*?<\/span>/g, ' '));
    const tr = inner.match(/<span class="translation">([\s\S]*?)<\/span>/);
    options.push({
      label: String.fromCharCode(65 + options.length),
      text,
      translation: tr ? clean(tr[1]) : '',
      correct: /\banswer\b/.test(cls),
    });
  }

  const sim = block.match(/<div class="similar">([\s\S]*?)<\/div>/);
  const similar = sim
    ? clean(sim[1]).replace(/^相似题号\s*/, '').split(/[,，\s]+/).filter(Boolean).map(Number)
    : [];

  const answers = options.filter((o) => o.correct).map((o) => o.label);
  questions.push({
    id,
    seq: questions.length + 1,
    number: String(id).padStart(4, '0'),
    code,
    type,
    stem,
    stemTranslation,
    options,
    answerCount: answers.length,
    answer: answers.join(''),
    answerText: options.filter((o) => o.correct).map((o) => o.label + '. ' + o.text).join('; '),
    similar,
  });
}

const counts = questions.reduce((acc, q) => {
  acc[q.answerCount] = (acc[q.answerCount] || 0) + 1;
  return acc;
}, {});

const meta = {
  source: 'https://exam.ham.upall.cn/',
  sourceUrl: 'https://exam.ham.upall.cn/' + (label ? '?t=' + label : ''),
  label,
  title: clean((html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]),
  pageVersion: clean((html.match(/<div class="ver">([\s\S]*?)<\/div>/) || [, ''])[1]),
  count: questions.length,
  singleChoice: counts[1] || 0,
  multiChoice: questions.length - (counts[1] || 0),
  answerCountDistribution: counts,
  notFourOptions: questions.filter((q) => q.options.length !== 4).length,
  answerCountMismatch: questions.filter((q) => q.type !== null && q.answerCount !== q.type).length,
  scrapedAt: new Date().toISOString(),
};

fs.writeFileSync(outJson, JSON.stringify({ meta, questions }, null, 2), 'utf8');

const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
const header = ['编号', '网站题号', '内部题号', '正确答案数', '题干',
  '选项A', '选项B', '选项C', '选项D',
  '答案', '正确答案原文', '相似题号'];
const rows = questions.map((q) => {
  const o = q.options.map((x) => x.text);
  while (o.length < 4) o.push('');
  return [q.seq, q.number, q.code, q.answerCount, q.stem, o[0], o[1], o[2], o[3],
    q.answer, q.answerText, q.similar.join(',')].map(esc).join(',');
});
fs.writeFileSync(outCsv, '\ufeff' + [header.map(esc).join(','), ...rows].join('\r\n') + '\r\n', 'utf8');

console.log(JSON.stringify(meta));
