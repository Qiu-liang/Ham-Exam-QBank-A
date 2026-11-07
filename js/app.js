/* ============================================================
   电波题库 · A 类业余无线电台操作证书
   原生 JavaScript 纯前端应用（无任何外部依赖）

   文件结构：
     index.html        页面骨架
     css/style.css     样式
     js/data.js        题库数据
     js/app.js         应用逻辑（本文件）

   代码结构：
   1. 基础工具 / 题库规范化
   2. 本地存储与学习状态
   3. 统计、错题本、练习会话
   4. 路由与页面骨架
   5. 首页 / 刷题 / 背题
   6. 模拟考试（设置、进行、结果）
   7. 错题本 / 学习统计
   8. 弹窗、提示、事件与启动
   ============================================================ */
'use strict';

/* ============================================================
   1. 基础工具 / 题库规范化
   ============================================================ */
const LS_KEY = 'ham_a_exam_state_v1';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PASS_RATE = 0.75;
const HISTORY_LIMIT = 20;
const DAILY_GOAL = 20;
const APP_TITLE = '电波题库';
const DEFAULT_EXAM = { singles: 32, multis: 8, minutes: 40, scope: 'all' };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clampInt = (value, min, max) => clamp(Math.round(Number(value) || 0), min, max);
const pad2 = (value) => String(value).padStart(2, '0');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(list, count) {
  return shuffle(list).slice(0, Math.max(0, count));
}

function uniqueSorted(value) {
  return Array.from(new Set(String(value || '').toUpperCase().replace(/[^A-Z]/g, '').split(''))).sort().join('');
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

function formatUsedTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (!seconds) return '不到 1 秒';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${pad2(s)} 秒`;
  return `${s} 秒`;
}

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDate(ts, withTime = true) {
  const d = new Date(ts);
  const base = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return withTime ? `${base} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : base;
}

function weekdayCN(date) {
  return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/* -------------------- 题库规范化 -------------------- */
function optionText(q, letter) {
  const index = letter.charCodeAt(0) - 65;
  return q.options[index] ?? '';
}

function answerLetters(q) {
  return q.answer ? q.answer.split('') : [];
}

function answerDisplay(q) {
  if (q.type === 'judge') return q.answer === 'A' ? '对' : '错';
  return answerLetters(q).join('、');
}

function optionLetterDisplay(q, index) {
  if (q.type === 'judge') return index === 0 ? '对' : '错';
  return LETTERS[index] || String(index + 1);
}

function typeLabel(q) {
  if (q.type === 'judge') return '判断';
  if (q.type === 'multiple') return '多选';
  return '单选';
}

function typeClass(q) {
  if (q.type === 'judge') return 'judge';
  if (q.type === 'multiple') return 'multiple';
  return '';
}

function buildExplanation(q) {
  if (q.type === 'judge') {
    return `正确答案：${answerDisplay(q)}。\n\n判断题需判断题目表述是否符合相关法规、技术规范或操作惯例。`;
  }
  const letters = answerLetters(q);
  const lines = [`正确答案：${answerDisplay(q)}${letters.length > 1 ? '（多选）' : ''}`];
  letters.forEach((letter) => {
    lines.push(`${letter}. ${optionText(q, letter)}`);
  });
  if (letters.length > 1) {
    lines.push('');
    lines.push(`本题为多选题，共 ${letters.length} 个正确选项，需全部选对且不选错项。`);
  }
  return lines.join('\n');
}

function explanationBody(q) {
  let text = String(q.explanation || '').trim();
  if (text.startsWith('正确答案：')) {
    const lineEnd = text.indexOf('\n');
    text = lineEnd >= 0 ? text.slice(lineEnd + 1) : '';
  }
  return text.trim();
}

function normalizeQuestion(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  let options = Array.isArray(raw.options) ? raw.options : [];
  options = options
    .map((item) => {
      if (item && typeof item === 'object') return String(item.text ?? item.label ?? '').trim();
      return String(item ?? '').trim();
    })
    .filter(Boolean);

  let type = String(raw.type ?? '').toLowerCase();
  let answerRaw = raw.answer;
  if (Array.isArray(answerRaw)) answerRaw = answerRaw.join('');
  let answer = String(answerRaw ?? '').trim();

  const isJudge = type.includes('judge') || type.includes('判断') || /^[对错]$/.test(answer);
  if (isJudge) {
    type = 'judge';
    if (!options.length) options = ['对', '错'];
    if (!/^[AB]$/i.test(answer)) {
      answer = /^(对|正确|是|true|t|a)$/i.test(answer) ? 'A' : 'B';
    } else {
      answer = answer.toUpperCase();
    }
  } else {
    const letters = Array.from(new Set(answer.toUpperCase().replace(/[^A-Z]/g, '').split('')))
      .filter((letter) => letter.charCodeAt(0) - 65 < options.length)
      .sort();
    answer = letters.join('');
    const explicitlyMultiple = type.includes('multi') || type.includes('多选');
    type = explicitlyMultiple || letters.length > 1 ? 'multiple' : 'single';
  }

  if (!options.length || !answer) return null;

  const question = String(raw.question ?? raw.stem ?? '').trim();
  if (!question) return null;

  let id = raw.id;
  if (id === undefined || id === null || id === '') id = index + 1;

  const q = {
    id: String(id),
    category: String(raw.category ?? raw.chapter ?? '未分类').trim() || '未分类',
    type,
    question,
    options,
    answer,
    explanation: String(raw.explanation ?? raw.analysis ?? '').trim()
  };
  if (!q.explanation) q.explanation = buildExplanation(q);
  return q;
}

const RAW_QUESTIONS = (typeof QUESTIONS !== 'undefined' && Array.isArray(QUESTIONS)) ? QUESTIONS : [];
const BANK = [];
const USED_IDS = new Set();
RAW_QUESTIONS.forEach((raw, index) => {
  const q = normalizeQuestion(raw, index);
  if (!q) return;
  let id = q.id;
  let suffix = 2;
  while (USED_IDS.has(id)) {
    id = `${q.id}-${suffix}`;
    suffix += 1;
  }
  q.id = id;
  USED_IDS.add(id);
  BANK.push(q);
});

const BANK_MAP = new Map(BANK.map((q) => [q.id, q]));
const SINGLE_BANK = BANK.filter((q) => q.type === 'single' || q.type === 'judge');
const MULTI_BANK = BANK.filter((q) => q.type === 'multiple');

const CHAPTER_FALLBACK = [
  { name: '法规与执照管理', short: '法规', desc: '无线电管理条例、执照申请、处罚与操作能力' },
  { name: '频率划分与使用', short: '频率', desc: '频率划分、业余波段、发射功率与次要业务' },
  { name: '通联操作与术语', short: '通联', desc: 'CQ 呼叫、Q 简语、缩语、QSL 与通信方式' },
  { name: '收发信设备与操作', short: '设备', desc: '收发信机、PTT、静噪、AGC 与面板功能' },
  { name: '天线与电波传播', short: '天线', desc: '天线增益、驻波比、馈线、极化与传播' },
  { name: '接收技术与微弱信号', short: '接收', desc: '接收机指标、灵敏度、噪声与 EME' },
  { name: '电工电子与测量', short: '电路', desc: '电学基础、电源、万用表与计量单位' },
  { name: '电磁安全与防护', short: '安全', desc: '技术指标、电磁环境、防雷与用电安全' }
];
const CHAPTER_COLORS = ['#0d6f63', '#3d6da8', '#b07a24', '#7b598b', '#2a7f8f', '#63793f', '#a36146', '#596b75'];

const CATEGORY_NAMES = Array.from(new Set(BANK.map((q) => q.category)));
const CHAPTERS = CATEGORY_NAMES.map((name, index) => {
  const info = CHAPTER_FALLBACK.find((item) => item.name === name) || {};
  const count = BANK.filter((q) => q.category === name).length;
  return {
    name,
    short: info.short || name.slice(0, 2),
    desc: info.desc || '按题库内容整理的复习章节',
    color: CHAPTER_COLORS[index % CHAPTER_COLORS.length],
    count,
    index: index + 1
  };
});
const CHAPTER_MAP = new Map(CHAPTERS.map((chapter) => [chapter.name, chapter]));
const BANK_BY_CATEGORY = new Map(CHAPTERS.map((chapter) => [chapter.name, BANK.filter((q) => q.category === chapter.name)]));

const META = (typeof BANK_META !== 'undefined' && BANK_META) ? BANK_META : {};
const BANK_VERSION = META.version || '2025 新版';
const BANK_SOURCE = META.source || 'https://exam.ham.upall.cn/';
const BANK_SOURCE_URL = META.sourceUrl || BANK_SOURCE;

function chapterOf(q) {
  return CHAPTER_MAP.get(q.category) || { name: q.category, short: q.category.slice(0, 2), color: CHAPTER_COLORS[0], index: 0 };
}

function categoryPreview(category) {
  const list = category === 'all' ? BANK : (BANK_BY_CATEGORY.get(category) || []);
  return list;
}

/* ============================================================
   2. 本地存储与学习状态
   ============================================================ */
function blankState() {
  return {
    version: 1,
    practice: {
      currentKey: null,
      sessions: {},
      lastFilter: 'all',
      lastOrder: 'seq'
    },
    study: {
      filter: 'all',
      index: 0,
      showAnswer: true
    },
    wrong: {},
    records: {},
    stats: {
      attempts: 0,
      correct: 0,
      daily: {}
    },
    exam: {
      settings: { ...DEFAULT_EXAM },
      active: null,
      lastResult: null,
      history: []
    }
  };
}

function chapterPoolLength(filter) {
  if (filter === 'all') return BANK.length;
  return (BANK_BY_CATEGORY.get(filter) || []).length;
}

function sanitizeSession(raw) {
  if (!raw || !Array.isArray(raw.ids)) return null;
  const ids = Array.from(new Set(raw.ids.map(String).filter((id) => BANK_MAP.has(id))));
  if (!ids.length) return null;
  const answers = {};
  const selected = {};
  for (const id of ids) {
    const q = BANK_MAP.get(id);
    let answer = raw.answers && raw.answers[id];
    if (answer && typeof answer === 'object') {
      const value = uniqueSorted(answer.selected || '');
      if (value) {
        answers[id] = {
          selected: value,
          correct: value === q.answer,
          at: Number(answer.at) || Date.now()
        };
      }
    } else if (typeof answer === 'string') {
      const value = uniqueSorted(answer);
      if (value) answers[id] = { selected: value, correct: value === q.answer, at: Date.now() };
    }
    const pending = raw.selected && raw.selected[id];
    if (typeof pending === 'string') {
      const value = uniqueSorted(pending);
      if (value) selected[id] = value;
    }
  }
  return {
    ids,
    index: clampInt(raw.index, 0, ids.length),
    answers,
    selected,
    startedAt: Number(raw.startedAt) || Date.now(),
    filter: raw.filter,
    order: raw.order,
    custom: Boolean(raw.custom),
    title: raw.title || ''
  };
}

function sanitizeState(data) {
  const validIds = new Set(BANK.map((q) => q.id));

  for (const id of Object.keys(data.records || {})) {
    if (!validIds.has(id)) delete data.records[id];
  }
  for (const id of Object.keys(data.wrong || {})) {
    if (!validIds.has(id)) delete data.wrong[id];
  }

  let totalAttempts = 0;
  let totalCorrect = 0;
  for (const [id, record] of Object.entries(data.records || {})) {
    const attempts = Math.max(0, Math.round(Number(record.attempts) || 0));
    const correct = clamp(Math.round(Number(record.correct) || 0), 0, attempts);
    record.attempts = attempts;
    record.correct = correct;
    record.firstAt = Number(record.firstAt) || Number(record.lastAt) || Date.now();
    record.lastAt = Number(record.lastAt) || record.firstAt;
    record.lastAnswer = uniqueSorted(record.lastAnswer || '');
    record.category = BANK_MAP.get(id)?.category || record.category || '未分类';
    totalAttempts += attempts;
    totalCorrect += correct;
  }

  data.stats = data.stats && typeof data.stats === 'object' ? data.stats : {};
  data.stats.daily = data.stats.daily && typeof data.stats.daily === 'object' ? data.stats.daily : {};
  data.stats.attempts = totalAttempts;
  data.stats.correct = totalCorrect;

  const cleanDaily = {};
  for (const [key, value] of Object.entries(data.stats.daily)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== 'object') continue;
    const attempts = Math.max(0, Math.round(Number(value.attempts) || 0));
    if (!attempts) continue;
    cleanDaily[key] = {
      attempts,
      correct: clamp(Math.round(Number(value.correct) || 0), 0, attempts)
    };
  }
  data.stats.daily = cleanDaily;

  for (const [id, wrong] of Object.entries(data.wrong || {})) {
    if (!wrong || typeof wrong !== 'object') {
      delete data.wrong[id];
      continue;
    }
    wrong.count = Math.max(1, Math.round(Number(wrong.count) || 1));
    wrong.lastAt = Number(wrong.lastAt) || Date.now();
    wrong.lastAnswer = uniqueSorted(wrong.lastAnswer || '');
    wrong.category = BANK_MAP.get(id)?.category || wrong.category || '未分类';
  }

  const sessions = {};
  for (const [key, session] of Object.entries(data.practice.sessions || {})) {
    const clean = sanitizeSession(session);
    if (clean) sessions[key] = clean;
  }
  data.practice.sessions = sessions;
  if (!data.practice.currentKey || !sessions[data.practice.currentKey]) data.practice.currentKey = null;
  if (!['seq', 'random'].includes(data.practice.lastOrder)) data.practice.lastOrder = 'seq';
  if (data.practice.lastFilter !== 'all' && !BANK_BY_CATEGORY.has(data.practice.lastFilter)) {
    data.practice.lastFilter = 'all';
  }

  if (data.study.filter !== 'all' && !BANK_BY_CATEGORY.has(data.study.filter)) {
    data.study.filter = 'all';
  }
  const studyPoolLength = chapterPoolLength(data.study.filter);
  data.study.index = clampInt(data.study.index, 0, Math.max(0, studyPoolLength - 1));
  data.study.showAnswer = data.study.showAnswer !== false;

  data.exam = data.exam && typeof data.exam === 'object' ? data.exam : {};
  data.exam.settings = { ...DEFAULT_EXAM, ...(data.exam.settings || {}) };
  data.exam.settings.singles = clampInt(data.exam.settings.singles, 0, SINGLE_BANK.length);
  data.exam.settings.multis = clampInt(data.exam.settings.multis, 0, MULTI_BANK.length);
  data.exam.settings.minutes = clampInt(data.exam.settings.minutes, 1, 180);
  if (data.exam.settings.scope !== 'all' && !BANK_BY_CATEGORY.has(data.exam.settings.scope)) {
    data.exam.settings.scope = 'all';
  }
  data.exam.history = Array.isArray(data.exam.history) ? data.exam.history.slice(0, HISTORY_LIMIT) : [];

  if (data.exam.active && typeof data.exam.active === 'object') {
    const active = data.exam.active;
    const questions = Array.from(new Set((active.questions || []).map(String).filter((id) => BANK_MAP.has(id))));
    if (!questions.length) {
      data.exam.active = null;
    } else {
      active.questions = questions;
      active.index = clampInt(active.index, 0, questions.length - 1);
      const answers = {};
      for (const [id, value] of Object.entries(active.answers || {})) {
        if (questions.includes(id)) {
          const letters = uniqueSorted(value);
          if (letters) answers[id] = letters;
        }
      }
      active.answers = answers;
      active.createdAt = Number(active.createdAt) || Date.now();
      active.durationSec = Math.max(1, Math.round(Number(active.durationSec) || (Number(active.settings?.minutes) || DEFAULT_EXAM.minutes) * 60));
      active.endAt = Number(active.endAt) || active.createdAt + active.durationSec * 1000;
      active.settings = { ...DEFAULT_EXAM, ...(active.settings || {}) };
      active.settings.passMark = Math.max(1, Math.round(Number(active.settings.passMark) || Math.ceil(questions.length * PASS_RATE)));
      active.warned5 = Boolean(active.warned5);
    }
  } else {
    data.exam.active = null;
  }

  if (data.exam.lastResult && (!Array.isArray(data.exam.lastResult.details) || !data.exam.lastResult.details.length)) {
    data.exam.lastResult = null;
  }

  return data;
}

function loadState() {
  const fallback = blankState();
  let raw = null;
  try {
    raw = localStorage.getItem(LS_KEY);
  } catch (error) {
    storageOK = false;
  }
  if (!raw) return fallback;

  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return fallback;
    fallback.practice = { ...fallback.practice, ...(saved.practice || {}) };
    fallback.practice.sessions = (saved.practice && saved.practice.sessions) || {};
    fallback.study = { ...fallback.study, ...(saved.study || {}) };
    fallback.wrong = saved.wrong && typeof saved.wrong === 'object' ? saved.wrong : {};
    fallback.records = saved.records && typeof saved.records === 'object' ? saved.records : {};
    fallback.stats = { ...fallback.stats, ...(saved.stats || {}) };
    fallback.stats.daily = (saved.stats && saved.stats.daily) || {};
    fallback.exam = { ...fallback.exam, ...(saved.exam || {}) };
    fallback.exam.settings = { ...DEFAULT_EXAM, ...(saved.exam && saved.exam.settings ? saved.exam.settings : {}) };
    fallback.exam.history = Array.isArray(saved.exam && saved.exam.history) ? saved.exam.history : [];
    return sanitizeState(fallback);
  } catch (error) {
    console.warn('[电波题库] 本地数据读取失败，已使用初始状态。', error);
    return fallback;
  }
}

let storageOK = true;
let storageWarned = false;
let saveTimer = null;

function saveState(immediate = false) {
  const persist = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (error) {
      storageOK = false;
      if (!storageWarned) {
        storageWarned = true;
        setTimeout(() => toast('浏览器本地存储不可用，本次学习进度可能无法保存。', 'warn', 4200), 0);
      }
    }
  };
  clearTimeout(saveTimer);
  if (immediate) persist();
  else saveTimer = setTimeout(persist, 120);
}

let state = loadState();

/* ============================================================
   3. 统计、错题本、练习会话
   ============================================================ */
function overview() {
  let answered = 0;
  let mastered = 0;
  let attempts = 0;
  let correct = 0;
  for (const q of BANK) {
    const record = state.records[q.id];
    if (!record) continue;
    if (record.attempts > 0) answered += 1;
    if (record.correct > 0) mastered += 1;
    attempts += Number(record.attempts) || 0;
    correct += Number(record.correct) || 0;
  }
  const total = BANK.length;
  return {
    total,
    answered,
    mastered,
    attempts,
    correct,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    mastery: total ? Math.round((mastered / total) * 100) : 0,
    wrong: Object.keys(state.wrong).length
  };
}

function todayStats() {
  return state.stats.daily[dayKey()] || { attempts: 0, correct: 0 };
}

function computeStreak() {
  const cursor = new Date();
  let key = dayKey(cursor);
  if (!(state.stats.daily[key]?.attempts > 0)) {
    cursor.setDate(cursor.getDate() - 1);
    key = dayKey(cursor);
  }
  let streak = 0;
  while (state.stats.daily[key]?.attempts > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
    key = dayKey(cursor);
  }
  return streak;
}

function last7Days() {
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    const value = state.stats.daily[key] || { attempts: 0, correct: 0 };
    days.push({
      key,
      label: `周${weekdayCN(date)}`,
      dateLabel: `${date.getMonth() + 1}/${date.getDate()}`,
      ...value
    });
  }
  return days;
}

function chapterStats() {
  return CHAPTERS.map((chapter) => {
    const list = BANK_BY_CATEGORY.get(chapter.name) || [];
    let answered = 0;
    let mastered = 0;
    let attempts = 0;
    let correct = 0;
    for (const q of list) {
      const record = state.records[q.id];
      if (!record) continue;
      if (record.attempts > 0) answered += 1;
      if (record.correct > 0) mastered += 1;
      attempts += Number(record.attempts) || 0;
      correct += Number(record.correct) || 0;
    }
    return {
      ...chapter,
      total: list.length,
      answered,
      mastered,
      attempts,
      correct,
      mastery: list.length ? Math.round((mastered / list.length) * 100) : 0,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
      coverage: list.length ? Math.round((answered / list.length) * 100) : 0
    };
  });
}

function wrongEntries(filter = 'all') {
  return Object.entries(state.wrong)
    .map(([id, wrong]) => ({ ...wrong, id, q: BANK_MAP.get(id) }))
    .filter((entry) => entry.q)
    .filter((entry) => filter === 'all' || entry.q.category === filter)
    .sort((a, b) => b.lastAt - a.lastAt);
}

function addWrong(q, selected) {
  const now = Date.now();
  const wrong = state.wrong[q.id] || { count: 0, firstAt: now };
  wrong.count = (Number(wrong.count) || 0) + 1;
  wrong.lastAt = now;
  wrong.lastAnswer = uniqueSorted(selected);
  wrong.category = q.category;
  state.wrong[q.id] = wrong;
}

function removeWrong(id) {
  if (state.wrong[id]) {
    delete state.wrong[id];
    saveState();
    return true;
  }
  return false;
}

function recordAttempt(q, selected, correct, source = 'practice') {
  const now = Date.now();
  const record = state.records[q.id] || { attempts: 0, correct: 0, firstAt: now };
  record.attempts = (Number(record.attempts) || 0) + 1;
  record.correct = (Number(record.correct) || 0) + (correct ? 1 : 0);
  record.lastAt = now;
  record.lastResult = correct ? 'correct' : 'wrong';
  record.lastAnswer = uniqueSorted(selected);
  record.lastSource = source;
  record.category = q.category;
  state.records[q.id] = record;

  const key = dayKey(now);
  const day = state.stats.daily[key] || { attempts: 0, correct: 0 };
  day.attempts += 1;
  if (correct) day.correct += 1;
  state.stats.daily[key] = day;
  state.stats.attempts = (Number(state.stats.attempts) || 0) + 1;
  state.stats.correct = (Number(state.stats.correct) || 0) + (correct ? 1 : 0);

  if (!correct && selected) addWrong(q, selected);
  saveState();
}

function makePracticeIds(filter, order) {
  const list = categoryPreview(filter);
  const ids = list.map((q) => q.id);
  return order === 'random' ? shuffle(ids) : ids;
}

function ensurePracticeSession(filter = state.practice.lastFilter, order = state.practice.lastOrder) {
  const safeFilter = filter === 'all' || BANK_BY_CATEGORY.has(filter) ? filter : 'all';
  const safeOrder = order === 'random' ? 'random' : 'seq';
  const key = `${safeFilter}::${safeOrder}`;
  if (!state.practice.sessions[key]) {
    state.practice.sessions[key] = {
      ids: makePracticeIds(safeFilter, safeOrder),
      index: 0,
      answers: {},
      selected: {},
      startedAt: Date.now(),
      filter: safeFilter,
      order: safeOrder,
      custom: false,
      title: ''
    };
  }
  state.practice.currentKey = key;
  state.practice.lastFilter = safeFilter;
  state.practice.lastOrder = safeOrder;
  saveState();
  return state.practice.sessions[key];
}

function currentPracticeSession() {
  const key = state.practice.currentKey;
  return key && state.practice.sessions[key] ? state.practice.sessions[key] : null;
}

function startCustomPractice(ids, title = '错题重做') {
  const validIds = Array.from(new Set(ids.map(String).filter((id) => BANK_MAP.has(id))));
  if (!validIds.length) {
    toast('没有可重做的题目。', 'warn');
    return;
  }
  for (const existingKey of Object.keys(state.practice.sessions)) {
    if (existingKey.startsWith('custom::')) delete state.practice.sessions[existingKey];
  }
  const key = `custom::${Date.now()}`;
  state.practice.sessions[key] = {
    ids: validIds,
    index: 0,
    answers: {},
    selected: {},
    startedAt: Date.now(),
    filter: state.practice.lastFilter,
    order: 'custom',
    custom: true,
    title
  };
  state.practice.currentKey = key;
  saveState(true);
  navigate('practice');
}

function practiceStats(session) {
  const answers = Object.values(session.answers || {});
  const correct = answers.filter((answer) => answer.correct).length;
  const answered = answers.length;
  const total = session.ids.length;
  return {
    total,
    answered,
    correct,
    wrong: answered - correct,
    skipped: total - answered,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0
  };
}

function scopePool(scope) {
  return scope === 'all' ? BANK : (BANK_BY_CATEGORY.get(scope) || []);
}

function availableForScope(scope) {
  const pool = scopePool(scope);
  return {
    total: pool.length,
    singles: pool.filter((q) => q.type === 'single' || q.type === 'judge').length,
    multis: pool.filter((q) => q.type === 'multiple').length
  };
}

function examRemaining(active = state.exam.active) {
  if (!active) return 0;
  return Math.max(0, Math.ceil((active.endAt - Date.now()) / 1000));
}

function examAnsweredCount(active = state.exam.active) {
  return active ? Object.keys(active.answers || {}).filter((id) => active.answers[id]).length : 0;
}

/* ============================================================
   4. 路由与页面骨架
   ============================================================ */
const VALID_VIEWS = new Set(['home', 'practice', 'study', 'exam', 'result', 'wrong', 'stats']);
const VIEW_TITLE = {
  home: '学习台',
  practice: '刷题模式',
  study: '背题模式',
  exam: '模拟考试',
  result: '考试回顾',
  wrong: '错题本',
  stats: '学习统计'
};
let currentView = 'home';
let resultFilter = 'all';
let wrongFilter = 'all';
let examTicker = null;
let finishingExam = false;

function getViewFromHash() {
  const raw = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
  const view = raw.split('/')[0] || 'home';
  return VALID_VIEWS.has(view) ? view : 'home';
}

function navigate(view) {
  currentView = VALID_VIEWS.has(view) ? view : 'home';
  const hash = `#/${currentView}`;
  if (location.hash === hash) {
    render();
    return;
  }
  location.hash = hash;
}

function handleRoute() {
  currentView = getViewFromHash();
  closeModal();
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function render() {
  currentView = getViewFromHash();
  const app = $('#app');
  if (!app) return;
  if (!BANK.length) {
    app.innerHTML = `
      <div class="empty-state" style="min-height:100vh; align-content:center;">
        <div class="empty-icon">${icon('alert')}</div>
        <h3>题库还没有加载</h3>
        <p>请检查 HTML 顶部的题库数据区，确保 QUESTIONS 数组中至少有一道题。</p>
      </div>`;
    return;
  }
  const wasExamLive = document.body.classList.contains('exam-live');
  document.body.classList.toggle('exam-live', currentView === 'exam' && Boolean(state.exam.active));
  if (wasExamLive !== document.body.classList.contains('exam-live')) {
    // 进入/退出考试专注模式时，避免移动端底部导航遮挡内容
    document.body.style.paddingBottom = '';
  }

  app.innerHTML = `
    ${sidebarHTML()}
    <div class="main-wrap">
      ${topbarHTML()}
      <main class="view" id="view" tabindex="-1">${viewHTML()}</main>
    </div>
    ${mobileNavHTML()}
  `;

  updateDocumentTitle();
  syncExamClockUI();
  if (state.exam.active) startExamTicker();
}

function viewHTML() {
  switch (currentView) {
    case 'practice': return renderPractice();
    case 'study': return renderStudy();
    case 'exam': return renderExam();
    case 'result': return renderResult();
    case 'wrong': return renderWrong();
    case 'stats': return renderStats();
    case 'home':
    default: return renderHome();
  }
}

function activeNavView() {
  return currentView === 'result' ? 'exam' : currentView;
}

function navLink(view, label, iconName, extra = '') {
  const active = activeNavView() === view;
  return `<a class="nav-item ${active ? 'is-active' : ''}" href="#/${view}" ${active ? 'aria-current="page"' : ''}>
    ${icon(iconName)}
    <span>${label}</span>
    ${extra}
  </a>`;
}

function sidebarHTML() {
  const ov = overview();
  const today = todayStats();
  const goalPct = clamp((today.attempts / DAILY_GOAL) * 100, 0, 100);
  const active = activeNavView();
  const wrongBadge = ov.wrong ? `<span class="nav-badge">${ov.wrong > 99 ? '99+' : ov.wrong}</span>` : '';
  return `
    <aside class="sidebar" aria-label="主导航">
      <a class="brand" href="#/home" aria-label="${esc(APP_TITLE)}首页">
        <span class="brand-mark">${icon('radio')}</span>
        <span>
          <span class="brand-name">${esc(APP_TITLE)}</span>
          <span class="brand-sub">A · Amateur Radio</span>
        </span>
      </a>

      <div class="side-label">练习</div>
      <nav class="side-nav">
        ${navLink('home', '学习台', 'home')}
        ${navLink('practice', '刷题模式', 'edit')}
        ${navLink('study', '背题模式', 'book')}
        ${navLink('exam', '模拟考试', 'timer')}
      </nav>

      <div class="side-label">回顾</div>
      <nav class="side-nav">
        ${navLink('wrong', '错题本', 'bookmark', wrongBadge)}
        ${navLink('stats', '学习统计', 'chart')}
      </nav>

      <div class="sidebar-spacer"></div>

      <div class="side-goal">
        <div class="side-goal-head">
          <span>今日目标</span>
          <strong>${Math.min(today.attempts, DAILY_GOAL)} / ${DAILY_GOAL} 题${today.attempts > DAILY_GOAL ? ' · 已超额' : ''}</strong>
        </div>
        <div class="side-goal-value">
          <strong>${today.attempts}</strong>
          <span>题已作答</span>
        </div>
        <div class="progress"><span style="width:${goalPct}%"></span></div>
        <div class="side-goal-foot">
          <span>${goalPct >= 100 ? '今日目标已完成' : `再答 ${DAILY_GOAL - today.attempts} 题达标`}</span>
          <span>${today.attempts ? `正确率 ${Math.round((today.correct / today.attempts) * 100)}%` : '开始第一题'}</span>
        </div>
      </div>

      <div class="sidebar-foot">
        进度保存在本机浏览器<br>
        题库 ${esc(BANK_VERSION)} · <a href="${esc(BANK_SOURCE_URL)}" target="_blank" rel="noopener noreferrer">来源</a>
      </div>
    </aside>`;
}

function topbarHTML() {
  const active = activeNavView();
  const examChip = state.exam.active && active !== 'exam'
    ? `<a class="exam-chip" href="#/exam" title="考试进行中，点击返回考试">
        <span class="live-dot"></span>
        <span class="exam-chip-label">考试进行中</span>
        <span data-exam-clock>${formatClock(examRemaining())}</span>
      </a>`
    : '';
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="topbar-left">
          <a class="mobile-brand" href="#/home" aria-label="${esc(APP_TITLE)}首页">
            <span class="brand-mark">${icon('radio')}</span>
            <span>${esc(APP_TITLE)}</span>
          </a>
          <div class="crumb">
            <span class="crumb-root">A 类题库</span>
            <span class="slash">/</span>
            <strong>${VIEW_TITLE[currentView] || '学习台'}</strong>
          </div>
        </div>
        <div class="topbar-right">
          ${examChip}
          <span class="save-pill desktop-only">${icon('check')} 自动保存</span>
          <a class="icon-btn mobile-only" href="#/stats" aria-label="学习统计">${icon('chart')}</a>
        </div>
      </div>
    </header>`;
}

function mobileNavHTML() {
  const active = activeNavView();
  const ov = overview();
  const item = (view, label, iconName, badge = '') => `
    <a href="#/${view}" class="${active === view ? 'is-active' : ''}" ${active === view ? 'aria-current="page"' : ''}>
      ${icon(iconName)}
      <span>${label}</span>
      ${badge}
    </a>`;
  return `
    <nav class="mobile-nav" aria-label="移动端导航">
      ${item('home', '首页', 'home')}
      ${item('practice', '刷题', 'edit')}
      ${item('study', '背题', 'book')}
      ${item('exam', '模考', 'timer')}
      ${item('wrong', '错题', 'bookmark', ov.wrong ? `<span class="nav-badge">${ov.wrong > 99 ? '99+' : ov.wrong}</span>` : '')}
    </nav>`;
}

function updateDocumentTitle() {
  if (state.exam.active) {
    document.title = `${formatClock(examRemaining())} · 考试中 · ${APP_TITLE}`;
    return;
  }
  document.title = `${VIEW_TITLE[currentView] || '学习台'} · ${APP_TITLE}`;
}

/* ============================================================
   5. 首页
   ============================================================ */
function ringSVG(pct, options = {}) {
  const value = clamp(Math.round(Number(pct) || 0), 0, 100);
  const size = Number(options.size) || 132;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const gradientId = `ringGrad${Math.random().toString(36).slice(2, 9)}`;
  const startColor = options.fail ? '#ffd0c5' : '#9af4e4';
  const midColor = options.fail ? '#e99789' : '#44d3ba';
  const endColor = options.fail ? '#d76d61' : '#1a9d8b';
  return `
    <div class="ring-box" role="img" aria-label="${esc(options.label || '掌握度')} ${value}%">
      <svg class="ring-svg" viewBox="0 0 120 120" style="--ring-size:${size}px" aria-hidden="true">
        <defs>
          <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${startColor}"></stop>
            <stop offset=".55" stop-color="${midColor}"></stop>
            <stop offset="1" stop-color="${endColor}"></stop>
          </linearGradient>
        </defs>
        <circle class="ring-track" cx="60" cy="60" r="${radius}"></circle>
        <circle class="ring-bar" cx="60" cy="60" r="${radius}"
          style="stroke:url(#${gradientId});stroke-dasharray:${circumference};stroke-dashoffset:${offset};"></circle>
      </svg>
      <div class="ring-center">
        <div class="ring-value">${value}<small>%</small></div>
        <div class="ring-label">${esc(options.label || '掌握度')}</div>
      </div>
    </div>`;
}

function renderHome() {
  const ov = overview();
  const streak = computeStreak();
  const today = todayStats();
  const session = currentPracticeSession();
  const sessionInfo = session && session.ids.length ? practiceStats(session) : null;
  const activeExam = state.exam.active;
  const lastResult = state.exam.lastResult;
  const chapters = chapterStats();
  const wrongCount = ov.wrong;

  let primaryLabel = '开始刷题';
  if (activeExam) primaryLabel = '继续考试';
  else if (sessionInfo && sessionInfo.answered > 0) primaryLabel = '继续刷题';

  const primaryHref = activeExam ? '#/exam' : '#/practice';
  const primaryIcon = activeExam ? 'timer' : 'play';
  const secondary = activeExam
    ? `<a class="btn btn-ghost-dark btn-lg" href="#/practice">${icon('edit')} 刷题模式</a>`
    : `<a class="btn btn-ghost-dark btn-lg" href="#/exam">${icon('timer')} 模拟考试</a>`;

  const sessionNote = sessionInfo
    ? `<div class="hero-progress-note">
        <span>${session.custom ? esc(session.title) : '本轮进度'} ${sessionInfo.answered} / ${sessionInfo.total}</span>
        <span class="bar"><span style="width:${sessionInfo.total ? (sessionInfo.answered / sessionInfo.total) * 100 : 0}%"></span></span>
        <span>${sessionInfo.correct} 题答对</span>
      </div>`
    : '';

  const chapterRows = chapters.map((chapter, index) => `
    <button class="chapter-row" type="button" data-action="home-chapter" data-category="${esc(chapter.name)}">
      <span class="chapter-num">${pad2(index + 1)}</span>
      <span>
        <span class="chapter-name">${esc(chapter.name)}</span>
        <span class="chapter-sub">已练 ${chapter.answered} / ${chapter.total} 题</span>
      </span>
      <span class="chapter-right">
        <span class="chapter-bar"><span style="width:${chapter.mastery}%;background:${chapter.color}"></span></span>
        <span class="chapter-pct">${chapter.mastery}%</span>
      </span>
    </button>`).join('');

  const lastExamPanel = lastResult
    ? `<div class="mini-exam">
        <div class="mini-score ${lastResult.passed ? '' : 'fail'}" style="--pct:${lastResult.total ? Math.round((lastResult.correct / lastResult.total) * 100) : 0}%"><span>${lastResult.total ? Math.round((lastResult.correct / lastResult.total) * 100) : 0}<small>%</small></span></div>
        <div class="mini-exam-info">
          <strong>${lastResult.passed ? '上次模考 · 合格' : '上次模考 · 未合格'}</strong>
          <span>${lastResult.correct} / ${lastResult.total} 题 · ${formatDate(lastResult.finishedAt, false)}</span>
        </div>
        <a class="btn btn-soft btn-sm" href="#/result">回顾</a>
      </div>`
    : `<div class="mini-exam">
        <div class="mini-score" style="--pct:0%"><span>—</span></div>
        <div class="mini-exam-info">
          <strong>还没有模考记录</strong>
          <span>40 题 · 40 分钟 · 30 题合格</span>
        </div>
        <a class="btn btn-soft btn-sm" href="#/exam">去模考</a>
      </div>`;

  const examModeMeta = lastResult
    ? `上次 ${lastResult.correct} / ${lastResult.total} 题 · ${lastResult.passed ? '已合格' : '待合格'}`
    : `${state.exam.settings.singles + state.exam.settings.multis} 题 · ${state.exam.settings.minutes} 分钟`;

  return `
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-eyebrow"><span class="live-dot"></span>${esc(BANK_VERSION)} · 共 ${BANK.length} 题</div>
        <h1>${greeting()}，<br><em>把每一道题，<span class="hero-em-line">听成自己的电波。</span></em></h1>
        <p class="hero-sub">A 类业余无线电台操作证 · ${BANK.length} 题真题。刷题、背题、模考，一条完整的备考路径。</p>
        <div class="hero-actions">
          <a class="btn btn-light btn-lg" href="${primaryHref}">
            ${icon(primaryIcon)} ${primaryLabel}
            ${activeExam ? `<span class="mono" data-exam-clock style="font-size:12px;opacity:.7">${formatClock(examRemaining())}</span>` : ''}
          </a>
          ${secondary}
        </div>
        ${sessionNote}
      </div>
      <div class="hero-ring-card">
        ${ringSVG(ov.mastery, { label: '总掌握度', size: 132 })}
        <div class="hero-ring-meta">已掌握 ${ov.mastered} / ${ov.total} 题</div>
      </div>
    </section>

    <section class="stat-grid" aria-label="学习概览">
      <div class="stat-card">
        <div class="stat-icon">${icon('target')}</div>
        <div>
          <div class="stat-value">${ov.answered}<small>/ ${ov.total}</small></div>
          <div class="stat-label">已练题目</div>
          <div class="stat-sub">题库覆盖 ${ov.total ? Math.round((ov.answered / ov.total) * 100) : 0}%</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">${icon('check-circle')}</div>
        <div>
          <div class="stat-value">${ov.accuracy}<small>%</small></div>
          <div class="stat-label">累计正确率</div>
          <div class="stat-sub">共作答 ${ov.attempts} 次</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">${icon('bookmark')}</div>
        <div>
          <div class="stat-value">${wrongCount}<small>题</small></div>
          <div class="stat-label">待复习错题</div>
          <div class="stat-sub">${wrongCount ? '去错题本重做' : '错题本很干净'}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber">${icon('flame')}</div>
        <div>
          <div class="stat-value">${streak}<small>天</small></div>
          <div class="stat-label">连续学习</div>
          <div class="stat-sub">今日已答 ${today.attempts} 题</div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <div class="section-title">${icon('layers')} 选择一种练习方式</div>
          <div class="section-sub">按自己的节奏推进，所有进度都会自动保存</div>
        </div>
      </div>
      <div class="mode-grid">
        <a class="mode-card" href="#/practice" data-tone="teal">
          <div class="mode-icon">${icon('edit')}</div>
          <h3>刷题模式</h3>
          <p>顺序或乱序逐题作答，提交后即时判题，答错自动收入错题本。</p>
          <div class="mode-meta">
            <span>${ov.answered} / ${ov.total} 已练</span>
            <span class="dot"></span>
            <span>${CHAPTERS.length} 个章节</span>
          </div>
          <span class="mode-arrow">${icon('arrow-right')}</span>
        </a>
        <a class="mode-card tone-amber" href="#/study" data-tone="amber">
          <div class="mode-icon">${icon('book')}</div>
          <h3>背题模式</h3>
          <p>题目、答案与解析同屏阅读，可先回忆再看答案，适合考前速记。</p>
          <div class="mode-meta">
            <span>答案速览</span>
            <span class="dot"></span>
            <span>按章节浏览</span>
          </div>
          <span class="mode-arrow">${icon('arrow-right')}</span>
        </a>
        <a class="mode-card tone-blue" href="#/exam" data-tone="blue">
          <div class="mode-icon">${icon('timer')}</div>
          <h3>模拟考试</h3>
          <p>${state.exam.settings.singles} 道单选 + ${state.exam.settings.multis} 道多选，${state.exam.settings.minutes} 分钟倒计时，交卷后逐题回顾。</p>
          <div class="mode-meta">
            <span>${examModeMeta}</span>
          </div>
          <span class="mode-arrow">${icon('arrow-right')}</span>
        </a>
      </div>
    </section>

    <section class="home-lower">
      <div class="panel home-panel">
        <div class="section-head">
          <div>
            <div class="section-title">${icon('chart')} 章节掌握度</div>
            <div class="section-sub">点击章节，直接进入该章的刷题练习</div>
          </div>
          <a class="section-link" href="#/stats">学习统计 ${icon('arrow-up-right')}</a>
        </div>
        <div class="chapter-list">${chapterRows}</div>
      </div>
      <div class="home-side">
        <div class="panel side-panel">
          <div class="side-panel-head">
            <h3>${icon('trophy')} 最近模考</h3>
            <a class="section-link" href="#/exam">去考试 ${icon('arrow-right')}</a>
          </div>
          ${lastExamPanel}
        </div>
        <div class="panel side-panel">
          <div class="side-panel-head">
            <h3>${icon('bookmark')} 错题复习</h3>
            <a class="section-link" href="#/wrong">全部 ${icon('arrow-right')}</a>
          </div>
          <div class="wrong-summary"><strong>${wrongCount}</strong><span>道题等待重做</span></div>
          <div class="wrong-summary-note">${wrongCount ? '答错的题会自动收集，重做正确后可手动移出。' : '目前没有错题，继续保持。'}</div>
          <a class="btn ${wrongCount ? 'btn-soft' : 'btn-ghost'} btn-sm" href="#/wrong">${wrongCount ? '打开错题本' : '查看错题本'}</a>
        </div>
      </div>
    </section>`;
}

/* ============================================================
   6. 刷题模式
   ============================================================ */
function pageHead(eyebrow, title, sub, actions = '') {
  return `
    <div class="page-head">
      <div class="page-head-main">
        <div class="eyebrow">${eyebrow}</div>
        <h1 class="page-title">${title}</h1>
        ${sub ? `<p class="page-sub">${sub}</p>` : ''}
      </div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ''}
    </div>`;
}

function renderAnswerOption(q, letter, options = {}) {
  const index = letter.charCodeAt(0) - 65;
  const selected = options.selected || '';
  const answered = Boolean(options.answered);
  const mode = options.mode || 'practice';
  const action = options.action || '';
  const selectedSet = new Set(selected.split(''));
  const correctSet = new Set(q.answer.split(''));
  const isSelected = selectedSet.has(letter);
  const isCorrect = correctSet.has(letter);

  let classes = 'option';
  if (mode === 'study' && answered) {
    classes += isCorrect ? ' is-correct' : ' is-muted';
  } else if (answered) {
    if (isCorrect) classes += ' is-correct';
    if (isSelected && !isCorrect) classes += ' is-wrong';
    if (!isSelected && isCorrect) classes += ' is-missed';
    if (!isSelected && !isCorrect) classes += ' is-muted';
  } else if (isSelected) {
    classes += ' is-selected';
  }

  let mark = '';
  if (mode === 'study' && answered) {
    mark = isCorrect ? icon('check') : '';
  } else if (answered) {
    if (isCorrect) mark = icon('check');
    else if (isSelected) mark = icon('x');
  }

  const inner = `
    <span class="option-letter">${esc(optionLetterDisplay(q, index))}</span>
    <span class="option-text">${esc(q.options[index])}</span>
    <span class="option-mark" aria-hidden="true">${mark}</span>`;

  if (mode === 'study') {
    return `<div class="${classes}" role="listitem">${inner}</div>`;
  }
  return `<button type="button" class="${classes}" data-action="${esc(action)}" data-letter="${letter}"
    aria-pressed="${isSelected}" ${answered ? 'aria-disabled="true"' : ''}>${inner}</button>`;
}

function explanationHTML(q, selected, correct, options = {}) {
  const wrongEntry = state.wrong[q.id];
  const answer = answerDisplay(q);
  const yourAnswer = selected ? (q.type === 'judge' ? (selected === 'A' ? '对' : '错') : selected.split('').join('、')) : '未作答';
  let callout = '';
  if (options.practice && !correct) {
    callout = `<div class="wrongbook-callout">${icon('bookmark')}已自动加入错题本 <a class="btn btn-ghost btn-sm" href="#/wrong">查看错题本</a></div>`;
  } else if (options.practice && correct && wrongEntry) {
    callout = `<div class="wrongbook-callout">${icon('check-circle')}这道题曾在错题本中，现在答对了
      <button type="button" class="btn btn-soft btn-sm" data-action="wrong-remove" data-id="${esc(q.id)}">移出错题本</button>
    </div>`;
  }
  return `
    <div class="explain-box ${correct ? '' : 'is-wrong'}">
      <div class="explain-head">
        <span class="explain-status">${icon(correct ? 'check-circle' : 'x-circle')}${correct ? '回答正确' : '回答错误'}</span>
        <span class="explain-status-badge">${typeLabel(q)}</span>
        ${selected ? `<span class="chip chip-line" style="margin-left:auto">你的选择 ${esc(yourAnswer)}</span>` : ''}
      </div>
      <div class="explain-answer">
        <span>正确答案</span><strong>${esc(answer)}</strong>
      </div>
      <div class="explain-text">${esc(explanationBody(q))}</div>
      <div class="auto-note">${icon('info')}解析依据标准答案整理，可在题库数据中替换为详细解析</div>
      ${callout}
    </div>`;
}

function practiceToolbarHTML(session) {
  const stats = practiceStats(session);
  if (session.custom) {
    return `
      <div class="custom-banner">
        ${icon('bookmark')}
        <span><strong>${esc(session.title || '错题重做')}</strong> · 共 ${stats.total} 题</span>
        <a class="banner-link" href="#/wrong" data-action="practice-exit-custom">退出重做</a>
      </div>
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="toolbar-progress">已答 <strong>${stats.answered}</strong> / ${stats.total}</div>
          <span class="chip chip-amber">${icon('refresh')} 重做模式</span>
        </div>
        <div class="toolbar-right">
          <button type="button" class="btn btn-ghost btn-sm" data-action="practice-reset">${icon('refresh')} 重新开始</button>
        </div>
      </div>`;
  }
  const options = [
    `<option value="all" ${session.filter === 'all' ? 'selected' : ''}>全部章节 · ${BANK.length} 题</option>`,
    ...CHAPTERS.map((chapter) => `<option value="${esc(chapter.name)}" ${session.filter === chapter.name ? 'selected' : ''}>${esc(chapter.name)} · ${chapter.count} 题</option>`)
  ].join('');
  return `
    <div class="toolbar">
      <div class="toolbar-left">
        <label class="field">
          <span class="field-label">章节筛选</span>
          <span class="select-wrap">
            <select class="select" id="practice-filter" aria-label="选择刷题章节">${options}</select>
          </span>
        </label>
        <div class="field">
          <span class="field-label">出题顺序</span>
          <div class="segmented" role="group" aria-label="出题顺序">
            <button type="button" class="seg-btn ${session.order === 'seq' ? 'is-active' : ''}" data-action="practice-order" data-order="seq">${icon('list')} 顺序</button>
            <button type="button" class="seg-btn ${session.order === 'random' ? 'is-active' : ''}" data-action="practice-order" data-order="random">${icon('shuffle')} 乱序</button>
          </div>
        </div>
      </div>
      <div class="toolbar-right">
        <div class="toolbar-progress">已答 <strong>${stats.answered}</strong> / ${stats.total}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="practice-reset">${icon('refresh')} 重新开始</button>
      </div>
    </div>`;
}

function practiceRailHTML(session) {
  const stats = practiceStats(session);
  const pct = stats.total ? Math.round((stats.answered / stats.total) * 100) : 0;
  return `
    <aside class="quiz-rail">
      <div class="rail-card rail-ring">
        <div class="rail-title">本轮进度 <span>${stats.answered} / ${stats.total}</span></div>
        ${ringSVG(pct, { label: '完成度', size: 104 })}
        <div class="rail-stats">
          <div class="rail-stat green"><strong>${stats.correct}</strong><span>答对</span></div>
          <div class="rail-stat red"><strong>${stats.wrong}</strong><span>答错</span></div>
          <div class="rail-stat"><strong>${stats.skipped}</strong><span>未作答</span></div>
          <div class="rail-stat"><strong>${stats.accuracy}%</strong><span>本轮正确率</span></div>
        </div>
      </div>
      <div class="rail-card">
        <div class="rail-title">快捷操作 <span>KEYBOARD</span></div>
        <div class="keyboard-hint">
          <div><span class="key-hint">A</span><span class="key-hint">B</span><span class="key-hint">C</span><span class="key-hint">D</span><span>或数字 1–4 选择</span></div>
          <div><span class="key-hint">Enter</span><span>提交 / 下一题</span></div>
          <div><span class="key-hint">←</span><span class="key-hint">→</span><span>切换上一题 / 下一题</span></div>
        </div>
        <div class="rail-note">${session.custom ? '错题重做中，答错的题目会继续保留在错题本。' : '答错的题会自动加入错题本，可随时重做。'}</div>
      </div>
    </aside>`;
}

function renderPracticeQuestion(session, q) {
  const index = session.index;
  const total = session.ids.length;
  const answered = session.answers[q.id];
  const selected = answered ? answered.selected : (session.selected[q.id] || '');
  const isAnswered = Boolean(answered);
  const isLast = index === total - 1;
  const options = q.options.map((_, optionIndex) => {
    const letter = LETTERS[optionIndex];
    return renderAnswerOption(q, letter, {
      selected,
      answered: isAnswered,
      action: 'practice-option',
      mode: 'practice'
    });
  }).join('');

  const hint = isAnswered
    ? (answered.correct ? '回答正确，解析已展开。' : `回答错误，正确答案是 ${esc(answerDisplay(q))}。`)
    : q.type === 'multiple'
      ? '多选题 · 请选出所有正确选项后提交'
      : '单选题 · 请选出唯一正确选项后提交';

  return `
    <section class="quiz-card" aria-labelledby="practice-stem">
      <div class="q-meta">
        <span class="q-index">第 ${index + 1} 题 <small>/ ${total}</small></span>
        <span class="chip chip-teal">${esc(q.category)}</span>
        <span class="type-chip ${typeClass(q)}">${typeLabel(q)}</span>
        <span class="q-source">NO. ${esc(q.id)}</span>
      </div>
      <h2 class="q-stem" id="practice-stem">${esc(q.question)}</h2>
      <div class="q-hint">${hint}${!isAnswered && q.type === 'multiple' ? ' · <span id="selected-count">已选 ' + (selected ? selected.length : 0) + ' 项</span>' : ''}</div>
      <div class="options" role="group" aria-label="选项">${options}</div>
      <div class="quiz-actions">
        <div class="quiz-actions-left">
          <button type="button" class="btn btn-ghost btn-prev" data-action="practice-prev" ${index === 0 ? 'disabled' : ''}>${icon('arrow-left')} 上一题</button>
        </div>
        <div class="quiz-actions-right">
          ${isAnswered
            ? `<button type="button" class="btn btn-primary btn-next" data-action="practice-next">${isLast ? '查看本轮结果' : '下一题'} ${icon('arrow-right')}</button>`
            : `<button type="button" class="btn btn-ghost" data-action="practice-skip">跳过</button>
               <button type="button" class="btn btn-primary" id="practice-submit" data-action="practice-submit" ${selected ? '' : 'disabled'}>提交答案 ${icon('check')}</button>`}
        </div>
      </div>
      ${isAnswered ? explanationHTML(q, answered.selected, answered.correct, { practice: true }) : ''}
    </section>`;
}

function renderPracticeCompletion(session) {
  const stats = practiceStats(session);
  const wrongIndexes = [];
  const skippedIndexes = [];
  session.ids.forEach((id, index) => {
    const answer = session.answers[id];
    if (!answer) skippedIndexes.push(index);
    else if (!answer.correct) wrongIndexes.push(index);
  });
  const wrongChips = wrongIndexes.map((index) => `<button type="button" class="sheet-num is-answered" data-action="practice-jump" data-index="${index}" title="第 ${index + 1} 题">${index + 1}</button>`).join('');
  const skippedChips = skippedIndexes.map((index) => `<button type="button" class="sheet-num" data-action="practice-jump" data-index="${index}" title="第 ${index + 1} 题">${index + 1}</button>`).join('');

  return `
    <div class="completion-wrap">
      <section class="completion-card">
        <div class="completion-badge">${icon(stats.accuracy >= 90 ? 'trophy' : 'check-circle')}</div>
        <h2>${stats.accuracy === 100 ? '全对，漂亮！' : '本轮完成'}</h2>
        <p>${stats.skipped ? `还有 ${stats.skipped} 道题没有作答，可以回到未答题继续。` : '这一轮的题目都看过了，去错题本巩固一下，或者开始下一轮。'}</p>
        <div class="completion-ring">${ringSVG(stats.accuracy, { label: '本轮正确率', size: 142 })}</div>
        <div class="completion-stats">
          <div><strong>${stats.answered}</strong><span>已作答</span></div>
          <div><strong>${stats.correct}</strong><span>答对</span></div>
          <div><strong>${stats.wrong}</strong><span>答错</span></div>
        </div>
        <div class="completion-actions">
          ${stats.skipped ? `<button type="button" class="btn btn-primary" data-action="practice-first-unanswered">${icon('arrow-right')} 回到未答</button>` : ''}
          <button type="button" class="btn btn-ghost" data-action="practice-reset">${icon('refresh')} 再来一轮</button>
          <a class="btn btn-ghost" href="#/wrong" ${session.custom ? 'data-action="practice-exit-custom"' : ''}>${icon('bookmark')} 复习错题</a>
        </div>
      </section>
      <aside class="quiz-rail">
        <div class="rail-card">
          <div class="rail-title">本轮概览 <span>${stats.total} 题</span></div>
          <div class="rail-stats">
            <div class="rail-stat green"><strong>${stats.correct}</strong><span>答对</span></div>
            <div class="rail-stat red"><strong>${stats.wrong}</strong><span>答错</span></div>
            <div class="rail-stat"><strong>${stats.skipped}</strong><span>未作答</span></div>
            <div class="rail-stat"><strong>${stats.accuracy}%</strong><span>正确率</span></div>
          </div>
        </div>
        ${wrongChips || skippedChips ? `<div class="rail-card">
          <div class="rail-title">需要再看 <span>点击跳题</span></div>
          ${wrongChips ? `<div class="rail-title" style="margin:4px 0 7px;font-size:10px;color:var(--red)">答错</div><div class="sheet-grid">${wrongChips}</div>` : ''}
          ${skippedChips ? `<div class="rail-title" style="margin:13px 0 7px;font-size:10px;color:var(--faint)">未作答</div><div class="sheet-grid">${skippedChips}</div>` : ''}
        </div>` : ''}
      </aside>
    </div>`;
}

function renderPractice() {
  let session = currentPracticeSession();
  if (!session) {
    session = ensurePracticeSession(state.practice.lastFilter, state.practice.lastOrder);
  }
  const title = session.custom ? (session.title || '错题重做') : '刷题模式';
  const sub = session.custom
    ? '集中重做错题，答对后可移出错题本。'
    : '按顺序或乱序练习，提交后即时判题，答错自动归档。';
  const actions = session.custom
    ? `<a class="btn btn-ghost btn-sm" href="#/wrong" data-action="practice-exit-custom">${icon('log-out')} 退出重做</a>`
    : `<a class="btn btn-ghost btn-sm" href="#/wrong">${icon('bookmark')} 错题本</a>`;
  const head = pageHead('PRACTICE · 逐题击破', title, sub, actions);

  if (!session.ids.length) {
    return `${head}
      <div class="empty-state" style="border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface)">
        <div class="empty-icon">${icon('layers')}</div>
        <h3>这个章节还没有题目</h3>
        <p>换一个章节，或者回到全部题库开始练习。</p>
        <button type="button" class="btn btn-primary" data-action="practice-all">${icon('arrow-right')} 练习全部题库</button>
      </div>`;
  }

  if (session.index >= session.ids.length) {
    return `${head}${renderPracticeCompletion(session)}`;
  }

  let q = BANK_MAP.get(session.ids[session.index]);
  if (!q) {
    session.index = clamp(session.index, 0, session.ids.length - 1);
    q = BANK_MAP.get(session.ids[session.index]);
  }
  if (!q) {
    return `${head}<div class="empty-state"><h3>题目加载失败</h3><p>请刷新页面重试。</p></div>`;
  }

  return `
    ${head}
    ${practiceToolbarHTML(session)}
    <div class="quiz-layout">
      ${renderPracticeQuestion(session, q)}
      ${practiceRailHTML(session)}
    </div>`;
}

function syncPracticeSelection() {
  const session = currentPracticeSession();
  if (!session || session.index >= session.ids.length) return;
  const q = BANK_MAP.get(session.ids[session.index]);
  if (!q || session.answers[q.id]) return;
  const selected = session.selected[q.id] || '';
  $$('.option[data-action="practice-option"]').forEach((button) => {
    const letter = button.dataset.letter;
    const active = selected.includes(letter);
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const submit = $('#practice-submit');
  if (submit) submit.disabled = !selected;
  const count = $('#selected-count');
  if (count) {
    count.textContent = q.type === 'multiple' ? `已选 ${selected.length} 项` : (selected ? `已选择 ${selected}` : '未选择');
  }
}

function togglePracticeOption(letter) {
  const session = currentPracticeSession();
  if (!session || session.index >= session.ids.length) return;
  const q = BANK_MAP.get(session.ids[session.index]);
  if (!q || session.answers[q.id]) return;
  if (letter.charCodeAt(0) - 65 >= q.options.length) return;
  const current = session.selected[q.id] || '';
  if (q.type === 'multiple') {
    const set = new Set(current.split(''));
    if (set.has(letter)) set.delete(letter);
    else set.add(letter);
    session.selected[q.id] = Array.from(set).sort().join('');
  } else {
    session.selected[q.id] = letter;
  }
  saveState();
  syncPracticeSelection();
}

function submitPractice() {
  const session = currentPracticeSession();
  if (!session || session.index >= session.ids.length) return;
  const q = BANK_MAP.get(session.ids[session.index]);
  if (!q || session.answers[q.id]) return;
  const selected = session.selected[q.id] || '';
  if (!selected) {
    toast('请先选择一个答案。', 'warn');
    return;
  }
  const correct = selected === q.answer;
  session.answers[q.id] = { selected, correct, at: Date.now() };
  delete session.selected[q.id];
  recordAttempt(q, selected, correct, session.custom ? 'wrong' : 'practice');
  saveState(true);
  render();
  requestAnimationFrame(() => {
    const box = $('.explain-box');
    if (box) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function movePractice(delta) {
  const session = currentPracticeSession();
  if (!session) return;
  const next = clamp(session.index + delta, 0, session.ids.length);
  if (next === session.index) return;
  session.index = next;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function jumpPractice(index) {
  const session = currentPracticeSession();
  if (!session) return;
  const target = clampInt(index, 0, session.ids.length - 1);
  session.index = target;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function firstUnansweredPractice() {
  const session = currentPracticeSession();
  if (!session) return;
  const index = session.ids.findIndex((id) => !session.answers[id]);
  if (index === -1) {
    toast('所有题目都已作答。');
    return;
  }
  jumpPractice(index);
}

function requestResetPractice() {
  const session = currentPracticeSession();
  if (!session) return;
  const hasProgress = Object.keys(session.answers).length > 0 || Object.keys(session.selected).length > 0;
  if (!hasProgress) {
    resetPracticeNow();
    return;
  }
  openModal({
    title: '重新开始本轮？',
    subtitle: session.custom ? '错题重做进度' : '当前练习进度',
    body: `<p>本轮的作答记录和位置会被清空，学习统计与错题本不会受到影响。</p>`,
    actions: [
      { label: '取消', action: 'modal-close', variant: 'btn-ghost' },
      { label: '重新开始', action: 'practice-reset-confirm', variant: 'btn-danger' }
    ]
  });
}

function resetPracticeNow() {
  const session = currentPracticeSession();
  if (!session) return;
  if (session.custom) {
    session.ids = session.ids.slice();
    session.index = 0;
    session.answers = {};
    session.selected = {};
    session.startedAt = Date.now();
  } else {
    session.ids = makePracticeIds(session.filter || state.practice.lastFilter, session.order || state.practice.lastOrder);
    session.index = 0;
    session.answers = {};
    session.selected = {};
    session.startedAt = Date.now();
  }
  saveState(true);
  closeModal();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('已重新开始本轮练习。');
}

function changePracticeFilter(filter) {
  const session = currentPracticeSession();
  if (session && session.custom) {
    state.practice.currentKey = null;
  }
  state.practice.lastFilter = filter === 'all' || BANK_BY_CATEGORY.has(filter) ? filter : 'all';
  ensurePracticeSession(state.practice.lastFilter, state.practice.lastOrder);
  render();
}

function changePracticeOrder(order) {
  const session = currentPracticeSession();
  if (session && session.custom) {
    state.practice.currentKey = null;
  }
  state.practice.lastOrder = order === 'random' ? 'random' : 'seq';
  ensurePracticeSession(state.practice.lastFilter, state.practice.lastOrder);
  render();
}

function startPracticeForCategory(category) {
  state.practice.lastFilter = category === 'all' || BANK_BY_CATEGORY.has(category) ? category : 'all';
  ensurePracticeSession(state.practice.lastFilter, state.practice.lastOrder);
  navigate('practice');
}

function leaveCustomPractice() {
  const session = currentPracticeSession();
  if (session && session.custom && state.practice.currentKey) {
    delete state.practice.sessions[state.practice.currentKey];
  }
  const normalKey = `${state.practice.lastFilter}::${state.practice.lastOrder}`;
  state.practice.currentKey = state.practice.sessions[normalKey] ? normalKey : null;
  saveState();
  navigate('wrong');
}

/* ============================================================
   7. 背题模式
   ============================================================ */
function studyPool() {
  return categoryPreview(state.study.filter);
}

function renderStudy() {
  const pool = studyPool();
  const head = pageHead(
    'READ · 先想再看',
    '背题模式',
    '题目、答案与解析同屏阅读，适合考前快速过一遍。',
    `<a class="btn btn-ghost btn-sm" href="#/stats">${icon('chart')} 学习统计</a>`
  );
  if (!pool.length) {
    return `${head}<div class="empty-state" style="background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg)">
      <div class="empty-icon">${icon('book')}</div><h3>这个章节还没有题目</h3><p>换一个章节继续浏览。</p>
    </div>`;
  }
  const index = clampInt(state.study.index, 0, pool.length - 1);
  state.study.index = index;
  const q = pool[index];
  const show = Boolean(state.study.showAnswer);
  const options = q.options.map((_, optionIndex) => {
    const letter = LETTERS[optionIndex];
    return renderAnswerOption(q, letter, {
      selected: '',
      answered: show,
      mode: 'study'
    });
  }).join('');

  const answerBlock = show
    ? `<div class="study-answer">
        <div class="study-answer-head">
          <span class="label">正确答案</span>
          <strong>${esc(answerDisplay(q))}</strong>
          <span class="answer-text">正确选项已在上方标绿</span>
        </div>
        <div class="explain-box">
          <div class="explain-head">
            <span class="explain-status">${icon('info')} 答案解析</span>
            <span class="explain-status-badge">${typeLabel(q)}</span>
          </div>
          <div class="explain-text">${esc(explanationBody(q))}</div>
          <div class="auto-note">${icon('info')}解析依据标准答案整理，可在题库数据中替换为详细解析</div>
        </div>
      </div>`
    : `<div class="study-reveal">
        <div class="reveal-eye">${icon('eye')}</div>
        <h3>答案已隐藏</h3>
        <p>先在心里回忆一下，再显示答案对照。也可以用空格键切换。</p>
        <button type="button" class="btn btn-primary" data-action="study-toggle">${icon('eye')} 显示答案</button>
      </div>`;

  const toolbar = `
    <div class="study-toolbar">
      <div class="study-toolbar-left">
        <span class="select-wrap">
          <select class="select" id="study-filter" aria-label="选择背题章节">
            <option value="all" ${state.study.filter === 'all' ? 'selected' : ''}>全部章节 · ${BANK.length} 题</option>
            ${CHAPTERS.map((chapter) => `<option value="${esc(chapter.name)}" ${state.study.filter === chapter.name ? 'selected' : ''}>${esc(chapter.name)} · ${chapter.count} 题</option>`).join('')}
          </select>
        </span>
        <div class="toolbar-progress"><strong>${index + 1}</strong> / ${pool.length}</div>
      </div>
      <div class="study-toolbar-right">
        <button type="button" class="toggle-pill ${show ? 'is-on' : ''}" data-action="study-toggle">
          ${icon(show ? 'eye-off' : 'eye')} ${show ? '隐藏答案' : '显示答案'}
        </button>
      </div>
    </div>`;

  return `
    <div class="study-wrap">
      ${head}
      ${toolbar}
      <article class="study-card">
        <div class="q-meta">
          <span class="q-index">第 ${index + 1} 题 <small>/ ${pool.length}</small></span>
          <span class="chip chip-teal">${esc(q.category)}</span>
          <span class="type-chip ${typeClass(q)}">${typeLabel(q)}</span>
          <span class="q-source">NO. ${esc(q.id)}</span>
        </div>
        <h2 class="q-stem">${esc(q.question)}</h2>
        <div class="options study-options" role="list">${options}</div>
        ${answerBlock}
        <div class="quiz-actions">
          <div class="quiz-actions-left">
            <button type="button" class="btn btn-ghost btn-prev" data-action="study-prev" ${index === 0 ? 'disabled' : ''}>${icon('arrow-left')} 上一题</button>
          </div>
          <div class="quiz-actions-right">
            <button type="button" class="btn btn-primary btn-next" data-action="study-next" ${index === pool.length - 1 ? 'disabled' : ''}>下一题 ${icon('arrow-right')}</button>
          </div>
        </div>
      </article>
    </div>`;
}

function toggleStudyAnswer() {
  state.study.showAnswer = !state.study.showAnswer;
  saveState();
  render();
}

function moveStudy(delta) {
  const pool = studyPool();
  if (!pool.length) return;
  const next = clamp(state.study.index + delta, 0, pool.length - 1);
  if (next === state.study.index) return;
  state.study.index = next;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function changeStudyFilter(filter) {
  state.study.filter = filter === 'all' || BANK_BY_CATEGORY.has(filter) ? filter : 'all';
  state.study.index = 0;
  saveState();
  render();
}

/* ============================================================
   8. 模拟考试：设置 / 进行 / 判分 / 回顾
   ============================================================ */
function normalizeExamSettings() {
  const settings = state.exam.settings;
  const available = availableForScope(settings.scope);
  settings.singles = clampInt(settings.singles, 0, available.singles);
  settings.multis = clampInt(settings.multis, 0, available.multis);
  settings.minutes = clampInt(settings.minutes, 1, 180);
  return settings;
}

function scopeLabel(scope) {
  return scope === 'all' ? '全部题库' : scope;
}

function renderExamSetup() {
  const settings = normalizeExamSettings();
  const available = availableForScope(settings.scope);
  const total = settings.singles + settings.multis;
  const passMark = Math.ceil(total * PASS_RATE);
  const isStandard = settings.singles === 32 && settings.multis === 8 && settings.minutes === 40;
  const isQuick = settings.singles === 16 && settings.multis === 4 && settings.minutes === 20;
  const isSprint = settings.singles === 24 && settings.multis === 6 && settings.minutes === 30;
  const history = state.exam.history.slice(0, 3);

  const scopeOptions = [
    `<option value="all" ${settings.scope === 'all' ? 'selected' : ''}>全部题库 · ${BANK.length} 题</option>`,
    ...CHAPTERS.map((chapter) => `<option value="${esc(chapter.name)}" ${settings.scope === chapter.name ? 'selected' : ''}>${esc(chapter.name)} · ${chapter.count} 题</option>`)
  ].join('');

  const historyHTML = history.length
    ? `<div class="exam-history-mini">
        <h3>${icon('clock')} 最近模考</h3>
        ${history.map((item) => `
          <div class="history-row">
            <span class="date">${formatDate(item.at, false)}</span>
            <span class="score">${item.correct} / ${item.total}</span>
            <span class="badge ${item.passed ? 'badge-pass' : 'badge-fail'}">${item.passed ? '合格' : '未合格'}</span>
            <span class="spacer"></span>
            <span class="text-faint">${formatUsedTime(item.usedSec)}</span>
          </div>`).join('')}
      </div>`
    : '';

  return `
    ${pageHead(
      'EXAM · 全真演练',
      '模拟考试',
      '从题库中随机抽题并打乱顺序，考试过程中不显示对错与解析。',
      `<a class="btn btn-ghost btn-sm" href="#/stats">${icon('chart')} 历史成绩</a>`
    )}

    <div class="exam-setup-grid">
      <section class="panel setup-card">
        <div class="setup-section">
          <div class="setup-section-head">
            <h3>${icon('target')} 抽题范围</h3>
            <span>默认全部题库</span>
          </div>
          <div class="field scope-select">
            <span class="select-wrap">
              <select class="select" id="exam-scope" aria-label="选择考试抽题范围">${scopeOptions}</select>
            </span>
            <div class="exam-field-hint">
              <span>当前范围可用：单选 <b id="exam-avail-single">${available.singles}</b> 道 · 多选 <b id="exam-avail-multi">${available.multis}</b> 道</span>
            </div>
          </div>
        </div>

        <div class="setup-section">
          <div class="setup-section-head">
            <h3>${icon('shuffle')} 抽题配置</h3>
            <span>随机抽取，按抽出的顺序作答</span>
          </div>
          <div class="preset-row" role="group" aria-label="快捷配置">
            <button type="button" class="preset-btn ${isStandard ? 'is-active' : ''}" data-action="exam-preset" data-preset="standard">标准模考 40 题</button>
            <button type="button" class="preset-btn ${isQuick ? 'is-active' : ''}" data-action="exam-preset" data-preset="quick">快速自测 20 题</button>
            <button type="button" class="preset-btn ${isSprint ? 'is-active' : ''}" data-action="exam-preset" data-preset="sprint">考前冲刺 30 题</button>
          </div>
          <div class="exam-fields">
            <div class="exam-field">
              <div class="field-label"><span>单选题</span><span class="field-hint">最多 ${available.singles} 道</span></div>
              <div class="stepper">
                <button type="button" class="step-btn" data-action="exam-step" data-field="singles" data-step="-1" aria-label="减少单选题">−</button>
                <input type="number" id="exam-singles" data-exam-field="singles" min="0" max="${available.singles}" value="${settings.singles}" inputmode="numeric" aria-label="单选题数量">
                <button type="button" class="step-btn" data-action="exam-step" data-field="singles" data-step="1" aria-label="增加单选题">+</button>
              </div>
              <div class="exam-field-hint"><span>默认 32 道</span><span id="exam-single-max">/ ${available.singles}</span></div>
            </div>
            <div class="exam-field">
              <div class="field-label"><span>多选题</span><span class="field-hint">最多 ${available.multis} 道</span></div>
              <div class="stepper">
                <button type="button" class="step-btn" data-action="exam-step" data-field="multis" data-step="-1" aria-label="减少多选题">−</button>
                <input type="number" id="exam-multis" data-exam-field="multis" min="0" max="${available.multis}" value="${settings.multis}" inputmode="numeric" aria-label="多选题数量">
                <button type="button" class="step-btn" data-action="exam-step" data-field="multis" data-step="1" aria-label="增加多选题">+</button>
              </div>
              <div class="exam-field-hint"><span>默认 8 道</span><span id="exam-multi-max">/ ${available.multis}</span></div>
            </div>
          </div>
        </div>

        <div class="setup-section">
          <div class="setup-section-head">
            <h3>${icon('clock')} 考试时长</h3>
            <span>倒计时结束将自动交卷</span>
          </div>
          <div class="duration-row">
            <div class="stepper">
              <button type="button" class="step-btn" data-action="exam-step" data-field="minutes" data-step="-5" aria-label="减少五分钟">−</button>
              <input type="number" id="exam-minutes" data-exam-field="minutes" min="1" max="180" value="${settings.minutes}" inputmode="numeric" aria-label="考试时长分钟">
              <button type="button" class="step-btn" data-action="exam-step" data-field="minutes" data-step="5" aria-label="增加五分钟">+</button>
            </div>
            <span class="duration-unit">分钟</span>
            <div class="duration-presets">
              <button type="button" data-action="exam-minutes" data-minutes="20">20</button>
              <button type="button" data-action="exam-minutes" data-minutes="40">40</button>
              <button type="button" data-action="exam-minutes" data-minutes="60">60</button>
            </div>
          </div>
        </div>

        <div class="setup-start-row">
          <button type="button" class="btn btn-primary btn-lg" id="exam-start" data-action="exam-start" ${total ? '' : 'disabled'}>
            ${icon('play')} 开始考试
          </button>
          <div class="setup-start-note">开始后立即计时。中途离开页面，计时仍会继续。</div>
        </div>
      </section>

      <aside class="exam-summary">
        <div class="summary-eyebrow">Exam Summary</div>
        <div class="summary-total"><strong id="summary-total">${total}</strong><span>题</span></div>
        <div class="summary-pass">${icon('target')} 合格线 <span id="summary-pass">${passMark}</span> 题 · 75%</div>
        <div class="summary-list">
          <div class="summary-row"><span>单选题</span><strong id="summary-single">${settings.singles}</strong></div>
          <div class="summary-row"><span>多选题</span><strong id="summary-multi">${settings.multis}</strong></div>
          <div class="summary-row"><span>考试时长</span><strong><span id="summary-minutes">${settings.minutes}</span> 分钟</strong></div>
          <div class="summary-row"><span>抽题范围</span><strong id="summary-scope">${esc(scopeLabel(settings.scope))}</strong></div>
          <div class="summary-row"><span>满分</span><strong id="summary-full">${total} 题</strong></div>
        </div>
        <div class="summary-note">${icon('info')} 交卷后自动判分，逐题展示你的作答、正确答案与解析。</div>
      </aside>
    </div>

    <div class="exam-rules">
      <div class="rule-card">
        <div>${icon('shuffle')}</div>
        <h4>随机抽题</h4>
        <p>单选、多选分别抽取，合并后再次打乱顺序。同一道题不会重复出现。</p>
      </div>
      <div class="rule-card">
        <div>${icon('clock')}</div>
        <h4>限时作答</h4>
        <p>考试中不显示对错。剩余 5 分钟时计时器变色提醒，时间到自动交卷。</p>
      </div>
      <div class="rule-card">
        <div>${icon('target')}</div>
        <h4>合格标准</h4>
        <p>每题 1 分，答对得 1 分。默认 40 题答对 30 题合格，正确率需达到 75%。</p>
      </div>
    </div>

    ${historyHTML ? `<div class="panel" style="padding:18px 20px;margin-top:16px">${historyHTML}</div>` : ''}`;
}

function updateExamSummary(writeBack = false) {
  const singlesInput = $('#exam-singles');
  const multisInput = $('#exam-multis');
  const minutesInput = $('#exam-minutes');
  const scopeInput = $('#exam-scope');
  if (!singlesInput || !multisInput || !minutesInput || !scopeInput) return;

  const scope = scopeInput.value === 'all' || BANK_BY_CATEGORY.has(scopeInput.value) ? scopeInput.value : 'all';
  const available = availableForScope(scope);
  const singles = clampInt(singlesInput.value, 0, available.singles);
  const multis = clampInt(multisInput.value, 0, available.multis);
  const minutes = clampInt(minutesInput.value, 1, 180);
  const total = singles + multis;
  const passMark = Math.ceil(total * PASS_RATE);

  state.exam.settings.scope = scope;
  state.exam.settings.singles = singles;
  state.exam.settings.multis = multis;
  state.exam.settings.minutes = minutes;

  if (writeBack) {
    singlesInput.value = String(singles);
    multisInput.value = String(multis);
    minutesInput.value = String(minutes);
    singlesInput.max = String(available.singles);
    multisInput.max = String(available.multis);
  }

  const summaryTotal = $('#summary-total');
  if (summaryTotal) summaryTotal.textContent = String(total);
  const summaryPass = $('#summary-pass');
  if (summaryPass) summaryPass.textContent = String(passMark);
  const summarySingle = $('#summary-single');
  if (summarySingle) summarySingle.textContent = String(singles);
  const summaryMulti = $('#summary-multi');
  if (summaryMulti) summaryMulti.textContent = String(multis);
  const summaryMinutes = $('#summary-minutes');
  if (summaryMinutes) summaryMinutes.textContent = String(minutes);
  const summaryScope = $('#summary-scope');
  if (summaryScope) summaryScope.textContent = scopeLabel(scope);
  const summaryFull = $('#summary-full');
  if (summaryFull) summaryFull.textContent = `${total} 题`;
  const availSingle = $('#exam-avail-single');
  if (availSingle) availSingle.textContent = String(available.singles);
  const availMulti = $('#exam-avail-multi');
  if (availMulti) availMulti.textContent = String(available.multis);
  const singleMax = $('#exam-single-max');
  if (singleMax) singleMax.textContent = `/ ${available.singles}`;
  const multiMax = $('#exam-multi-max');
  if (multiMax) multiMax.textContent = `/ ${available.multis}`;
  const start = $('#exam-start');
  if (start) start.disabled = total === 0;

  $$('.preset-btn[data-preset]').forEach((button) => {
    const preset = button.dataset.preset;
    const match =
      (preset === 'standard' && singles === 32 && multis === 8 && minutes === 40) ||
      (preset === 'quick' && singles === 16 && multis === 4 && minutes === 20) ||
      (preset === 'sprint' && singles === 24 && multis === 6 && minutes === 30);
    button.classList.toggle('is-active', match);
  });

  saveState();
}

function normalizeExamInputs() {
  updateExamSummary(true);
}

function stepExamField(field, delta) {
  const input = field === 'minutes' ? $('#exam-minutes') : field === 'multis' ? $('#exam-multis') : $('#exam-singles');
  if (!input) return;
  const max = field === 'minutes' ? 180 : clampInt(input.max, 0, 999);
  const min = field === 'minutes' ? 1 : 0;
  input.value = String(clampInt(Number(input.value) + delta, min, max));
  updateExamSummary(true);
}

function applyExamPreset(preset) {
  const presets = {
    standard: { singles: 32, multis: 8, minutes: 40 },
    quick: { singles: 16, multis: 4, minutes: 20 },
    sprint: { singles: 24, multis: 6, minutes: 30 }
  };
  const value = presets[preset];
  if (!value) return;
  const scope = $('#exam-scope')?.value || 'all';
  const available = availableForScope(scope);
  const singles = $('#exam-singles');
  const multis = $('#exam-multis');
  const minutes = $('#exam-minutes');
  if (singles) singles.value = String(clampInt(value.singles, 0, available.singles));
  if (multis) multis.value = String(clampInt(value.multis, 0, available.multis));
  if (minutes) minutes.value = String(value.minutes);
  updateExamSummary(true);
}

function setExamMinutes(minutes) {
  const input = $('#exam-minutes');
  if (!input) return;
  input.value = String(clampInt(minutes, 1, 180));
  updateExamSummary(true);
}

function handleExamScopeChange() {
  const scopeInput = $('#exam-scope');
  if (!scopeInput) return;
  const available = availableForScope(scopeInput.value);
  const singles = $('#exam-singles');
  const multis = $('#exam-multis');
  if (singles) {
    singles.max = String(available.singles);
    singles.value = String(clampInt(singles.value, 0, available.singles));
  }
  if (multis) {
    multis.max = String(available.multis);
    multis.value = String(clampInt(multis.value, 0, available.multis));
  }
  updateExamSummary(true);
}

function startExamFromForm() {
  normalizeExamInputs();
  startExam({ ...state.exam.settings });
}

function startExam(settings) {
  if (state.exam.active) {
    toast('已有一场考试正在进行。', 'warn');
    return;
  }
  const scope = settings.scope === 'all' || BANK_BY_CATEGORY.has(settings.scope) ? settings.scope : 'all';
  const available = availableForScope(scope);
  const singlesCount = clampInt(settings.singles, 0, available.singles);
  const multisCount = clampInt(settings.multis, 0, available.multis);
  const minutes = clampInt(settings.minutes, 1, 180);
  const total = singlesCount + multisCount;
  if (!total) {
    toast('请至少抽取一道题。', 'error');
    return;
  }

  const pool = scopePool(scope);
  const singlePool = pool.filter((q) => q.type === 'single' || q.type === 'judge').map((q) => q.id);
  const multiPool = pool.filter((q) => q.type === 'multiple').map((q) => q.id);
  const ids = shuffle([
    ...pickRandom(singlePool, singlesCount),
    ...pickRandom(multiPool, multisCount)
  ]);

  if (ids.length < total) {
    toast('当前范围题目不足，已按实际可用数量调整。', 'warn');
  }

  const now = Date.now();
  const passMark = Math.ceil(ids.length * PASS_RATE);
  state.exam.settings = {
    singles: Math.min(singlesCount, singlePool.length),
    multis: Math.min(multisCount, multiPool.length),
    minutes,
    scope
  };
  state.exam.active = {
    id: `exam-${now}`,
    createdAt: now,
    endAt: now + minutes * 60 * 1000,
    durationSec: minutes * 60,
    questions: ids,
    answers: {},
    index: 0,
    settings: {
      ...state.exam.settings,
      total: ids.length,
      passMark
    },
    warned5: false
  };
  state.exam.lastResult = null;
  saveState(true);
  closeModal();
  if (currentView === 'exam') render();
  else navigate('exam');
  window.scrollTo({ top: 0, behavior: 'auto' });
  startExamTicker();
}

function renderExamLive() {
  const active = state.exam.active;
  if (!active) return renderExamSetup();
  if (active.index >= active.questions.length) active.index = active.questions.length - 1;
  const q = BANK_MAP.get(active.questions[active.index]);
  if (!q) {
    return `<div class="empty-state"><h3>考试题目加载失败</h3><p>请刷新页面，已保存的作答不会丢失。</p></div>`;
  }
  const total = active.questions.length;
  const answered = examAnsweredCount(active);
  const remaining = examRemaining(active);
  const urgent = remaining <= 300;
  const selected = active.answers[q.id] || '';
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const isLast = active.index === total - 1;

  const options = q.options.map((_, optionIndex) => {
    const letter = LETTERS[optionIndex];
    return renderAnswerOption(q, letter, {
      selected,
      answered: false,
      action: 'exam-option',
      mode: 'practice'
    });
  }).join('');

  const sheet = active.questions.map((id, index) => {
    const isAnswered = Boolean(active.answers[id]);
    const isCurrent = index === active.index;
    return `<button type="button" class="sheet-num ${isAnswered ? 'is-answered' : ''} ${isCurrent ? 'is-current' : ''}"
      data-action="exam-jump" data-index="${index}" data-qid="${esc(id)}" aria-label="第 ${index + 1} 题${isAnswered ? '，已作答' : '，未作答'}">${index + 1}</button>`;
  }).join('');

  return `
    <div class="exam-bar">
      <div class="exam-bar-left">
        <span class="live-dot"></span>
        <div class="exam-bar-label">
          <strong>模拟考试进行中</strong>
          <span>第 ${active.index + 1} / ${total} 题 · 已答 <b data-exam-answered>${answered}</b> 题</span>
        </div>
      </div>
      <div class="exam-clock ${urgent ? 'is-urgent' : ''}">
        ${icon('timer')}
        <span data-exam-clock>${formatClock(remaining)}</span>
      </div>
      <div class="exam-bar-right">
        <button type="button" class="btn btn-ghost-dark" data-action="exam-sheet">${icon('list')} 答题卡 ${answered}/${total}</button>
        <button type="button" class="btn btn-light btn-sm" data-action="exam-submit">交卷</button>
      </div>
    </div>
    <div class="exam-progress"><span data-exam-progress style="width:${pct}%"></span></div>

    <div class="exam-layout">
      <section class="exam-card" aria-labelledby="exam-stem">
        <div class="q-meta">
          <span class="q-index">第 ${active.index + 1} 题 <small>/ ${total}</small></span>
          <span class="chip chip-teal">${esc(q.category)}</span>
          <span class="type-chip ${typeClass(q)}">${typeLabel(q)}</span>
          <span class="q-source">NO. ${esc(q.id)}</span>
        </div>
        <h2 class="q-stem" id="exam-stem">${esc(q.question)}</h2>
        <div class="q-hint">${q.type === 'multiple' ? '多选题 · 选择所有你认为正确的选项' : '单选题 · 选择唯一正确答案'} · 选项会自动保存</div>
        <div class="options" role="group" aria-label="选项">${options}</div>
        <div class="quiz-actions">
          <div class="quiz-actions-left">
            <button type="button" class="btn btn-ghost btn-prev" data-action="exam-prev" ${active.index === 0 ? 'disabled' : ''}>${icon('arrow-left')} 上一题</button>
          </div>
          <div class="quiz-actions-right">
            ${isLast
              ? `<button type="button" class="btn btn-primary" data-action="exam-submit">检查并交卷 ${icon('check')}</button>`
              : `<button type="button" class="btn btn-primary btn-next" data-action="exam-next">下一题 ${icon('arrow-right')}</button>`}
          </div>
        </div>
      </section>

      <aside class="exam-rail">
        <div class="answer-sheet">
          <div class="answer-sheet-head">
            <h3>答题卡</h3>
            <span><b data-exam-answered>${answered}</b> / ${total} 已答</span>
          </div>
          <div class="sheet-grid">${sheet}</div>
          <div class="sheet-legend">
            <span><i class="legend-dot current"></i>当前</span>
            <span><i class="legend-dot answered"></i>已答</span>
            <span><i class="legend-dot"></i>未答</span>
          </div>
          <button type="button" class="btn btn-primary" data-action="exam-submit">${icon('check')} 交卷并判分</button>
          <button type="button" class="abandon-btn" data-action="exam-abandon">放弃本次考试</button>
        </div>
        <div class="rail-card">
          <div class="rail-title">考试提示 <span>${urgent ? '时间紧张' : '保持节奏'}</span></div>
          <div class="keyboard-hint">
            <div><span class="key-hint">A</span><span class="key-hint">B</span><span class="key-hint">C</span><span class="key-hint">D</span><span>选择答案</span></div>
            <div><span class="key-hint">←</span><span class="key-hint">→</span><span>切换题目</span></div>
          </div>
          <div class="rail-note">考试中不显示对错与解析。时间到会自动交卷，未作答的题按错误计入成绩。</div>
        </div>
      </aside>
    </div>`;
}

function renderExam() {
  return state.exam.active ? renderExamLive() : renderExamSetup();
}

function syncExamSelection() {
  const active = state.exam.active;
  if (!active || active.index >= active.questions.length) return;
  const q = BANK_MAP.get(active.questions[active.index]);
  if (!q) return;
  const selected = active.answers[q.id] || '';
  $$('.option[data-action="exam-option"]').forEach((button) => {
    const letter = button.dataset.letter;
    const isSelected = selected.includes(letter);
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });
  const answered = examAnsweredCount(active);
  $$('[data-exam-answered]').forEach((node) => { node.textContent = String(answered); });
  $$('.sheet-num[data-qid]').forEach((button) => {
    button.classList.toggle('is-answered', Boolean(active.answers[button.dataset.qid]));
  });
  const progress = $('[data-exam-progress]');
  if (progress) progress.style.width = `${active.questions.length ? Math.round((answered / active.questions.length) * 100) : 0}%`;
  updateDocumentTitle();
}

function toggleExamOption(letter) {
  const active = state.exam.active;
  if (!active) return;
  if (examRemaining(active) <= 0) {
    finishExam(true);
    return;
  }
  if (active.index >= active.questions.length) return;
  const q = BANK_MAP.get(active.questions[active.index]);
  if (!q || letter.charCodeAt(0) - 65 >= q.options.length) return;
  const current = active.answers[q.id] || '';
  if (q.type === 'multiple') {
    const set = new Set(current.split(''));
    if (set.has(letter)) set.delete(letter);
    else set.add(letter);
    active.answers[q.id] = Array.from(set).sort().join('');
  } else {
    active.answers[q.id] = letter;
  }
  if (!active.answers[q.id]) delete active.answers[q.id];
  saveState();
  syncExamSelection();
}

function moveExam(delta) {
  const active = state.exam.active;
  if (!active) return;
  const next = clamp(active.index + delta, 0, active.questions.length - 1);
  if (next === active.index) return;
  active.index = next;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function jumpExam(index) {
  const active = state.exam.active;
  if (!active) return;
  active.index = clampInt(index, 0, active.questions.length - 1);
  saveState();
  closeModal();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openExamSheet() {
  const active = state.exam.active;
  if (!active) return;
  const answered = examAnsweredCount(active);
  const sheet = active.questions.map((id, index) => {
    const isAnswered = Boolean(active.answers[id]);
    const isCurrent = index === active.index;
    return `<button type="button" class="sheet-num ${isAnswered ? 'is-answered' : ''} ${isCurrent ? 'is-current' : ''}"
      data-action="exam-jump" data-index="${index}" data-qid="${esc(id)}">${index + 1}</button>`;
  }).join('');
  openModal({
    title: '答题卡',
    subtitle: `已答 ${answered} / ${active.questions.length} 题`,
    className: 'is-wide exam-sheet-modal',
    body: `
      <div class="exam-modal-summary">
        <span class="chip chip-teal">${icon('check')} 已答 ${answered}</span>
        <span class="chip">${icon('circle-dash')} 未答 ${active.questions.length - answered}</span>
      </div>
      <div class="sheet-grid">${sheet}</div>
      <div class="sheet-legend">
        <span><i class="legend-dot current"></i>当前</span>
        <span><i class="legend-dot answered"></i>已答</span>
        <span><i class="legend-dot"></i>未答</span>
      </div>`,
    actions: [
      { label: '继续答题', action: 'modal-close', variant: 'btn-ghost' },
      { label: '放弃考试', action: 'exam-abandon', variant: 'btn-danger' },
      { label: '交卷', action: 'exam-submit', variant: 'btn-primary' }
    ]
  });
}

function requestSubmitExam() {
  const active = state.exam.active;
  if (!active) return;
  const total = active.questions.length;
  const answered = examAnsweredCount(active);
  const unanswered = total - answered;
  openModal({
    title: '确认交卷？',
    subtitle: '交卷后立即判分',
    body: `
      <p>交卷后将不能再修改答案，并会逐题展示你的作答、正确答案与解析。</p>
      <div class="modal-info-grid">
        <div><strong>${total}</strong><span>总题数</span></div>
        <div><strong>${answered}</strong><span>已作答</span></div>
        <div><strong>${unanswered}</strong><span>未作答</span></div>
      </div>
      ${unanswered ? `<div class="modal-warning">${icon('alert')}还有 ${unanswered} 道题未作答，未作答的题目将按错误计入成绩。</div>` : `<div class="modal-warning">${icon('check-circle')}所有题目都已作答，可以交卷。</div>`}`,
    actions: [
      { label: '继续答题', action: 'modal-close', variant: 'btn-ghost' },
      { label: '确认交卷', action: 'exam-confirm-submit', variant: unanswered ? 'btn-danger-solid' : 'btn-primary' }
    ]
  });
}

function requestAbandonExam() {
  if (!state.exam.active) return;
  openModal({
    title: '放弃本次考试？',
    subtitle: '本次作答不会计入成绩',
    body: `<p>放弃后考试记录、作答和计时都会被清除，本次成绩不会进入学习统计。</p>`,
    actions: [
      { label: '继续考试', action: 'modal-close', variant: 'btn-ghost' },
      { label: '放弃考试', action: 'exam-confirm-abandon', variant: 'btn-danger' }
    ]
  });
}

function abandonExam() {
  state.exam.active = null;
  clearExamTicker();
  saveState(true);
  closeModal();
  if (currentView === 'exam') render();
  else navigate('exam');
  window.scrollTo({ top: 0, behavior: 'auto' });
  toast('已放弃本次考试。');
}

function finishExam(auto = false) {
  if (finishingExam) return;
  const active = state.exam.active;
  if (!active) return;
  finishingExam = true;

  const total = active.questions.length;
  const now = Date.now();
  const usedSec = clamp(Math.round((now - active.createdAt) / 1000), 0, active.durationSec);
  const details = active.questions.map((id) => {
    const q = BANK_MAP.get(id);
    const selected = active.answers[id] || '';
    const correct = Boolean(selected) && selected === q.answer;
    return {
      id,
      selected,
      correct,
      answered: Boolean(selected),
      category: q.category
    };
  });
  const correctCount = details.filter((item) => item.correct).length;
  const unanswered = details.filter((item) => !item.answered).length;
  const wrongCount = total - correctCount - unanswered;
  const passMark = active.settings.passMark || Math.ceil(total * PASS_RATE);

  const chapterMap = new Map();
  for (const detail of details) {
    const chapter = chapterOf(BANK_MAP.get(detail.id));
    const item = chapterMap.get(chapter.name) || { name: chapter.name, total: 0, correct: 0, color: chapter.color };
    item.total += 1;
    if (detail.correct) item.correct += 1;
    chapterMap.set(chapter.name, item);
  }
  const chapterBreakdown = Array.from(chapterMap.values()).sort((a, b) => {
    const aIndex = CHAPTER_MAP.get(a.name)?.index || 0;
    const bIndex = CHAPTER_MAP.get(b.name)?.index || 0;
    return aIndex - bIndex;
  });

  state.exam.active = null;
  clearExamTicker();

  for (const detail of details) {
    if (!detail.answered) continue;
    const q = BANK_MAP.get(detail.id);
    recordAttempt(q, detail.selected, detail.correct, 'exam');
  }

  const result = {
    id: `result-${now}`,
    startedAt: active.createdAt,
    finishedAt: now,
    total,
    correct: correctCount,
    wrong: wrongCount,
    unanswered,
    accuracy: total ? Math.round((correctCount / total) * 100) : 0,
    usedSec,
    durationSec: active.durationSec,
    passMark,
    passed: correctCount >= passMark,
    settings: { ...active.settings },
    scope: active.settings.scope,
    chapterStats: chapterBreakdown,
    details
  };

  state.exam.lastResult = result;
  state.exam.history.unshift({
    id: result.id,
    at: now,
    total,
    correct: correctCount,
    accuracy: result.accuracy,
    passed: result.passed,
    usedSec,
    minutes: active.settings.minutes,
    scope: active.settings.scope
  });
  state.exam.history = state.exam.history.slice(0, HISTORY_LIMIT);
  resultFilter = 'all';
  saveState(true);
  closeModal();
  finishingExam = false;

  if (auto) {
    toast('考试时间到，已自动交卷。', 'warn', 4000);
  }
  if (currentView === 'result') {
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  } else {
    navigate('result');
  }
}

function clearExamTicker() {
  if (examTicker) {
    clearInterval(examTicker);
    examTicker = null;
  }
}

function startExamTicker() {
  clearExamTicker();
  if (!state.exam.active) return;
  examTicker = setInterval(tickExamClock, 1000);
  tickExamClock();
}

function tickExamClock() {
  const active = state.exam.active;
  if (!active) {
    clearExamTicker();
    return;
  }
  const remaining = examRemaining(active);
  syncExamClockUI(remaining);
  updateDocumentTitle();
  if (remaining <= 300 && !active.warned5) {
    active.warned5 = true;
    saveState();
    toast('考试剩余 5 分钟，注意时间。', 'warn', 3800);
  }
  if (remaining <= 0) {
    clearExamTicker();
    finishExam(true);
  }
}

function syncExamClockUI(remaining = null) {
  const active = state.exam.active;
  if (!active) return;
  const value = remaining === null ? examRemaining(active) : remaining;
  const urgent = value <= 300;
  $$('[data-exam-clock]').forEach((node) => {
    node.textContent = formatClock(value);
    node.classList.toggle('is-urgent', urgent);
  });
  const clock = $('.exam-clock');
  if (clock) clock.classList.toggle('is-urgent', urgent);
}

function retakeExam() {
  const settings = state.exam.lastResult?.settings || state.exam.settings;
  startExam({
    singles: settings.singles ?? 32,
    multis: settings.multis ?? 8,
    minutes: settings.minutes ?? 40,
    scope: settings.scope || 'all'
  });
}

function renderResult() {
  const result = state.exam.lastResult;
  if (!result) {
    return `${pageHead('RESULT · 考试回顾', '还没有考试结果', '完成一次模拟考试后，这里会展示成绩与逐题解析。', `<a class="btn btn-primary" href="#/exam">${icon('timer')} 去模考</a>`)}
      <div class="empty-state" style="background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg)">
        <div class="empty-icon">${icon('trophy')}</div><h3>等待你的第一场模考</h3><p>40 道题，40 分钟，看看现在的水平。</p>
      </div>`;
  }
  const total = result.total;
  const pct = total ? Math.round((result.correct / total) * 100) : 0;
  const passed = Boolean(result.passed);
  const details = result.details
    .map((detail) => ({ ...detail, q: BANK_MAP.get(detail.id) }))
    .filter((detail) => detail.q);
  const wrongDetails = details.filter((detail) => detail.answered && !detail.correct);
  const blankDetails = details.filter((detail) => !detail.answered);
  const filtered = resultFilter === 'wrong'
    ? wrongDetails
    : resultFilter === 'blank'
      ? blankDetails
      : details;

  const chapterRows = (result.chapterStats || []).map((chapter) => {
    const chapterPct = chapter.total ? Math.round((chapter.correct / chapter.total) * 100) : 0;
    return `<div class="breakdown-row">
      <div>
        <div class="breakdown-name"><span>${esc(chapter.name)}</span><span>${chapter.correct} / ${chapter.total}</span></div>
        <div class="breakdown-bar"><span style="width:${chapterPct}%;background:${chapter.color || 'var(--brand)'}"></span></div>
      </div>
      <div class="breakdown-pct">${chapterPct}%</div>
    </div>`;
  }).join('');

  const reviewHTML = filtered.length
    ? filtered.map((detail, index) => renderReviewCard(detail, index)).join('')
    : `<div class="empty-state" style="background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)">
        <div class="empty-icon">${icon('check-circle')}</div>
        <h3>${resultFilter === 'wrong' ? '没有答错的题' : '没有未作答的题'}</h3>
        <p>${resultFilter === 'wrong' ? '这一次全部答对了，漂亮。' : '所有题目都已完成作答。'}</p>
      </div>`;

  return `
    ${pageHead(
      'RESULT · 本次成绩',
      '考试回顾',
      `${formatDate(result.finishedAt)} 完成 · ${scopeLabel(result.scope || 'all')} · 用时 ${formatUsedTime(result.usedSec)}`,
      `<button type="button" class="btn btn-primary btn-sm" data-action="exam-again">${icon('refresh')} 再考一次</button>
       <a class="btn btn-ghost btn-sm" href="#/home">${icon('home')} 返回首页</a>`
    )}

    <section class="result-hero ${passed ? '' : 'is-fail'}">
      <div class="result-score">${ringSVG(pct, { label: '正确率', size: 158, fail: !passed })}</div>
      <div class="result-copy">
        <div class="result-kicker">${icon(passed ? 'trophy' : 'target')} 模拟考试 · ${result.total} 题</div>
        <h2 class="result-title">${passed ? '合格，<em>稳稳上岸。</em>' : '差一点，<em>再听一遍。</em>'}</h2>
        <p class="result-sub">${passed
          ? `答对 ${result.correct} 题，达到 ${result.passMark} 题的合格线。把错题再过一遍，就可以安心上考场了。`
          : `答对 ${result.correct} 题，距离 ${result.passMark} 题的合格线还差 ${Math.max(0, result.passMark - result.correct)} 题。先复盘错题，再战一场。`}</p>
        <div class="result-badges">
          <span class="badge ${passed ? 'badge-pass' : 'badge-fail'}">${passed ? '合格' : '未合格'}</span>
          <span class="chip chip-line">答对 ${result.correct} / ${total}</span>
          <span class="chip chip-line">合格线 ${result.passMark} 题</span>
          <span class="chip chip-line">${scopeLabel(result.scope || 'all')}</span>
        </div>
      </div>
    </section>

    <div class="result-stat-grid">
      <div class="result-stat"><span>总分（每题 1 分）</span><strong>${result.correct}<small> / ${total}</small></strong></div>
      <div class="result-stat"><span>正确率</span><strong>${pct}<small>%</small></strong></div>
      <div class="result-stat"><span>考试用时</span><strong>${formatUsedTime(result.usedSec)}</strong></div>
      <div class="result-stat"><span>未作答</span><strong>${result.unanswered}<small> 题</small></strong></div>
    </div>

    <div class="result-actions">
      <button type="button" class="btn btn-primary" data-action="exam-again">${icon('refresh')} 再考一次</button>
      <a class="btn btn-ghost" href="#/wrong">${icon('bookmark')} 复习错题</a>
      <a class="btn btn-ghost" href="#/exam">${icon('settings')} 调整考试设置</a>
    </div>

    <div class="result-grid">
      <div class="result-panel">
        <h3>${icon('chart')} 章节表现</h3>
        <div class="chapter-breakdown">${chapterRows}</div>
      </div>
      <div class="result-panel">
        <h3>${icon('list')} 答题概况</h3>
        <div class="summary-list">
          <div class="summary-row"><span>答对</span><strong>${result.correct} 题</strong></div>
          <div class="summary-row"><span>答错</span><strong>${result.wrong} 题</strong></div>
          <div class="summary-row"><span>未作答</span><strong>${result.unanswered} 题</strong></div>
          <div class="summary-row"><span>考试范围</span><strong>${esc(scopeLabel(result.scope || 'all'))}</strong></div>
          <div class="summary-row"><span>合格线</span><strong>${result.passMark} 题（75%）</strong></div>
        </div>
      </div>
    </div>

    <section class="section">
      <div class="result-review-head">
        <div>
          <h2>逐题回顾</h2>
          <p>对照你的选择、正确答案与解析，把不确定的题再看一遍。解析依据标准答案整理。</p>
        </div>
        <div class="tabs" role="tablist" aria-label="回顾筛选">
          <button type="button" class="tab ${resultFilter === 'all' ? 'is-active' : ''}" data-action="result-filter" data-filter="all">全部 <span class="count">${details.length}</span></button>
          <button type="button" class="tab ${resultFilter === 'wrong' ? 'is-active' : ''}" data-action="result-filter" data-filter="wrong">答错 <span class="count">${wrongDetails.length}</span></button>
          <button type="button" class="tab ${resultFilter === 'blank' ? 'is-active' : ''}" data-action="result-filter" data-filter="blank">未答 <span class="count">${blankDetails.length}</span></button>
        </div>
      </div>
      <div class="review-list">${reviewHTML}</div>
    </section>`;
}

function renderReviewCard(detail, index) {
  const q = detail.q;
  const status = !detail.answered ? 'blank' : detail.correct ? 'correct' : 'wrong';
  const statusText = status === 'blank' ? '未作答' : status === 'correct' ? '答对' : '答错';
  const selectedSet = new Set((detail.selected || '').split(''));
  const correctSet = new Set(q.answer.split(''));
  const options = q.options.map((text, optionIndex) => {
    const letter = LETTERS[optionIndex];
    const isCorrect = correctSet.has(letter);
    const isSelected = selectedSet.has(letter);
    let cls = 'review-option';
    if (isCorrect) cls += ' is-correct';
    else if (isSelected) cls += ' is-wrong';
    let tag = '';
    if (isCorrect && isSelected) tag = '你的选择 · 正确';
    else if (isCorrect) tag = '正确答案';
    else if (isSelected) tag = '你的选择';
    return `<div class="${cls}">
      <span class="ro-letter">${esc(optionLetterDisplay(q, optionIndex))}</span>
      <span class="ro-text">${esc(text)}</span>
      ${tag ? `<span class="ro-tag">${tag}</span>` : ''}
    </div>`;
  }).join('');

  return `
    <article class="review-card is-${status}">
      <div class="review-head">
        <span class="review-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="review-status ${status}">${icon(status === 'correct' ? 'check-circle' : status === 'blank' ? 'circle-dash' : 'x-circle')}${statusText}</span>
        <span class="chip chip-teal">${esc(q.category)}</span>
        <span class="type-chip ${typeClass(q)}">${typeLabel(q)}</span>
        <span class="q-source" style="margin-left:auto">NO. ${esc(q.id)}</span>
      </div>
      <h3 class="q-stem">${esc(q.question)}</h3>
      <div class="review-options">${options}</div>
      <div class="review-answer-line">
        <span class="${detail.correct ? '' : 'wrong-answer'}">你的答案：<strong>${detail.answered ? esc(q.type === 'judge' ? (detail.selected === 'A' ? '对' : '错') : detail.selected.split('').join('、')) : '未作答'}</strong></span>
        <span>正确答案：<strong>${esc(answerDisplay(q))}</strong></span>
      </div>
      <details class="review-explain" ${status === 'wrong' ? 'open' : ''}>
        <summary>${icon('chevron-down')} 查看答案解析</summary>
        <div class="explain-box ${status === 'correct' ? '' : 'is-wrong'}">
          <div class="explain-head">
            <span class="explain-status">${icon('info')} 答案解析</span>
            <span class="explain-status-badge">${typeLabel(q)}</span>
          </div>
          <div class="explain-text">${esc(explanationBody(q))}</div>
        </div>
      </details>
    </article>`;
}

/* ============================================================
   9. 错题本 / 学习统计
   ============================================================ */
function renderWrong() {
  const allEntries = wrongEntries('all');
  if (wrongFilter !== 'all' && !BANK_BY_CATEGORY.has(wrongFilter)) wrongFilter = 'all';
  const entries = wrongEntries(wrongFilter);
  const counts = new Map();
  for (const entry of allEntries) counts.set(entry.q.category, (counts.get(entry.q.category) || 0) + 1);

  const head = pageHead(
    'REVIEW · 把错题变对',
    '错题本',
    allEntries.length ? `共 ${allEntries.length} 道错题，重做正确后可手动移出。` : '答错的题会自动收集到这里。',
    `<a class="btn btn-ghost btn-sm" href="#/practice">${icon('edit')} 去刷题</a>`
  );

  if (!allEntries.length) {
    return `${head}
      <div class="empty-state" style="background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg)">
        <div class="empty-icon">${icon('check-circle')}</div>
        <h3>错题本很干净</h3>
        <p>刷题时答错的题会自动出现在这里。继续保持，或者去挑战一轮模拟考试。</p>
        <a class="btn btn-primary" href="#/practice">${icon('play')} 开始刷题</a>
      </div>`;
  }

  const filterOptions = [
    `<option value="all" ${wrongFilter === 'all' ? 'selected' : ''}>全部错题 · ${allEntries.length} 题</option>`,
    ...CHAPTERS.filter((chapter) => counts.get(chapter.name)).map((chapter) => `<option value="${esc(chapter.name)}" ${wrongFilter === chapter.name ? 'selected' : ''}>${esc(chapter.name)} · ${counts.get(chapter.name)} 题</option>`)
  ].join('');

  const toolbar = `
    <div class="wrong-toolbar">
      <div class="wrong-toolbar-left">
        <span class="select-wrap">
          <select class="select" id="wrong-filter" aria-label="按章节筛选错题">${filterOptions}</select>
        </span>
        <div class="toolbar-progress">当前 <strong>${entries.length}</strong> 题</div>
      </div>
      <div class="wrong-toolbar-right">
        <button type="button" class="btn btn-soft btn-sm" data-action="wrong-redo-all" ${entries.length ? '' : 'disabled'}>${icon('refresh')} 全部重做</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="wrong-clear">${icon('trash')} 清空</button>
      </div>
    </div>`;

  if (!entries.length) {
    return `${head}${toolbar}
      <div class="empty-state" style="background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg)">
        <div class="empty-icon">${icon('bookmark')}</div><h3>这个章节没有错题</h3><p>换一个章节看看，或者回到全部错题。</p>
        <button type="button" class="btn btn-ghost" data-action="wrong-filter-all">${icon('arrow-left')} 查看全部错题</button>
      </div>`;
  }

  return `${head}${toolbar}
    <div class="wrong-list">${entries.map((entry, index) => renderWrongCard(entry, index)).join('')}</div>`;
}

function renderWrongCard(entry, index) {
  const q = entry.q;
  const last = entry.lastAnswer || '';
  const selectedSet = new Set(last.split(''));
  const correctSet = new Set(q.answer.split(''));
  const options = q.options.map((text, optionIndex) => {
    const letter = LETTERS[optionIndex];
    const isCorrect = correctSet.has(letter);
    const isSelected = selectedSet.has(letter);
    let cls = 'review-option';
    if (isCorrect) cls += ' is-correct';
    else if (isSelected) cls += ' is-wrong';
    let tag = '';
    if (isCorrect && isSelected) tag = '你的选择 · 正确';
    else if (isCorrect) tag = '正确答案';
    else if (isSelected) tag = '上次选择';
    return `<div class="${cls}">
      <span class="ro-letter">${esc(optionLetterDisplay(q, optionIndex))}</span>
      <span class="ro-text">${esc(text)}</span>
      ${tag ? `<span class="ro-tag">${tag}</span>` : ''}
    </div>`;
  }).join('');

  return `
    <article class="wrong-card">
      <div class="wrong-card-head">
        <span class="review-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="chip chip-teal">${esc(q.category)}</span>
        <span class="type-chip ${typeClass(q)}">${typeLabel(q)}</span>
        <span class="wrong-count-badge">错 ${entry.count} 次</span>
        <span class="wrong-date">最近 ${formatDate(entry.lastAt)}</span>
      </div>
      <h3 class="q-stem">${esc(q.question)}</h3>
      <div class="wrong-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="wrong-redo-one" data-id="${esc(q.id)}">${icon('refresh')} 重做本题</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="wrong-remove" data-id="${esc(q.id)}">${icon('check')} 移出错题本</button>
      </div>
      <details class="wrong-details">
        <summary>${icon('chevron-down')} 查看答案与解析</summary>
        <div class="wrong-details-body">
          <div class="review-options">${options}</div>
          <div class="review-answer-line">
            <span class="wrong-answer">上次选择：<strong>${last ? esc(q.type === 'judge' ? (last === 'A' ? '对' : '错') : last.split('').join('、')) : '未记录'}</strong></span>
            <span>正确答案：<strong>${esc(answerDisplay(q))}</strong></span>
          </div>
          <div class="explain-box is-wrong">
            <div class="explain-head">
              <span class="explain-status">${icon('info')} 答案解析</span>
              <span class="explain-status-badge">${typeLabel(q)}</span>
            </div>
            <div class="explain-text">${esc(explanationBody(q))}</div>
            <div class="auto-note">${icon('info')}解析依据标准答案整理，可在题库数据中替换为详细解析</div>
          </div>
        </div>
      </details>
    </article>`;
}

function requestClearWrong() {
  const count = Object.keys(state.wrong).length;
  if (!count) {
    toast('错题本已经是空的。');
    return;
  }
  openModal({
    title: '清空错题本？',
    subtitle: `当前共有 ${count} 道错题`,
    body: `<p>清空后这些题不会再出现在错题本中，但刷题记录和学习统计不会受到影响。</p>`,
    actions: [
      { label: '取消', action: 'modal-close', variant: 'btn-ghost' },
      { label: '清空错题本', action: 'wrong-confirm-clear', variant: 'btn-danger-solid' }
    ]
  });
}

function clearWrong() {
  state.wrong = {};
  saveState(true);
  closeModal();
  render();
  toast('错题本已清空。');
}

function renderStats() {
  const ov = overview();
  const streak = computeStreak();
  const chapters = chapterStats();
  const days = last7Days();
  const maxAttempts = Math.max(1, ...days.map((day) => day.attempts));
  const history = state.exam.history;
  const weak = chapters
    .filter((chapter) => chapter.total > 0)
    .slice()
    .sort((a, b) => a.mastery - b.mastery || b.total - a.total)[0];

  const masteryRows = chapters.map((chapter, index) => `
    <div class="mastery-row">
      <div class="mastery-top">
        <div class="mastery-name">
          <span class="chapter-num">${pad2(index + 1)}</span>
          <span class="name-text">${esc(chapter.name)}</span>
        </div>
        <span class="mastery-pct">${chapter.mastery}%</span>
      </div>
      <div class="mastery-bar"><span style="width:${chapter.mastery}%;background:${chapter.color}"></span></div>
      <div class="mastery-sub">
        <span>已练 ${chapter.answered} / ${chapter.total} · 正确率 ${chapter.accuracy}%</span>
        <span>掌握 ${chapter.mastered} 题</span>
      </div>
    </div>`).join('');

  const activity = days.map((day) => {
    const height = day.attempts ? Math.max(6, Math.round((day.attempts / maxAttempts) * 100)) : 3;
    const correctPct = day.attempts ? Math.round((day.correct / day.attempts) * 100) : 0;
    return `<div class="day-col" title="${day.dateLabel}：答 ${day.attempts} 题，对 ${day.correct} 题">
      <div class="day-bar-wrap">
        <div class="day-bar ${day.attempts ? '' : 'is-empty'}" style="height:${height}%">
          ${day.attempts ? `<span class="correct-part" style="height:${correctPct}%"></span>` : ''}
        </div>
      </div>
      <div class="day-label">${day.label}</div>
      <div class="day-count">${day.attempts || '·'}</div>
    </div>`;
  }).join('');

  const historyHTML = history.length
    ? `<div class="exam-history-list">${history.map((item) => `
        <div class="exam-history-item">
          <div class="exam-history-score ${item.passed ? '' : 'fail'}">${item.accuracy}%</div>
          <div class="exam-history-info">
            <strong>${item.correct} / ${item.total} 题 · ${item.passed ? '合格' : '未合格'}</strong>
            <span>${formatDate(item.at)} · 用时 ${formatUsedTime(item.usedSec)}</span>
          </div>
          <span class="badge ${item.passed ? 'badge-pass' : 'badge-fail'}">${item.passed ? '合格' : '未合格'}</span>
        </div>`).join('')}</div>`
    : `<div class="empty-state" style="padding:26px 16px">
        <div class="empty-icon">${icon('trophy')}</div><h3>还没有模考记录</h3><p>完成一次模考后，成绩会记录在这里。</p>
      </div>`;

  return `
    ${pageHead(
      'STATS · 看见进步',
      '学习统计',
      '所有数据保存在本机浏览器，换设备或清理缓存前请注意备份。',
      `<button type="button" class="btn btn-ghost btn-sm" data-action="reset-data">${icon('trash')} 重置数据</button>`
    )}

    ${ov.answered > 0 && weak && weak.mastery < 100 ? `<div class="weak-callout">
      ${icon('target')}
      <span>当前薄弱章节：<strong>${esc(weak.name)}</strong>，掌握度 ${weak.mastery}%。建议优先补一补这一章。</span>
      <button type="button" class="btn btn-soft btn-sm" data-action="stats-practice-weak" data-category="${esc(weak.name)}">去练习</button>
    </div>` : ''}

    <div class="stats-overview">
      <div class="stats-card">
        <div class="stats-card-top"><span class="stats-card-label">已练题目</span><span class="stats-icon">${icon('target')}</span></div>
        <div class="stats-card-value">${ov.answered}<small> / ${ov.total}</small></div>
        <div class="stats-card-note">覆盖 ${ov.total ? Math.round((ov.answered / ov.total) * 100) : 0}% 题库</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-top"><span class="stats-card-label">累计作答</span><span class="stats-icon">${icon('edit')}</span></div>
        <div class="stats-card-value">${ov.attempts}<small> 次</small></div>
        <div class="stats-card-note">含刷题、错题重做与模考</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-top"><span class="stats-card-label">累计正确率</span><span class="stats-icon">${icon('check-circle')}</span></div>
        <div class="stats-card-value">${ov.accuracy}<small>%</small></div>
        <div class="stats-card-note">共答对 ${ov.correct} 次</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-top"><span class="stats-card-label">连续学习</span><span class="stats-icon">${icon('flame')}</span></div>
        <div class="stats-card-value">${streak}<small> 天</small></div>
        <div class="stats-card-note">今日已答 ${todayStats().attempts} 题</div>
      </div>
    </div>

    <div class="stats-main-grid">
      <div class="stats-panel">
        <div class="stats-panel-head">
          <div><h3>${icon('layers')} 各章节掌握度</h3><p>掌握度 = 该章至少答对一次的题目数 / 该章总题数</p></div>
          <span class="chip chip-line">${CHAPTERS.length} 个章节</span>
        </div>
        <div class="mastery-list">${masteryRows}</div>
      </div>
      <div class="stats-panel">
        <div class="stats-panel-head">
          <div><h3>${icon('chart')} 最近 7 天</h3><p>柱高为作答量，深色部分为答对</p></div>
        </div>
        <div class="activity-chart">${activity}</div>
        <div class="activity-legend">
          <span><i class="legend-swatch"></i>作答量</span>
          <span><i class="legend-swatch correct"></i>答对</span>
        </div>
      </div>
    </div>

    <div class="stats-main-grid">
      <div class="stats-panel">
        <div class="stats-panel-head">
          <div><h3>${icon('trophy')} 模考记录</h3><p>最近 ${HISTORY_LIMIT} 次模拟考试</p></div>
          <a class="section-link" href="#/exam">去模考 ${icon('arrow-right')}</a>
        </div>
        ${historyHTML}
      </div>
      <div class="stats-panel">
        <div class="stats-panel-head">
          <div><h3>${icon('info')} 数据说明</h3><p>本地保存 · 不上传服务器</p></div>
        </div>
        <div class="text-muted" style="font-size:11px;line-height:1.85">
          刷题进度、错题本、章节统计和模考记录都保存在浏览器的 localStorage 中。清理浏览器缓存、更换浏览器或使用隐私模式可能导致数据丢失。
        </div>
        <div class="divider" style="margin:14px 0"></div>
        <div class="mastery-sub" style="margin-bottom:12px">
          <span>题库版本：${esc(BANK_VERSION)}</span>
          <span>共 ${BANK.length} 题</span>
        </div>
        <button type="button" class="btn btn-danger btn-sm" style="width:100%" data-action="reset-data">${icon('trash')} 重置全部学习数据</button>
      </div>
    </div>

    <div class="stats-data-panel">
      <div>
        <h3>${icon('bookmark')} 错题本</h3>
        <p>当前有 ${ov.wrong} 道题等待复习。重做正确后可手动移出，直到真正掌握。</p>
      </div>
      <a class="btn btn-soft btn-sm" href="#/wrong">${icon('arrow-right')} 打开错题本</a>
    </div>`;
}

/* ============================================================
   10. 弹窗 / 提示 / 事件 / 启动
   ============================================================ */
let modalReturnFocus = null;

function openModal(options = {}) {
  const root = $('#modal-root');
  if (!root) return;
  const actions = options.actions || [];
  const actionsHTML = actions.map((action) => `
    <button type="button" class="btn ${action.variant || 'btn-ghost'}" data-action="${esc(action.action || 'modal-close')}">
      ${esc(action.label || '确定')}
    </button>`).join('');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal ${options.className || ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <div>
            <h2 id="modal-title">${esc(options.title || '提示')}</h2>
            ${options.subtitle ? `<p>${esc(options.subtitle)}</p>` : ''}
          </div>
          <button type="button" class="modal-close" data-action="modal-close" aria-label="关闭">${icon('close')}</button>
        </div>
        <div class="modal-body">${options.body || ''}</div>
        ${actionsHTML ? `<div class="modal-actions">${actionsHTML}</div>` : ''}
      </div>
    </div>`;
  document.body.classList.add('modal-open');
  modalReturnFocus = document.activeElement;
  const focusTarget = root.querySelector('.modal-close') || root.querySelector('button');
  if (focusTarget) focusTarget.focus({ preventScroll: true });
}

function closeModal() {
  const root = $('#modal-root');
  if (!root || !root.innerHTML) return;
  root.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (modalReturnFocus && document.contains(modalReturnFocus)) {
    try { modalReturnFocus.focus({ preventScroll: true }); } catch (error) { /* ignore */ }
  }
  modalReturnFocus = null;
}

function toast(message, tone = 'default', duration = 3200) {
  const root = $('#toast-root');
  if (!root) return;
  while (root.children.length >= 3) root.removeChild(root.firstElementChild);
  const el = document.createElement('div');
  el.className = `toast ${tone === 'warn' ? 'warn' : tone === 'error' ? 'error' : ''}`;
  const iconName = tone === 'warn' ? 'alert' : tone === 'error' ? 'x-circle' : 'check-circle';
  el.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  }, duration);
}

function handleAction(action, element) {
  switch (action) {
    case 'modal-close':
      closeModal();
      break;
    case 'home-chapter':
      startPracticeForCategory(element.dataset.category);
      break;

    case 'practice-option':
      togglePracticeOption(element.dataset.letter);
      break;
    case 'practice-submit':
      submitPractice();
      break;
    case 'practice-prev':
      movePractice(-1);
      break;
    case 'practice-next':
      movePractice(1);
      break;
    case 'practice-skip':
      movePractice(1);
      break;
    case 'practice-jump':
      jumpPractice(element.dataset.index);
      break;
    case 'practice-first-unanswered':
      firstUnansweredPractice();
      break;
    case 'practice-reset':
      requestResetPractice();
      break;
    case 'practice-reset-confirm':
      resetPracticeNow();
      break;
    case 'practice-order':
      changePracticeOrder(element.dataset.order);
      break;
    case 'practice-exit-custom':
      element.preventDefault?.();
      leaveCustomPractice();
      break;
    case 'practice-all':
      startPracticeForCategory('all');
      break;

    case 'study-toggle':
      toggleStudyAnswer();
      break;
    case 'study-prev':
      moveStudy(-1);
      break;
    case 'study-next':
      moveStudy(1);
      break;

    case 'exam-step':
      stepExamField(element.dataset.field, Number(element.dataset.step) || 0);
      break;
    case 'exam-preset':
      applyExamPreset(element.dataset.preset);
      break;
    case 'exam-minutes':
      setExamMinutes(Number(element.dataset.minutes) || 40);
      break;
    case 'exam-start':
      startExamFromForm();
      break;
    case 'exam-option':
      toggleExamOption(element.dataset.letter);
      break;
    case 'exam-prev':
      moveExam(-1);
      break;
    case 'exam-next':
      moveExam(1);
      break;
    case 'exam-jump':
      jumpExam(element.dataset.index);
      break;
    case 'exam-sheet':
      openExamSheet();
      break;
    case 'exam-submit':
      requestSubmitExam();
      break;
    case 'exam-confirm-submit':
      finishExam(false);
      break;
    case 'exam-abandon':
      requestAbandonExam();
      break;
    case 'exam-confirm-abandon':
      abandonExam();
      break;
    case 'exam-again':
      retakeExam();
      break;
    case 'result-filter':
      resultFilter = element.dataset.filter || 'all';
      render();
      break;

    case 'wrong-redo-one':
      startCustomPractice([element.dataset.id], '错题重做');
      break;
    case 'wrong-redo-all': {
      const entries = wrongEntries(wrongFilter);
      if (!entries.length) {
        toast('当前筛选下没有错题。', 'warn');
        break;
      }
      startCustomPractice(entries.map((entry) => entry.id), wrongFilter === 'all' ? '错题重做' : `错题重做 · ${wrongFilter}`);
      break;
    }
    case 'wrong-remove':
      if (removeWrong(element.dataset.id)) {
        render();
        toast('已移出错题本。');
      }
      break;
    case 'wrong-clear':
      requestClearWrong();
      break;
    case 'wrong-confirm-clear':
      clearWrong();
      break;
    case 'wrong-filter-all':
      wrongFilter = 'all';
      render();
      break;

    case 'stats-practice-weak':
      startPracticeForCategory(element.dataset.category);
      break;
    case 'reset-data':
      openModal({
        title: '重置全部学习数据？',
        subtitle: '不可撤销',
        body: `<p>这会清空刷题进度、错题本、章节统计和模考记录，题库本身不会被修改。</p>
               <div class="modal-warning">${icon('alert')}确定要继续吗？</div>`,
        actions: [
          { label: '取消', action: 'modal-close', variant: 'btn-ghost' },
          { label: '确认重置', action: 'reset-confirm', variant: 'btn-danger-solid' }
        ]
      });
      break;
    case 'reset-confirm':
      state = blankState();
      resultFilter = 'all';
      wrongFilter = 'all';
      saveState(true);
      closeModal();
      navigate('home');
      toast('学习数据已重置。');
      break;

    default:
      break;
  }
}

document.addEventListener('click', (event) => {
  const skipLink = event.target.closest('.skip-link');
  if (skipLink) {
    event.preventDefault();
    const main = $('#view');
    if (main) {
      main.focus({ preventScroll: true });
      main.scrollIntoView({ block: 'start' });
    }
    return;
  }
  if (event.target.classList && event.target.classList.contains('modal-backdrop')) {
    closeModal();
    return;
  }
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'practice-exit-custom') {
    event.preventDefault();
  }
  handleAction(action, actionEl, event);
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.id === 'practice-filter') {
    changePracticeFilter(target.value);
    return;
  }
  if (target.id === 'study-filter') {
    changeStudyFilter(target.value);
    return;
  }
  if (target.id === 'wrong-filter') {
    wrongFilter = target.value;
    render();
    return;
  }
  if (target.id === 'exam-scope') {
    handleExamScopeChange();
    return;
  }
  if (target.matches('[data-exam-field]')) {
    normalizeExamInputs();
  }
});

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-exam-field]')) {
    updateExamSummary(false);
  }
});

document.addEventListener('keydown', (event) => {
  const root = $('#modal-root');
  if (root && root.innerHTML) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', root);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    return;
  }

  const target = event.target;
  const tag = String(target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return;
  const interactive = target.closest && target.closest('button, a, summary');
  const key = event.key;

  if (currentView === 'practice') {
    const session = currentPracticeSession();
    if (!session || session.index >= session.ids.length) return;
    const q = BANK_MAP.get(session.ids[session.index]);
    if (!q) return;
    const answered = Boolean(session.answers[q.id]);
    const letterMap = { a: 'A', b: 'B', c: 'C', d: 'D', '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
    const lower = key.toLowerCase();
    if (letterMap[lower] && !answered) {
      event.preventDefault();
      togglePracticeOption(letterMap[lower]);
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      movePractice(-1);
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      movePractice(1);
      return;
    }
    if (key === 'Enter' && (target.closest('.option[data-action]') || !interactive)) {
      event.preventDefault();
      if (answered) movePractice(1);
      else submitPractice();
    }
    return;
  }

  if (currentView === 'study') {
    if (key === 'ArrowLeft') {
      event.preventDefault();
      moveStudy(-1);
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      moveStudy(1);
      return;
    }
    if ((key === ' ' || key === 'Enter') && !interactive) {
      event.preventDefault();
      toggleStudyAnswer();
    }
    return;
  }

  if (currentView === 'exam') {
    const active = state.exam.active;
    if (!active || active.index >= active.questions.length) return;
    const q = BANK_MAP.get(active.questions[active.index]);
    if (!q) return;
    const letterMap = { a: 'A', b: 'B', c: 'C', d: 'D', '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
    const lower = key.toLowerCase();
    if (letterMap[lower]) {
      event.preventDefault();
      toggleExamOption(letterMap[lower]);
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      moveExam(-1);
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      moveExam(1);
      return;
    }
    if (key === 'Enter' && (target.closest('.option[data-action="exam-option"]') || !interactive)) {
      event.preventDefault();
      moveExam(1);
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tickExamClock();
});

window.addEventListener('hashchange', handleRoute);
window.addEventListener('beforeunload', () => saveState(true));

function init() {
  if (!BANK.length) {
    render();
    return;
  }
  const initial = getViewFromHash();
  if (!location.hash || location.hash !== `#/${initial}`) {
    history.replaceState(null, '', `#/${initial}`);
  }
  currentView = initial;
  render();

  if (state.exam.active) {
    if (examRemaining() <= 0) {
      setTimeout(() => finishExam(true), 60);
    } else {
      startExamTicker();
    }
  }
  if (!storageOK) {
    setTimeout(() => toast('浏览器本地存储不可用，本次学习进度可能无法保存。', 'warn', 4500), 700);
  }
  console.info(`[电波题库] 已加载 ${BANK.length} 道题，${CHAPTERS.length} 个章节。`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
