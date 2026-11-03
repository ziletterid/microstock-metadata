/* platforms.js — pembuat CSV per platform. Tambah platform baru = tambah satu entri di Platforms. */
(function (g) {
  'use strict';

  function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function toCsv(header, rows) {
    return [header].concat(rows).map(function (r) { return r.map(q).join(','); }).join('\r\n') + '\r\n';
  }

  var Platforms = {
    adobe: {
      label: 'Adobe Stock',
      build: function (assets) {
        return [{
          name: 'adobe-stock.csv',
          count: assets.length,
          csv: toCsv(['Filename', 'Title', 'Keywords', 'Category', 'Releases'],
            assets.map(function (a) {
              return [a.finalName, a.title, a.keywords.join(','), a.category || '', ''];
            }))
        }];
      }
    },

    shutterstock: {
      label: 'Shutterstock',
      build: function (assets, opt) {
        opt = opt || {};
        var illu = opt.illustration === 'no' ? 'no' : 'yes';
        function row(a, withIllu) {
          var r = [a.finalName, a.description || a.title, a.keywords.join(','), (a.ss || []).join(','), 'no', 'no'];
          if (withIllu) r.push(illu);
          return r;
        }
        var imgs = assets.filter(function (a) { return a.kind === 'image'; });
        var vids = assets.filter(function (a) { return a.kind === 'video'; });
        var out = [];
        if (imgs.length) out.push({
          name: 'shutterstock-images.csv', count: imgs.length,
          csv: toCsv(['Filename', 'Description', 'Keywords', 'Categories', 'Editorial', 'Mature content', 'illustration'],
            imgs.map(function (a) { return row(a, true); }))
        });
        if (vids.length) out.push({
          name: 'shutterstock-videos.csv', count: vids.length,
          csv: toCsv(['Filename', 'Description', 'Keywords', 'Categories', 'Editorial', 'Mature content'],
            vids.map(function (a) { return row(a, false); }))
        });
        return out;
      }
    }
  };

  g.Platforms = Platforms;
  g.CsvUtil = { toCsv: toCsv, quote: q };
})(globalThis);
