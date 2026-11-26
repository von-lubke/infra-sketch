<div align="center">

# InfraSketch

**Tool diagram arsitektur infrastruktur cloud bergaya sketsa (*hand-drawn*) ala Excalidraw.**

Rancang topologi multi-cloud (AWS, GCP, Kubernetes, dan komponen generik), atur container VPC/Subnet/Cluster, hubungkan layanan dengan panah berlabel, lalu ekspor ke PNG beresolusi tinggi atau JSON langsung dari browser.

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=0F172A)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Rough.js](https://img.shields.io/badge/Rough.js-4.6-EC4899?style=for-the-badge)

![Multi-Cloud](https://img.shields.io/badge/Katalog-AWS%20%7C%20GCP%20%7C%20K8s%20%7C%20Generik-4F46E5?style=for-the-badge)
![Export](https://img.shields.io/badge/Export-PNG%20%26%20JSON-059669?style=for-the-badge)
![Runtime](https://img.shields.io/badge/Package_Manager-Bun%20%7C%20npm-0F172A?style=for-the-badge&logo=bun&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
[![Docker Build](https://img.shields.io/github/actions/workflow/status/von-lubke/infra-sketch/docker.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=Docker%20CI)](https://github.com/von-lubke/infra-sketch/actions/workflows/docker.yml)

</div>

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Cara Pasang (Instalasi)](#cara-pasang-instalasi)
- [Menjalankan dengan Docker](#menjalankan-dengan-docker)
- [Cara Menggunakan](#cara-menggunakan)
- [Pintasan Keyboard](#pintasan-keyboard)
- [Struktur Proyek](#struktur-proyek)
- [Skrip yang Tersedia](#skrip-yang-tersedia)

---

## Fitur Utama

- **Tampilan Sketsa Ala Excalidraw**: Dirender menggunakan [Rough.js](https://roughjs.com/) dengan garis bergaya gambar tangan (*hand-drawn*) dan perpaduan font *Architects Daughter* serta *JetBrains Mono*.
- **Katalog Komponen Multi-Cloud (28 Komponen + 4 Container)**:
  - **Container Grup**: `VPC Network`, `Public Subnet`, `Private Subnet`, dan `K8s Cluster` yang dapat diubah ukurannya dari empat sudut.
  - **Generik**: Client / Web, Load Balancer, App Server, Database SQL, Redis Cache, Message Queue, Object Storage, CDN Edge, WAF / Firewall, DNS Resolver.
  - **AWS**: AWS EC2, AWS Lambda, API Gateway, CloudFront, Amazon S3, Amazon RDS, Amazon SQS.
  - **GCP**: Cloud Run, Google GKE, Cloud SQL, Cloud Storage, BigQuery, Pub/Sub.
  - **Kubernetes (K8s)**: K8s Ingress, K8s Service, K8s Pod, ConfigMap, Persistent Vol.
- **Template Arsitektur Siap Pakai**:
  - `3-Tier Web App` (template bawaan saat pertama kali dibuka)
  - `Microservices K8s`
  - `Serverless Cloud Pipeline`
  - `Kanvas Kosong`
- **Konektor Fleksibel**: Hubungkan antar komponen melalui 4 titik *anchor* (atas, kanan, bawah, kiri) atau mode Konektor dengan dukungan label protokol, garis *solid*/*putus-putus*, jalur *lengkung*/*lurus*, panah satu/dua arah, dan tombol balik arah koneksi.
- **7 Tema Warna Sketsa**: Abu Netral, Indigo, Biru Cloud, Hijau Data, Kuning Amber, Ungu Network, dan Merah Security.
- **Export PNG & Import/Export JSON**:
  - **Export PNG** dengan *auto-crop*, pratinjau langsung, pilihan latar belakang (`Putih` atau `Transparan`), skala resolusi (`1x`, `2x`, `3x`), dan padding (`24px`, `40px`, `64px`).
  - **Export & Import JSON** (`*.infrasketch.json`) dengan validasi skema otomatis.
- **Auto-Save Lokal**: Perubahan diagram otomatis disimpan ke `localStorage` browser (`infrasketch:document:v1`) dan mendukung Undo/Redo hingga 40 langkah.

---

## Tech Stack

| Kategori | Teknologi |
| :--- | :--- |
| **Framework UI** | React 19 + TypeScript |
| **Build Tool** | Vite 8 |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`) |
| **Sketch Renderer** | Rough.js + SVG + HTML5 Canvas 2D |
| **Ikon** | Lucide React + Ikon vektor kustom (`Path2D` & SVG) |

---

## Cara Pasang (Instalasi)

### Prasyarat

Pastikan salah satu runtime/package manager berikut sudah terpasang di sistem Anda:
- [Node.js](https://nodejs.org/) (dengan `npm`) — disarankan versi LTS terbaru
- atau [Bun](https://bun.sh/) (proyek ini menyertakan `bun.lock`)

### Langkah Instalasi

1. **Clone repositori**

   ```bash
   git clone https://github.com/von-lubke/infra-sketch.git
   cd infra-sketch
   ```

2. **Pasang dependensi**

   Menggunakan **Bun**:
   ```bash
   bun install
   ```

   Atau menggunakan **npm**:
   ```bash
   npm install
   ```

3. **Jalankan server pengembangan**

   Menggunakan **Bun**:
   ```bash
   bun run dev
   ```

   Atau menggunakan **npm**:
   ```bash
   npm run dev
   ```

4. **Buka di browser**

   Aplikasi akan berjalan secara default di:
   ```text
   http://localhost:3000
   ```

> **Catatan Lingkungan (Opsional)**: Aplikasi berjalan sepenuhnya di sisi klien (*browser*) tanpa membutuhkan kunci API untuk membuat, mengedit, maupun mengekspor diagram. File `.env.example` disediakan sebagai referensi konfigurasi tambahan apabila Anda mengembangkan integrasi lanjutan, sedangkan variabel `DISABLE_HMR=true` dapat digunakan bila ingin menonaktifkan *Hot Module Replacement* pada `vite.config.ts`.

### Build untuk Produksi

```bash
# Menggunakan Bun
bun run build
bun run preview

# Atau menggunakan npm
npm run build
npm run preview
```

Hasil build statis akan dibuat di direktori `dist/` dan dapat disajikan lewat `vite preview` (buka URL yang ditampilkan di terminal) maupun *static hosting* pilihan Anda.

---

## Menjalankan dengan Docker

Repositori ini sudah dilengkapi [Dockerfile](Dockerfile) dan [.dockerignore](.dockerignore) dengan build *multi-stage* yang teroptimasi (`oven/bun:1-alpine` dengan *BuildKit cache mount* untuk build, serta `nginx:alpine` non-root pada port `5758` dengan kompresi gzip, cache aset statis, dan *healthcheck*).

### Build Lokal

```bash
# Build image produksi
docker build -t infrasketch .

# Jalankan kontainer pada port 5758
docker run -d --name infrasketch -p 5758:5758 --restart unless-stopped infrasketch
```

Buka `http://localhost:5758` di browser.

Untuk menghentikan dan menghapus kontainer:
```bash
docker stop infrasketch && docker rm infrasketch
```

### Build Otomatis via GitHub Actions (GHCR)

Setiap *push* ke branch `main` (atau tag `v*`) memicu workflow [.github/workflows/docker.yml](.github/workflows/docker.yml) untuk membangun image Docker dan mempublikasikannya ke GitHub Container Registry (`ghcr.io`):

```bash
# Tarik dan jalankan image terbaru dari GHCR
docker pull ghcr.io/von-lubke/infra-sketch:latest
docker run -d --name infrasketch -p 5758:5758 --restart unless-stopped ghcr.io/von-lubke/infra-sketch:latest
```

---

## Cara Menggunakan

### 1. Memulai dari Template atau Kanvas Kosong
- Saat pertama kali dibuka (jika belum ada riwayat di `localStorage`), InfraSketch langsung memuat template **3-Tier Web App**.
- Klik menu **Template Arsitektur** di bagian tengah header atas untuk beralih ke template `Microservices K8s`, `Serverless Cloud Pipeline`, atau `Kanvas Kosong`.
- Klik judul diagram di pojok kiri atas (di sebelah tulisan **InfraSketch**) untuk mengganti nama dokumen.

### 2. Menambahkan Komponen Cloud & Container Grup
- Gunakan kotak pencarian atau tab filter (`Semua`, `Generik`, `AWS`, `GCP`, `K8s`) pada **sidebar kiri**.
- **Seret & lepas (*drag-and-drop*)** item **Container Grup** (seperti `VPC Network`, `Public Subnet`, `Private Subnet`, `K8s Cluster`) atau **Komponen Cloud** langsung ke kanvas.
- Atau **klik langsung** item di sidebar untuk menambahkannya ke bagian tengah tampilan kanvas saat ini.
- Untuk mengubah ukuran container grup, klik container lalu tarik handle kotak di salah satu dari 4 sudutnya.

### 3. Menghubungkan Komponen dengan Panah
Ada dua cara untuk membuat konektor antar komponen:
1. **Tarik dari titik sisi (*Anchor Port*)**: Arahkan kursor ke salah satu node hingga muncul 4 titik kecil (atas, kanan, bawah, kiri), lalu klik dan tarik salah satu titik tersebut ke node tujuan.
2. **Mode Konektor (`C`)**: Klik tombol **Konektor** pada toolbar melayang di atas kanvas (atau tekan `C`), klik komponen awal, lalu klik komponen tujuan.

### 4. Mengedit Label & Properti
- **Edit Teks Cepat**: *Double-click* langsung pada node, label container grup, atau label panah konektor untuk mengetik teks baru (`Enter` untuk menyimpan, `Esc` untuk membatalkan).
- **Panel Properti (Sidebar Kanan)**: Klik elemen apa pun di kanvas untuk membuka panel properti kontekstual:
  - **Komponen**: Ubah *Label Layanan*, *Spesifikasi / Port*, warna sketsa, duplikat, atau hapus.
  - **Container**: Ubah *Nama VPC / Subnet*, *CIDR / Region*, lihat dimensi (`px`), ubah warna sketsa, duplikat, atau hapus.
  - **Konektor**: Ubah *Label Aliran / Protokol* (mis. `HTTPS`, `gRPC`, `TCP 5432`), *Gaya Garis* (`Solid` / `Putus-putus`), *Bentuk Jalur* (`Lengkung` / `Lurus`), *Arah Panah* (`Satu Arah` / `Dua Arah`), serta tombol **Balik Arah Koneksi**.

### 5. Navigasi Kanvas & Presisi Tata Letak
- **Geser Kanvas (*Pan*)**: Pilih alat **Geser** (`H`), tahan tombol `Space` sambil menyeret kanvas, gunakan klik tengah mouse, atau seret area kosong kanvas.
- **Zoom & Fit-to-View**: Gunakan *scroll wheel* mouse atau panel kontrol di pojok kiri bawah (`-`, persentase zoom untuk reset `100%`, `+`, dan tombol *Fit-to-View*).
- **Snap to Grid**: Aktifkan/nonaktifkan tombol **Snap** di pojok kiri bawah untuk menempelkan posisi elemen ke grid `20px`.

### 6. Simpan, Bagikan & Ekspor Diagram
- **Export JSON**: Klik **Export JSON** di kanan atas untuk mengunduh diagram sebagai file `<nama-diagram>.infrasketch.json`.
- **Import JSON**: Klik **Import JSON** dan pilih file `.json` InfraSketch untuk memuat ulang diagram ke kanvas.
- **Export PNG**: Klik **Export PNG** untuk membuka dialog pratinjau, pilih latar belakang (`Putih` / `Transparan`), skala (`1x` / `2x` / `3x`), dan padding (`24px` / `40px` / `64px`), lalu klik **Unduh PNG**.

---

## Pintasan Keyboard

| Pintasan | Fungsi |
| :--- | :--- |
| `V` | Aktifkan alat **Pilih** (*Select*) |
| `H` | Aktifkan alat **Geser** (*Pan*) |
| `Space` (tahan + seret) | Geser kanvas sementara |
| `C` | Aktifkan/nonaktifkan alat **Konektor** |
| `G` | Tambah cepat container **VPC Network** |
| `Ctrl + Z` / `Cmd + Z` | Undo (urungkan perubahan) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo (ulangi perubahan) |
| `Ctrl + D` / `Cmd + D` | Duplikat komponen atau container terpilih |
| `Delete` / `Backspace` | Hapus elemen yang sedang dipilih |
| `Esc` | Batalkan seleksi, mode konektor, atau edit teks |
| `Double-click` | Edit teks label komponen, container, atau konektor |

---

## Struktur Proyek

```text
infra-sketch/
├── .github/
│   └── workflows/
│       └── docker.yml          # Workflow GitHub Actions untuk build & push image Docker ke GHCR
├── Dockerfile                  # Konfigurasi multi-stage Docker (Bun builder + Nginx non-root port 5758)
├── .dockerignore               # Pengecualian file dari build context Docker
├── index.html                  # Entry HTML + Google Fonts (Plus Jakarta Sans, Architects Daughter, JetBrains Mono)
├── package.json                # Daftar dependensi & skrip Vite/TypeScript
├── vite.config.ts              # Konfigurasi Vite + Tailwind CSS v4
├── tsconfig.json               # Konfigurasi TypeScript
├── .env.example                # Contoh variabel lingkungan
└── src/
    ├── App.tsx                 # State dokumen, history undo/redo, auto-save localStorage, & shortcut global
    ├── main.tsx                # Bootstrap React root
    ├── index.css               # Konfigurasi Tailwind v4, font theme, dan scrollbar
    ├── types/
    │   └── diagram.ts          # Definisi tipe Node, Group, Edge, DiagramDocument, Viewport, & Export
    ├── data/
    │   ├── catalog.ts          # 7 tema warna, path ikon vektor, 4 grup container, & 28 komponen multi-cloud
    │   └── templates.ts        # 4 template arsitektur siap pakai
    ├── components/
    │   ├── Header.tsx          # Header 3-zona: judul editable, pemilih template, import/export
    │   ├── CatalogSidebar.tsx  # Sidebar katalog dengan pencarian, filter provider, & drag-and-drop
    │   ├── Canvas.tsx          # Kanvas SVG interaktif, toolbar melayang, konektor, zoom/pan, & inline edit
    │   ├── InspectorPanel.tsx  # Panel properti kontekstual untuk node, container, & konektor
    │   ├── ExportPngModal.tsx  # Modal pratinjau & pengaturan export PNG (latar, skala, padding)
    │   └── InfraIcon.tsx       # Komponen renderer ikon vektor SVG
    └── utils/
        ├── roughSvg.ts         # Generator path bergaya sketsa RoughJS untuk SVG
        ├── geometry.ts         # Kalkulasi anchor port, kurva Bezier, panah, snap grid, & bounding box
        └── exportImport.ts     # Validasi/export JSON & rendering HTML5 Canvas 2D untuk PNG
```

---

## Skrip yang Tersedia

| Perintah (`bun run` / `npm run`) | Deskripsi |
| :--- | :--- |
| `dev` | Menjalankan server pengembangan Vite di port `3000` (`--host=0.0.0.0`) |
| `build` | Mem-build aplikasi untuk produksi ke folder `dist/` |
| `preview` | Menjalankan pratinjau lokal dari hasil `build` produksi |
| `lint` | Menjalankan pengecekan tipe TypeScript (`tsc --noEmit`) |
| `clean` | Menghapus direktori `dist/` dan file `server.js` (jika ada) |
