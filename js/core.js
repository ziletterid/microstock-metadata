/* core.js — util murni (tanpa DOM): kategori, slug, normalisasi keyword/metadata, validasi */
(function (g) {
  'use strict';

  var ADOBE_CATEGORIES = {
    1: 'Animals', 2: 'Buildings and Architecture', 3: 'Business', 4: 'Drinks',
    5: 'The Environment', 6: 'States of Mind', 7: 'Food', 8: 'Graphic Resources',
    9: 'Hobbies and Leisure', 10: 'Industry', 11: 'Landscapes', 12: 'Lifestyle',
    13: 'People', 14: 'Plants and Flowers', 15: 'Culture and Religion', 16: 'Science',
    17: 'Social Issues', 18: 'Sports', 19: 'Technology', 20: 'Transport', 21: 'Travel'
  };

  var SS_CATEGORIES = [
    'Abstract', 'Animals/Wildlife', 'Arts', 'Backgrounds/Textures', 'Beauty/Fashion',
    'Buildings/Landmarks', 'Business/Finance', 'Celebrities', 'Education', 'Food and drink',
    'Healthcare/Medical', 'Holidays', 'Industrial', 'Interiors', 'Miscellaneous', 'Nature',
    'Objects', 'Parks/Outdoor', 'People', 'Religion', 'Science', 'Signs/Symbols',
    'Sports/Recreation', 'Technology', 'Transportation', 'Vintage'
  ];

  var LIMITS = { title: 200, description: 200, kwMin: 7, kwMax: 49 };

  function slugify(s, max) {
    max = max || 60;
    s = String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (s.length > max) {
      s = s.slice(0, max);
      var i = s.lastIndexOf('-');
      if (i > 20) s = s.slice(0, i);
    }
    return s.replace(/-+$/, '');
  }

  function normKeywords(input, max) {
    max = max || 200;
    var arr = Array.isArray(input) ? input : String(input || '').split(/[,\n;]+/);
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      var k = String(arr[i]).trim().toLowerCase().replace(/\s+/g, ' ');
      if (!k || seen[k]) continue;
      seen[k] = true;
      out.push(k);
      if (out.length >= max) break;
    }
    return out;
  }

  function cutWords(s, max) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    s = s.slice(0, max);
    var i = s.lastIndexOf(' ');
    return (i > max * 0.6 ? s.slice(0, i) : s).replace(/[,;:\-\s]+$/, '');
  }

  function normalizeMeta(raw) {
    raw = raw || {};
    var title = cutWords(String(raw.title || '').replace(/[.\s]+$/, ''), LIMITS.title);
    var description = cutWords(raw.description || '', LIMITS.description);
    var keywords = normKeywords(raw.keywords, LIMITS.kwMax);
    var cat = parseInt(raw.category, 10);
    if (!ADOBE_CATEGORIES[cat]) cat = 0;
    var ssRaw = raw.ss_categories || raw.ssCategories || [];
    if (!Array.isArray(ssRaw)) ssRaw = [ssRaw];
    var ss = [];
    ssRaw.forEach(function (n) {
      var hit = SS_CATEGORIES.filter(function (c) { return c.toLowerCase() === String(n).trim().toLowerCase(); })[0];
      if (hit && ss.indexOf(hit) < 0 && ss.length < 2) ss.push(hit);
    });
    return { title: title, description: description, keywords: keywords, category: cat, ss: ss };
  }

  /* nama file unik dari judul; assets: [{title, name, ext}] */
  function buildNames(assets) {
    var used = {};
    return assets.map(function (a) {
      var ext = (a.ext || '').toLowerCase();
      var base = slugify(a.title) || slugify(String(a.name || '').replace(/\.[^.]+$/, '')) || 'asset';
      var n = base, i = 2;
      while (used[n + ext]) { n = base + '-' + i; i++; }
      used[n + ext] = true;
      return n + ext;
    });
  }

  function validate(a) {
    var w = [];
    if (!a.title) { w.push('Judul kosong'); return w; }
    if (a.title.length > LIMITS.title) w.push('Judul > ' + LIMITS.title + ' karakter');
    if ((a.description || '').length > LIMITS.description) w.push('Deskripsi > ' + LIMITS.description + ' karakter');
    var n = (a.keywords || []).length;
    if (n < LIMITS.kwMin) w.push('Keyword < ' + LIMITS.kwMin);
    if (n > LIMITS.kwMax) w.push('Keyword > ' + LIMITS.kwMax + ' (Adobe)');
    return w;
  }

  g.Core = {
    ADOBE_CATEGORIES: ADOBE_CATEGORIES, SS_CATEGORIES: SS_CATEGORIES, LIMITS: LIMITS,
    slugify: slugify, normKeywords: normKeywords, normalizeMeta: normalizeMeta,
    buildNames: buildNames, validate: validate, cutWords: cutWords
  };
})(globalThis);
