/* files.js — jenis file, thumbnail, frame video, salin (rename) ke folder output, ZIP */
(function (g) {
  'use strict';

  var IMAGE_EXT = ['jpg', 'jpeg', 'png'];
  var VIDEO_EXT = ['mp4', 'mov', 'm4v'];

  function extOf(name) {
    var m = /\.([^.]+)$/.exec(name || '');
    return m ? '.' + m[1].toLowerCase() : '';
  }
  function kindOf(name) {
    var e = extOf(name).slice(1);
    if (IMAGE_EXT.indexOf(e) >= 0) return 'image';
    if (VIDEO_EXT.indexOf(e) >= 0) return 'video';
    return null;
  }

  function scaleSize(w, h, maxSide) {
    var s = Math.min(1, maxSide / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }

  async function imageToJpegDataUrl(file, maxSide, quality) {
    maxSide = maxSide || 768;
    var bmp = await createImageBitmap(file);
    var d = scaleSize(bmp.width, bmp.height, maxSide);
    var c = document.createElement('canvas');
    c.width = d.w; c.height = d.h;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, d.w, d.h);
    ctx.drawImage(bmp, 0, 0, d.w, d.h);
    if (bmp.close) bmp.close();
    return c.toDataURL('image/jpeg', quality || 0.8);
  }

  function seekTo(v, t) {
    return new Promise(function (res, rej) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; rej(new Error('Seek video timeout')); } }, 15000);
      v.onseeked = function () { if (!done) { done = true; clearTimeout(timer); res(); } };
      v.currentTime = t;
    });
  }

  async function videoFrames(file, count, maxSide) {
    count = count || 3; maxSide = maxSide || 768;
    var url = URL.createObjectURL(file);
    try {
      var v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      v.src = url;
      await new Promise(function (res, rej) {
        v.onloadeddata = res;
        v.onerror = function () { rej(new Error('Video tidak bisa dibaca browser (cek codec; H.264 MP4 paling aman)')); };
      });
      var d = isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
      var times = [];
      if (count === 1) times = [d / 2];
      else for (var i = 0; i < count; i++) times.push(d * (0.1 + 0.8 * i / (count - 1)));
      var out = [];
      for (var j = 0; j < times.length; j++) {
        await seekTo(v, times[j]);
        var sz = scaleSize(v.videoWidth || 640, v.videoHeight || 360, maxSide);
        var c = document.createElement('canvas');
        c.width = sz.w; c.height = sz.h;
        c.getContext('2d').drawImage(v, 0, 0, sz.w, sz.h);
        out.push(c.toDataURL('image/jpeg', 0.8));
      }
      return out;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function makeThumb(file, kind) {
    if (kind === 'image') return imageToJpegDataUrl(file, 160, 0.7);
    return (await videoFrames(file, 1, 160))[0];
  }

  async function getFile(asset) {
    return asset.file || asset.handle.getFile();
  }

  /* salin satu file ke folder tujuan dengan nama baru (streaming, aman untuk video besar) */
  async function copyTo(dirHandle, asset, newName) {
    var src = await getFile(asset);
    var fh = await dirHandle.getFileHandle(newName, { create: true });
    var w = await fh.createWritable();
    await src.stream().pipeTo(w);
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Gagal memuat ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* fallback tanpa File System Access API: ZIP (hanya untuk gambar) */
  async function zipImages(items, onProgress) {
    if (!g.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    var zip = new g.JSZip();
    for (var i = 0; i < items.length; i++) {
      zip.file(items[i].newName, await getFile(items[i].asset));
      if (onProgress) onProgress(i + 1, items.length);
    }
    return zip.generateAsync({ type: 'blob', compression: 'STORE' });
  }

  g.Files = {
    extOf: extOf, kindOf: kindOf, imageToJpegDataUrl: imageToJpegDataUrl, videoFrames: videoFrames,
    makeThumb: makeThumb, getFile: getFile, copyTo: copyTo, zipImages: zipImages
  };
})(globalThis);
