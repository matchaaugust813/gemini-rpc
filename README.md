```text
███╗   ███╗ █████╗ ████████╗ ██████╗██╗  ██╗ █████╗   █████╗ ██╗   ██╗ ██████╗ ██╗   ██╗███████╗████████╗   █████╗    ██╗  ██████╗
████╗ ████║██╔══██╗╚══██╔══╝██╔════╝██║  ██║██╔══██  ██╔══██╗██║   ██║██╔════╝ ██║   ██║██╔════╝╚══██╔══╝  ██╔══██╗  ███║  ╚════██╗
██╔████╔██║███████║   ██║   ██║     ███████║███████║ ███████║██║   ██║██║  ███╗██║   ██║███████╗   ██║     ╚█████╔╝  ╚██║   █████╔╝
██║╚██╔╝██║██╔══██║   ██║   ██║     ██╔══██║██╔══██║ ██╔══██║██║   ██║██║   ██║██║   ██║╚════██║   ██║     ██╔══██╗   ██║   ╚═══██╗
██║ ╚═╝ ██║██║  ██║   ██║   ╚██████╗██║  ██║██║  ██║ ██║  ██║╚██████╔╝╚██████╔╝╚██████╔╝███████║   ██║     ╚█████╔╝   ██║  ██████╔╝
╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚══════╝   ╚═╝      ╚════╝    ╚═╝  ╚═════╝








╔══════════════════════════════════════════════════════════════════════════╗
║ made by : matchaaugust813                                                ║
║ tiktok  : matchaaugust_                                                  ║
╚══════════════════════════════════════════════════════════════════════════╝
```

# gemini-rpc

Discord Rich Presence untuk **Gemini CLI** (versi Gemini dari [claude-rpc](https://github.com/rar-file/claude-rpc)).
Menampilkan model, project, status live (working / thinking / waiting / idle), penggunaan token, **estimasi biaya (simulasi)**, kuota free tier, dan statistik lifetime di profil Discord kamu. Digerakkan oleh **hooks** bawaan Gemini CLI. Tanpa dependency (Node.js ≥ 18).

## Fitur

- Status live: `Thinking…`, `Running <tool>`, `Waiting on you`, `Idle`
- Token per sesi: input / output / cached / thoughts / total
- **Estimasi biaya** (USD + IDR) berdasarkan harga list API Gemini, murni **simulasi**. Free tier sebenarnya tidak ditagih.
- Penghitung kuota free tier harian (default 1000 request/hari, 60/menit; bisa diubah di config)
- Statistik lifetime: total token, waktu aktif, sesi, request, streak harian, grafik 14 hari
- Dashboard lokal di `http://localhost:4789` (hanya localhost)
- Pause / resume card tanpa uninstall

## Instalasi

```sh
cd gemini-rpc
npm link                       # atau jalankan: node bin/gemini-rpc.js <perintah>
```

### 1. Buat aplikasi Discord (sekali saja)
1. Buka <https://discord.com/developers/applications> → **New Application** (nama ini yang tampil sebagai "Playing …", mis. `Gemini CLI`).
2. Salin **Application ID**.
3. *Rich Presence → Art Assets*: upload gambar dengan key `gemini` (besar), serta `working`, `thinking`, `waiting`, `idle` (kecil). Key bisa diganti di `config.json`.

### 2. Pasang hooks
```sh
gemini-rpc setup --client-id <APPLICATION_ID>
```
Perintah ini menambahkan hooks ke `~/.gemini/settings.json` (backup otomatis ke `settings.json.gemini-rpc.bak`, hooks milikmu yang lain tidak disentuh). Restart Gemini CLI. Jika hooks nonaktif, jalankan `/hooks enable-all` di dalam Gemini CLI.

> Aplikasi **Discord desktop** harus berjalan. Discord versi browser tidak punya IPC lokal.
> Hooks butuh Gemini CLI **v0.26.0+**.

Daemon otomatis menyala saat sesi Gemini CLI dimulai.

### Coba tanpa Gemini CLI
```sh
gemini-rpc demo
```
Mensimulasikan sesi palsu (model berganti, tool jalan, token naik) supaya kamu bisa lihat card dan dashboard. Data demo tidak masuk statistik lifetime asli.

## Perintah

| Perintah | Fungsi |
|---|---|
| `setup [--client-id ID]` | pasang hooks + simpan Application ID |
| `uninstall` | hapus hooks milik gemini-rpc |
| `start` / `stop` | jalankan / hentikan daemon |
| `status` | state live, token, estimasi biaya |
| `stats` | statistik lifetime |
| `pause` / `resume` | sembunyikan / tampilkan card |
| `dashboard` | buka dashboard lokal |
| `demo` | sesi simulasi |

## Konfigurasi (`~/.gemini-rpc/config.json`)

```json
{
  "clientId": "123456789012345678",
  "dashboardPort": 4789,
  "idleAfterSec": 300,
  "showProject": true,
  "showCost": true,
  "idrRate": 16500,
  "freeTier": { "enabled": true, "dailyLimit": 1000, "perMinuteLimit": 60 },
  "pricing": { "gemini-2.5-pro": { "in": 1.25, "out": 10, "cache": 0.31 } }
}
```
`pricing` = USD per 1 juta token, menimpa tabel bawaan di `src/pricing.js`. Set `showProject: false` jika tidak mau nama folder tampil.

### Harga simulasi ala Claude

Secara bawaan, estimasi biaya dihitung memakai harga Claude (`"priceAs": "sonnet"`), walaupun modelnya Gemini free tier. Ganti di `config.json`:

| Nilai `priceAs` | Harga yang dipakai (per 1 juta token) |
|---|---|
| `"sonnet"` (bawaan) | Sonnet 5.5: $2 input, $10 output, cache $0,10 |
| `"opus"` | Opus 5.5: $4 input, $20 output, cache $0,20 |
| `"haiku"` | Haiku 5.5: $0,10 input, $0,50 output, cache $0,01 |
| `"fable"` | Fable 5.1: $10 input, $50 output, cache $1 (asumsi) |
| `""` | kembali ke tabel harga Gemini di `src/pricing.js` |

Claude Pro sendiri berlangganan flat per bulan dan tidak ditagih per token, jadi angka ini adalah nilai setara harga API, bukan tagihan.

## Cara kerja

```
Gemini CLI ──hook (stdin JSON)──▶ gemini-rpc hook ──▶ state.json + aggregate.json
                                                          │
                              daemon (Discord IPC + dashboard) ◀──┘
```

| Hook event | Efek |
|---|---|
| `SessionStart` | idle, auto-start daemon |
| `BeforeAgent` | thinking, `prompts++` |
| `BeforeModel` | thinking, `requests++` (hitungan kuota), catat model |
| `BeforeTool` / `AfterTool` | working `<tool>` / kembali thinking |
| `Notification` | waiting on you (minta izin tool) |
| `AfterAgent` | waiting on you, **hitung token & biaya** |
| `SessionEnd` | hapus card |

`AfterModel` sengaja tidak dipakai karena dipicu per potongan stream dan akan menjalankan proses berulang kali.

**Token:** dibaca dari file transcript sesi (`transcript_path` yang dikirim ke setiap hook), dijumlahkan per pesan model. Jika transcript tidak berisi data usage, dipakai estimasi kasar (~4 karakter = 1 token) dan ditandai `[estimated]`.

**Biaya (simulasi):** `(input − cached) × harga_input + cached × harga_cache + (output + thoughts) × harga_output`, per pesan sesuai modelnya. Tidak memodelkan tarif bertingkat untuk prompt panjang, Batch, atau grounding, jadi hanya perkiraan kasar.

## Batasan

- Hanya satu sesi yang ditampilkan sekaligus (sesi terbaru yang aktif).
- Format transcript Gemini CLI bisa berubah antar versi; parser sudah toleran (JSON & JSONL, `tokens` & `usageMetadata`), tapi kalau nol terus, cek `/tmp/gemini-rpc/daemon.log` dan struktur file transcript-mu.
- Angka kuota free tier hanya hitungan lokal dari hook, bukan data resmi dari Google.

## Hooks manual (jika `setup` gagal)

Tambahkan ke `~/.gemini/settings.json` untuk tiap event `SessionStart, SessionEnd, BeforeAgent, AfterAgent, BeforeModel, BeforeTool, AfterTool, Notification`:

```json
"hooks": {
  "BeforeAgent": [
    { "matcher": "*", "hooks": [
      { "name": "gemini-rpc", "type": "command", "timeout": 5000,
        "command": "node /path/ke/gemini-rpc/bin/gemini-rpc.js hook" }
    ] }
  ]
}
```

---

<sub>made by **matchaaugust813** · tiktok **matchaaugust_**</sub>
