/* app.js — antarmuka dan alur kerja */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  var DEFAULTS = {
    provider: 'gemini', geminiKey: '', groqKey: '',
    geminiModel: 'gemini-3.8-flash', groqModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    concurrency: 2, intervalMs: 4000, illustration: 'yes'
  };
  function safeParse(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }
  var settings = Object.assign({}, DEFAULTS, safeParse(localStorage.getItem('msh-settings')));
  // model lama yang sudah ditutup untuk pengguna baru -> pindah ke default baru
  if (settings.geminiModel === 'gemini-2.5-flash') {
    settings.geminiModel = DEFAULTS.geminiModel;
    try { localStorage.setItem('msh-settings', JSON.stringify(settings)); } catch (e) { /* abaikan */ }
  }

  var state = { root: null, rootName: '', assets: [], running: false, stop: false };
  var seq = 0;

  /* ---------- util UI ---------- */
  var toastTimer;
  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3500);
  }
  function byId(id) { return state.assets.filter(function (a) { return a.id === id; })[0]; }
  function finalName(a) { return a.renamed && a.newName ? a.newName : a.name; }

  /* ---------- penyimpanan metadata per folder ---------- */
  var saveTimer;
  function metaKey() { return 'msh-meta:' + state.rootName; }
  function saveMetaSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var o = {};
      state.assets.forEach(function (a) {
        if (a.title || a.description || a.keywords.length) {
          o[a.name] = { title: a.title, description: a.description, keywords: a.keywords,
            category: a.category, ss: a.ss, status: a.status === 'done' ? 'done' : 'idle',
            renamed: !!a.renamed, newName: a.newName || '' };
        }
      });
      try { localStorage.setItem(metaKey(), JSON.stringify(o)); } catch (e) { /* penuh */ }
    }, 400);
  }

  /* ---------- memuat folder ---------- */
  function newAsset(src) {
    return {
      id: 'a' + (++seq), name: src.name, ext: Files.extOf(src.name), kind: src.kind,
      handle: src.handle || null, file: src.file || null, thumb: '',
      title: '', description: '', keywords: [], category: 0, ss: [],
      status: 'idle', error: '', sel: false, renamed: false, newName: ''
    };
  }

  function finishLoad(list, rootName) {
    state.rootName = rootName;
    list.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
    state.assets = list.map(newAsset);
    var saved = safeParse(localStorage.getItem(metaKey()));
    state.assets.forEach(function (a) {
      var m = saved[a.name];
      if (m) {
        a.title = m.title || ''; a.description = m.description || ''; a.keywords = m.keywords || [];
        a.category = m.category || 0; a.ss = m.ss || [];
        a.status = m.status === 'done' ? 'done' : 'idle';
        a.renamed = !!m.renamed; a.newName = m.newName || '';
      }
    });
    $('#folderLabel').textContent = rootName + ' — ' + state.assets.length + ' aset';
    renderAll();
    makeThumbs();
  }

  async function pickFolder() {
    if (!window.showDirectoryPicker) { $('#fallbackInput').click(); return; }
    try {
      var root = await window.showDirectoryPicker({ mode: 'readwrite' });
      var list = [];
      for await (var entry of root.entries()) {
        if (entry[1].kind !== 'file') continue;
        var k = Files.kindOf(entry[0]);
        if (k) list.push({ handle: entry[1], name: entry[0], kind: k });
      }
      state.root = root;
      if (!list.length) toast('Tidak ada JPG/PNG/MP4/MOV di folder itu.');
      finishLoad(list, root.name);
    } catch (e) {
      if (e.name !== 'AbortError') toast('Gagal membuka folder: ' + e.message);
    }
  }

  function onFallback(ev) {
    var files = Array.prototype.slice.call(ev.target.files || []);
    var list = [];
    files.forEach(function (f) {
      var k = Files.kindOf(f.name);
      if (k) list.push({ file: f, name: f.name, kind: k });
    });
    state.root = null;
    var top = files[0] && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'folder';
    toast('Browser ini tidak mendukung tulis folder: rename hanya lewat ZIP (gambar saja). Pakai Chrome/Edge untuk fitur penuh.', 6000);
    finishLoad(list, top);
  }

  var thumbRun = 0;
  async function makeThumbs() {
    var run = ++thumbRun;
    for (var i = 0; i < state.assets.length; i++) {
      if (run !== thumbRun) return;
      var a = state.assets[i];
      try {
        a.thumb = await Files.makeThumb(await Files.getFile(a), a.kind);
        var img = $('tr[data-id="' + a.id + '"] .thumb');
        if (img) { img.outerHTML = '<img class="thumb" alt="" src="' + a.thumb + '">'; }
      } catch (e) { /* biarkan placeholder */ }
    }
  }

  /* ---------- render tabel ---------- */
  function rowHtml(a) {
    var catOpts = '<option value="0">— kategori Adobe —</option>' + Object.keys(Core.ADOBE_CATEGORIES).map(function (id) {
      return '<option value="' + id + '"' + (a.category == id ? ' selected' : '') + '>' + esc(Core.ADOBE_CATEGORIES[id]) + '</option>';
    }).join('');
    function ssOpts(i) {
      return '<option value="">— kategori Shutterstock ' + (i + 1) + ' —</option>' + Core.SS_CATEGORIES.map(function (n) {
        return '<option' + (a.ss[i] === n ? ' selected' : '') + '>' + esc(n) + '</option>';
      }).join('');
    }
    var statusText = { idle: 'belum', working: 'memproses…', done: 'selesai', error: 'gagal' }[a.status];
    var warns = Core.validate(a);
    return '<tr data-id="' + a.id + '">' +
      '<td><input type="checkbox" class="sel"' + (a.sel ? ' checked' : '') + '></td>' +
      '<td>' + (a.thumb ? '<img class="thumb" alt="" src="' + a.thumb + '">' : '<div class="thumb ph">' + (a.kind === 'video' ? 'video' : 'gambar') + '</div>') + '</td>' +
      '<td><div class="orig">' + esc(a.name) + '</div>' +
        '<div class="newname">' + (a.renamed ? '→ ' + esc(a.newName) : '') + '</div>' +
        '<span class="badge ' + a.status + '">' + statusText + '</span>' +
        (a.error ? '<div class="errmsg">' + esc(a.error) + '</div>' : '') +
        '<br><button class="regen" title="Generate ulang baris ini">↻ Generate</button></td>' +
      '<td><input type="text" data-f="title" value="' + esc(a.title) + '"><div class="cnt" data-c="title"></div></td>' +
      '<td><textarea data-f="description" rows="4">' + esc(a.description) + '</textarea><div class="cnt" data-c="description"></div></td>' +
      '<td><textarea data-f="keywords" rows="4">' + esc(a.keywords.join(', ')) + '</textarea><div class="cnt" data-c="keywords"></div><div class="warns" data-c="warns">' + esc(a.title ? warns.join(' · ') : '') + '</div></td>' +
      '<td><select data-f="category">' + catOpts + '</select><select data-f="ss0">' + ssOpts(0) + '</select><select data-f="ss1">' + ssOpts(1) + '</select></td>' +
      '</tr>';
  }

  function refreshCounts(tr, a) {
    var L = Core.LIMITS;
    function set(key, text, bad) {
      var el = $('[data-c="' + key + '"]', tr);
      if (!el) return;
      el.textContent = text;
      el.classList.toggle('bad', !!bad);
    }
    set('title', a.title.length + '/' + L.title, a.title.length > L.title);
    set('description', a.description.length + '/' + L.description, a.description.length > L.description);
    var n = a.keywords.length;
    set('keywords', n + ' keyword (' + L.kwMin + '–' + L.kwMax + ')', n > 0 && (n < L.kwMin || n > L.kwMax));
    var w = $('[data-c="warns"]', tr);
    if (w) w.textContent = a.title ? Core.validate(a).join(' · ') : '';
  }

  function renderAll() {
    $('#empty').hidden = state.assets.length > 0;
    $('#grid').hidden = state.assets.length === 0;
    $('#rows').innerHTML = state.assets.map(rowHtml).join('');
    state.assets.forEach(function (a) { refreshCounts($('tr[data-id="' + a.id + '"]'), a); });
    updateSummary();
  }

  function updateRow(a) {
    var old = $('tr[data-id="' + a.id + '"]');
    if (!old) return;
    old.insertAdjacentHTML('afterend', rowHtml(a));
    var nu = old.nextElementSibling;
    old.remove();
    refreshCounts(nu, a);
  }

  function updateSummary() {
    var A = state.assets;
    var done = A.filter(function (a) { return a.title; }).length;
    var err = A.filter(function (a) { return a.status === 'error'; }).length;
    var sel = A.filter(function (a) { return a.sel; }).length;
    $('#summary').textContent = A.length
      ? A.length + ' aset · ' + done + ' punya metadata · ' + err + ' gagal · ' + sel + ' dipilih'
      : '—';
    var has = A.length > 0;
    $('#btnGenerate').disabled = !has || state.running;
    $('#btnBulk').disabled = !has;
    $('#btnRename').disabled = done === 0 || state.running;
    $('#btnCsvAdobe').disabled = done === 0;
    $('#btnCsvSS').disabled = done === 0;
    $('#btnGenerate').textContent = '2. Generate AI' + (sel ? ' (' + sel + ' dipilih)' : '');
  }

  function setProgress(done, total, label) {
    $('#barWrap').hidden = !total;
    $('#barFill').style.width = total ? Math.round(done / total * 100) + '%' : '0';
    $('#progressText').textContent = total ? (label || '') + ' ' + done + '/' + total : '';
  }

  /* ---------- generate AI ---------- */
  function currentKey() { return settings.provider === 'groq' ? settings.groqKey : settings.geminiKey; }
  function currentModel() { return settings.provider === 'groq' ? settings.groqModel : settings.geminiModel; }

  async function generateOne(a) {
    var file = await Files.getFile(a);
    var frames = a.kind === 'image' ? [await Files.imageToJpegDataUrl(file, 768, 0.8)] : await Files.videoFrames(file, 3, 768);
    var attempt = 0;
    while (true) {
      try {
        return await AI.generate({
          provider: settings.provider, key: currentKey(), model: currentModel(),
          frames: frames, context: $('#ctxInput').value, kind: a.kind
        });
      } catch (e) {
        attempt++;
        var retryable = e.status === 429 || e.status === 503 || e.status === 500;
        if (!retryable || attempt >= 4 || state.stop) throw e;
        a.error = 'Menunggu limit API… (percobaan ' + attempt + ')';
        updateRow(a);
        await sleep(15000 * attempt);
        a.error = '';
      }
    }
  }

  async function runGenerate(list) {
    if (!currentKey()) { toast('Isi API key dulu di Pengaturan.'); openSettings(); return; }
    if (!list.length) { toast('Tidak ada aset yang perlu diproses.'); return; }
    state.running = true; state.stop = false;
    $('#btnStop').hidden = false;
    updateSummary();
    var idx = 0, done = 0, nextSlot = 0;
    setProgress(0, list.length, 'Generate');

    async function worker() {
      while (!state.stop) {
        var a = list[idx++];
        if (!a) break;
        var now = Date.now();
        var slot = Math.max(now, nextSlot);
        nextSlot = slot + settings.intervalMs;
        if (slot > now) await sleep(slot - now);
        if (state.stop) break;
        a.status = 'working'; a.error = '';
        updateRow(a);
        try {
          var meta = await generateOne(a);
          a.title = meta.title; a.description = meta.description; a.keywords = meta.keywords;
          a.category = meta.category; a.ss = meta.ss; a.status = 'done';
          a.renamed = false; a.newName = '';
        } catch (e) {
          a.status = 'error'; a.error = e.message || String(e);
        }
        done++;
        updateRow(a);
        setProgress(done, list.length, 'Generate');
        saveMetaSoon();
      }
    }

    var n = Math.max(1, Math.min(6, settings.concurrency | 0));
    var workers = [];
    for (var i = 0; i < n; i++) workers.push(worker());
    await Promise.all(workers);

    // baris yang tersisa karena dihentikan kembali ke 'idle'
    state.assets.forEach(function (a) { if (a.status === 'working') { a.status = 'idle'; updateRow(a); } });
    state.running = false;
    $('#btnStop').hidden = true;
    setProgress(0, 0);
    updateSummary();
    toast(state.stop ? 'Dihentikan.' : 'Generate selesai.');
  }

  function targetsForGenerate() {
    var sel = state.assets.filter(function (a) { return a.sel; });
    if (sel.length) return sel;
    return state.assets.filter(function (a) { return a.status !== 'done' && !a.title; });
  }

  /* ---------- edit massal ---------- */
  function applyBulk() {
    var kws = Core.normKeywords($('#bKw').value);
    if (!kws.length) { toast('Isi keyword dulu.'); return; }
    var mode = $('#bMode').value;
    var targets = $('#bTarget').value === 'all' ? state.assets : state.assets.filter(function (a) { return a.sel; });
    if (!targets.length) { toast('Tidak ada baris terpilih.'); return; }
    targets.forEach(function (a) {
      if (mode === 'remove') a.keywords = a.keywords.filter(function (k) { return kws.indexOf(k) < 0; });
      else if (mode === 'prepend') a.keywords = Core.normKeywords(kws.concat(a.keywords));
      else a.keywords = Core.normKeywords(a.keywords.concat(kws));
      updateRow(a);
    });
    saveMetaSoon();
    toast('Keyword diperbarui di ' + targets.length + ' baris.');
  }

  /* ---------- rename ---------- */
  function renameTargets() { return state.assets.filter(function (a) { return a.title; }); }

  function openRename() {
    var t = renameTargets();
    if (!t.length) return;
    var names = Core.buildNames(t);
    $('#renameList').innerHTML = t.map(function (a, i) {
      return '<div>' + esc(a.name) + ' <span class="arrow">→</span> <span class="to">' + esc(names[i]) + '</span></div>';
    }).join('');
    $('#renameInfo').textContent = state.root
      ? t.length + ' file akan DISALIN ke subfolder "output" di dalam folder Anda. File asli tidak diubah.'
      : t.length + ' file: browser ini tidak bisa menulis folder, jadi gambar akan diunduh sebagai ZIP (video dilewati).';
    $('#dlgRename').dataset.names = JSON.stringify(names);
    $('#dlgRename').showModal();
  }

  async function applyRename() {
    var t = renameTargets();
    var names = Core.buildNames(t);
    state.running = true; updateSummary();
    try {
      if (state.root) {
        var out = await state.root.getDirectoryHandle('output', { create: true });
        for (var i = 0; i < t.length; i++) {
          setProgress(i, t.length, 'Menyalin');
          await Files.copyTo(out, t[i], names[i]);
          t[i].newName = names[i]; t[i].renamed = true;
          updateRow(t[i]);
        }
        toast('Selesai: ' + t.length + ' file disalin ke "output".', 5000);
      } else {
        var items = [];
        t.forEach(function (a, i) { if (a.kind === 'image') items.push({ asset: a, newName: names[i] }); });
        if (!items.length) { toast('Tidak ada gambar untuk di-ZIP.'); return; }
        var blob = await Files.zipImages(items, function (d, n) { setProgress(d, n, 'ZIP'); });
        items.forEach(function (it) { it.asset.newName = it.newName; it.asset.renamed = true; updateRow(it.asset); });
        download('renamed-images.zip', blob);
        toast('ZIP diunduh (' + items.length + ' gambar). Video tidak ikut.', 5000);
      }
    } catch (e) {
      toast('Rename gagal: ' + e.message, 6000);
    } finally {
      state.running = false;
      setProgress(0, 0);
      updateSummary();
      saveMetaSoon();
    }
  }

  /* ---------- ekspor CSV ---------- */
  function download(name, data) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8' });
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }

  async function exportCsv(key) {
    var t = state.assets.filter(function (a) { return a.title; });
    if (!t.length) return;
    var notRenamed = t.filter(function (a) { return !a.renamed; }).length;
    if (notRenamed && !confirm(notRenamed + ' aset belum di-rename, CSV akan memakai nama file asli. Lanjut?')) return;
    var warn = t.filter(function (a) { return Core.validate(a).length; }).length;
    if (warn && !confirm(warn + ' aset punya peringatan validasi (lihat teks oranye di tabel). Tetap ekspor?')) return;
    var assets = t.map(function (a) {
      return { finalName: finalName(a), title: a.title, description: a.description,
        keywords: a.keywords, category: a.category, ss: a.ss, kind: a.kind };
    });
    var files = Platforms[key].build(assets, { illustration: settings.illustration });
    for (var i = 0; i < files.length; i++) {
      download(files[i].name, files[i].csv);
      await sleep(350);
    }
    toast('CSV ' + Platforms[key].label + ' diunduh (' + files.map(function (f) { return f.name; }).join(', ') + ').', 5000);
  }

  /* ---------- pengaturan ---------- */
  function openSettings() {
    $('#sProvider').value = settings.provider;
    $('#sGeminiKey').value = settings.geminiKey;
    $('#sGeminiModel').value = settings.geminiModel;
    $('#sGroqKey').value = settings.groqKey;
    $('#sGroqModel').value = settings.groqModel;
    $('#sConc').value = settings.concurrency;
    $('#sInterval').value = settings.intervalMs;
    $('#sIllu').value = settings.illustration;
    $('#dlgSettings').showModal();
  }
  function saveSettings() {
    settings.provider = $('#sProvider').value;
    settings.geminiKey = $('#sGeminiKey').value.trim();
    settings.geminiModel = $('#sGeminiModel').value.trim() || DEFAULTS.geminiModel;
    settings.groqKey = $('#sGroqKey').value.trim();
    settings.groqModel = $('#sGroqModel').value.trim() || DEFAULTS.groqModel;
    settings.concurrency = Math.max(1, Math.min(6, parseInt($('#sConc').value, 10) || DEFAULTS.concurrency));
    settings.intervalMs = Math.max(0, parseInt($('#sInterval').value, 10) || 0);
    settings.illustration = $('#sIllu').value;
    localStorage.setItem('msh-settings', JSON.stringify(settings));
    toast('Pengaturan disimpan.');
  }

  /* ---------- event ---------- */
  function bind() {
    $('#btnPick').addEventListener('click', pickFolder);
    $('#fallbackInput').addEventListener('change', onFallback);
    $('#btnSettings').addEventListener('click', openSettings);
    $('#sSave').addEventListener('click', saveSettings);
    $('#btnGenerate').addEventListener('click', function () { runGenerate(targetsForGenerate()); });
    $('#btnStop').addEventListener('click', function () { state.stop = true; toast('Menghentikan setelah proses berjalan selesai…'); });
    $('#btnBulk').addEventListener('click', function () { $('#dlgBulk').showModal(); });
    $('#bApply').addEventListener('click', applyBulk);
    $('#btnRename').addEventListener('click', openRename);
    $('#rApply').addEventListener('click', function () { applyRename(); });
    $('#btnCsvAdobe').addEventListener('click', function () { exportCsv('adobe'); });
    $('#btnCsvSS').addEventListener('click', function () { exportCsv('shutterstock'); });

    $('#selAll').addEventListener('change', function (e) {
      state.assets.forEach(function (a) { a.sel = e.target.checked; });
      document.querySelectorAll('#rows .sel').forEach(function (c) { c.checked = e.target.checked; });
      updateSummary();
    });

    var rows = $('#rows');
    rows.addEventListener('input', function (e) {
      var el = e.target, tr = el.closest('tr');
      if (!tr || !el.dataset.f) return;
      var a = byId(tr.dataset.id);
      if (el.dataset.f === 'title') a.title = el.value;
      else if (el.dataset.f === 'description') a.description = el.value;
      else if (el.dataset.f === 'keywords') a.keywords = el.value.split(/[,\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      refreshCounts(tr, a);
      updateSummary();
      saveMetaSoon();
    });
    rows.addEventListener('change', function (e) {
      var el = e.target, tr = el.closest('tr');
      if (!tr) return;
      var a = byId(tr.dataset.id);
      if (el.classList.contains('sel')) { a.sel = el.checked; updateSummary(); return; }
      var f = el.dataset.f;
      if (f === 'category') a.category = parseInt(el.value, 10) || 0;
      else if (f === 'ss0' || f === 'ss1') {
        var i = f === 'ss0' ? 0 : 1;
        var cur = [$('[data-f="ss0"]', tr).value, $('[data-f="ss1"]', tr).value].filter(Boolean);
        a.ss = cur.filter(function (v, k) { return cur.indexOf(v) === k; });
        void i;
      }
      saveMetaSoon();
    });
    rows.addEventListener('focusout', function (e) {
      var el = e.target;
      if (el.dataset && el.dataset.f === 'keywords') {
        var a = byId(el.closest('tr').dataset.id);
        a.keywords = Core.normKeywords(el.value);
        el.value = a.keywords.join(', ');
        refreshCounts(el.closest('tr'), a);
        saveMetaSoon();
      }
    });
    rows.addEventListener('click', function (e) {
      if (e.target.classList.contains('regen')) {
        if (state.running) { toast('Tunggu proses yang sedang berjalan.'); return; }
        runGenerate([byId(e.target.closest('tr').dataset.id)]);
      }
    });
    window.addEventListener('beforeunload', function (e) {
      if (state.running) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  bind();
  updateSummary();
})();
