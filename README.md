# Microstock Metadata Helper

Alat bantu berbasis browser (situs statis, tanpa server) untuk membuat metadata microstock:
analisis AI per aset, rename file otomatis, dan ekspor CSV Adobe Stock + Shutterstock.

## Pasang online gratis (pilih salah satu)

- **Netlify Drop**: buka app.netlify.com/drop, seret folder ini ke halaman itu.
- **Cloudflare Pages**: Create project → Direct Upload → unggah folder ini.
- **GitHub Pages**: unggah isi folder ke repo, aktifkan Pages dari branch utama.

Tidak ada langkah build. Situs harus lewat **https** (ketiganya otomatis).

## Cara pakai

1. Buka situs di **Chrome atau Edge** (desktop). Klik **Pengaturan**, isi API key Gemini (gratis di aistudio.google.com) atau Groq.
2. Klik **Pilih Folder**, pilih folder aset (JPG/PNG/MP4/MOV).
3. (Opsional) Isi **Konteks batch** supaya hasil konsisten, mis. "pola ornamen Natal seamless, motion graphic 4K loop".
4. Klik **Generate AI**. Centang baris lebih dulu kalau hanya ingin memproses sebagian. Tombol ↻ di tiap baris untuk generate ulang.
5. Periksa dan edit di tabel (judul, deskripsi, keyword, kategori). Teks oranye = peringatan validasi.
6. **Edit massal** untuk menambah/menghapus keyword di banyak baris sekaligus.
7. **Rename**: pratinjau, lalu terapkan. File disalin ke subfolder `output/` dengan nama dari judul; file asli tidak diubah.
8. **CSV Adobe** / **CSV Shutterstock**: unduh CSV, upload bersama file dari `output/`.

## Catatan

- Metadata tersimpan otomatis di browser per nama folder, jadi bisa dilanjutkan nanti.
- Tier gratis API punya batas permintaan. Kalau sering kena limit, naikkan "Jeda antar permintaan" atau turunkan "Paralel" di Pengaturan.
- Format kolom CSV ditulis dari spesifikasi yang ada saat ini. Kalau platform mengubah formatnya, sesuaikan di `js/platforms.js`.
- Platform baru: tambah satu entri di `js/platforms.js`.
- Firefox/Safari: bisa generate dan ekspor CSV, tetapi rename hanya lewat ZIP (gambar saja).
