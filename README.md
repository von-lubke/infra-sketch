<div align="center">

# InfraSketch

**Tool diagram arsitektur infrastruktur cloud bergaya sketsa (*hand-drawn*) ala Excalidraw.**

Rancang topologi multi-cloud (AWS, GCP, Azure, Kubernetes, dan komponen generik), atur container VPC/Subnet/Cluster bersarang, hubungkan layanan dengan panah berlabel, lalu ekspor ke PNG beresolusi tinggi, SVG vektor, atau JSON langsung dari browser.

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=0F172A)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Rough.js](https://img.shields.io/badge/Rough.js-4.6-EC4899?style=for-the-badge)

![Multi-Cloud](https://img.shields.io/badge/Katalog-AWS%20%7C%20GCP%20%7C%20Azure%20%7C%20K8s%20%7C%20Generik-4F46E5?style=for-the-badge)
![Export](https://img.shields.io/badge/Export-PNG%20%7C%20SVG%20%7C%20JSON-059669?style=for-the-badge)
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

- **Tampilan Sketsa Ala Excalidraw (100% Offline-Ready)**: Dirender menggunakan [Rough.js](https://roughjs.com/) dengan font terbundel lokal (*Architects Daughter*, *JetBrains Mono*, *Plus Jakarta Sans*) sehingga tampil konsisten termasuk saat self-hosted offline di Docker.
- **Katalog Komponen Multi-Cloud (48 Komponen + 4 Container + 2 Anotasi)**:
  - **Container Grup Bersarang**: `VPC Network`, `Public Subnet`, `Private Subnet`, dan `K8s Cluster` — memindahkan VPC ikut memindahkan subnet & komponen di dalamnya.
  - **Generik (10)**: Client / Web, Load Balancer, App Server, Database SQL, Redis Cache, Message Queue, Object Storage, CDN Edge, WAF / Firewall, DNS Resolver.
  - **AWS (15)**: EC2, Lambda, ECS, EKS, API Gateway, CloudFront, Route 53, S3, RDS, DynamoDB, ElastiCache, SQS, SNS, Kinesis Stream, Cognito.
  - **GCP (10)**: Cloud Run, Cloud Functions, GKE, Cloud Load Balancing, Cloud Armor, Cloud SQL, Memorystore, Cloud Storage, BigQuery, Pub/Sub.
  - **Azure (8)**: Azure VM, Azure Functions, Azure AKS, Front Door, Blob Storage, Cosmos DB, Azure SQL DB, Service Bus.
  - **Kubernetes (5)**: K8s Ingress, K8s Service, K8s Pod, ConfigMap, Persistent Vol.
  - **Anotasi**: Sticky Note & Teks Bebas multi-baris (`T`).
- **Template Arsitektur Siap Pakai (6 Template)**:
  - `3-Tier Web App` (bawaan), `Microservices K8s`, `Serverless Cloud Pipeline`, `Event-Driven Streaming`, `Multi-Region Active-Active`, dan `Kanvas Kosong`.
- **Editor Produktivitas Ala Figma**:
  - **Multi-select & Marquee**: `Shift+Klik`, drag kotak seleksi di area kosong, dan `Ctrl+A`.
  - **`Ctrl+Drag` / `Alt+Drag` Duplikat**: Seret sambil menahan `Ctrl` (atau `Alt`) untuk menduplikat komponen/container beserta seluruh propertinya langsung ke posisi baru.
  - **Salin/Tempel Lintas Tab & Gaya**: `Ctrl+C/X/V`, `Ctrl+Alt+C/V` (Salin & Tempel Gaya), resize komponen dari 4 sudut, urutan lapisan (`]`/`[`), kunci posisi (`Ctrl+L`), nudge (`Arrow`/`Shift+Arrow`), serta menu klik kanan.
- **Konektor Cerdas**: Hubungkan node maupun container melalui 4 titik *anchor*, drag ujung panah untuk sambung ulang (*reconnect*), pilihan jalur *lengkung*, *lurus*, dan *siku (orthogonal)*, serta panah *1 arah*, *2 arah*, atau *tanpa panah*.
- **Export PNG, SVG, Clipboard & JSON**:
  - **Export PNG** (*auto-crop*, skala `1x/2x/3x`, latar putih/transparan, salin PNG langsung ke clipboard) & **Export SVG** (vektor dengan font tertanam).
  - Opsi **Ekspor hanya elemen terpilih**.
  - **Export & Import JSON** (`*.infrasketch.json` v2, kompatibel mundur dengan file v1).
- **Auto-Save Lokal**: Perubahan tersimpan otomatis di `localStorage` (`infrasketch:document:v1`) dan mendukung Undo/Redo hingga 40 langkah dengan *coalescing* untuk edit teks di panel properti.

---

## Tech Stack

| Kategori | Teknologi |
| :--- | :--- |
| **Framework UI** | React 19 + TypeScript 7 |
| **Build Tool** | Vite 8 + Tailwind CSS v4 |
| **Sketch Renderer** | Rough.js + SVG + HTML5 Canvas 2D |
| **Font Lokal** | `@fontsource/architects-daughter`, `@fontsource/jetbrains-mono`, `@fontsource/plus-jakarta-sans` |
| **Lint & Test** | Oxlint + Vitest |

---

## Cara Pasang (Instalasi)

### Prasyarat

- [Node.js](https://nodejs.org/) (dengan `npm`) — disarankan versi LTS terbaru
- atau [Bun](https://bun.sh/) (proyek ini menyertakan `bun.lock`)

### Langkah Instalasi

```bash
git clone https://github.com/von-lubke/infra-sketch.git
cd infra-sketch

# Pasang dependensi (Bun atau npm)
bun install   # atau: npm install

# Jalankan server pengembangan (http://localhost:3000)
bun run dev   # atau: npm run dev
```

### Build untuk Produksi

```bash
bun run build && bun run preview
# atau
npm run build && npm run preview
```

---

## Menjalankan dengan Docker

Repositori ini dilengkapi [Dockerfile](Dockerfile) multi-stage (`oven/bun:1-alpine` + `nginx:alpine` non-root di port `5758` dengan gzip & healthcheck) dan workflow CI [.github/workflows/docker.yml](.github/workflows/docker.yml).

```bash
docker build -t infrasketch .
docker run -d --name infrasketch -p 5758:5758 --restart unless-stopped infrasketch
```

Buka `http://localhost:5758` di browser.

---

## Cara Menggunakan

1. **Tambah Komponen, Container, atau Anotasi**: Seret dari sidebar kiri, klik item untuk tambah di tengah layar, atau tekan `T` (Catatan) / `G` (VPC).
2. **Duplikat Cepat (`Ctrl+Drag`)**: Tahan `Ctrl` (atau `Alt`) sambil menyeret node, container, atau beberapa elemen terpilih untuk menduplikat beserta propertinya.
3. **Hubungkan Layanan**: Tarik dari titik port di sisi komponen/container, atau aktifkan mode Konektor (`C`). Setelah terpilih, seret titik ujung panah untuk menyambung ulang.
4. **Edit Properti**: *Double-click* untuk edit cepat teks di kanvas, klik kanan untuk menu konteks, atau ubah ikon, tema warna, tipe jalur (`Lengkung`/`Lurus`/`Siku`), dan arah panah di panel kanan.
5. **Navigasi**: Two-finger scroll trackpad / `Space+Drag` / tool `H` untuk menggeser kanvas, `Ctrl+Scroll` (atau pinch) untuk zoom.
6. **Ekspor**: Klik **Export** untuk PNG, SVG, atau salin gambar ke clipboard, serta **Export/Import JSON** untuk cadangan dokumen.

---

## Pintasan Keyboard

| Pintasan | Fungsi |
| :--- | :--- |
| `V` / `H` / `C` / `T` | Pilih, Geser (Pan), Konektor, Catatan Teks |
| `G` | Tambah cepat container **VPC Network** |
| `Space + Drag` / `Scroll` | Geser kanvas (`Ctrl/⌘ + Scroll` untuk zoom) |
| `Ctrl + Drag` / `Alt + Drag` | Duplikat komponen/container beserta propertinya |
| `Shift + Klik / Drag` | Tambah seleksi atau buat kotak seleksi (marquee) |
| `Ctrl + A` | Pilih semua elemen |
| `Ctrl + C / X / V` | Salin, potong, dan tempel antar kanvas / tab |
| `Ctrl + D` | Duplikat elemen terpilih di tempat |
| `Ctrl + Alt + C / V` | Salin dan tempel gaya/warna properti |
| `Panah` / `Shift + Panah` | Geser presisi `1px` / `20px` |
| `]` / `[` | Bawa ke depan / kirim ke belakang (`Shift` = paling depan/belakang) |
| `Ctrl + L` | Kunci / buka kunci posisi |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo |
| `Ctrl + = / - / 0` | Zoom in, zoom out, reset `100%` |
| `?` | Buka dialog bantuan pintasan |
| `Delete` / `Backspace` / `Esc` | Hapus elemen terpilih / batalkan aksi |

---

## Struktur Proyek

```text
infra-sketch/
├── .github/workflows/docker.yml   # CI: typecheck, lint, test, build & push image Docker ke GHCR
├── Dockerfile                     # Multi-stage Docker (Bun builder + Nginx non-root port 5758)
├── index.html                     # Entry HTML
├── package.json                   # Dependensi & skrip
├── vite.config.ts                 # Konfigurasi Vite + Tailwind CSS v4
├── .oxlintrc.json                 # Konfigurasi Oxlint
└── src/
    ├── App.tsx                    # State dokumen, shortcut global, clipboard, & integrasi panel
    ├── main.tsx                   # Bootstrap React StrictMode & font lokal
    ├── index.css                  # Konfigurasi Tailwind v4 & font theme
    ├── types/diagram.ts           # Definisi tipe Node, Group, Text, Edge, Selection, & Export
    ├── hooks/useHistory.ts        # Reducer history murni dengan coalescing & deteksi no-op
    ├── data/
    │   ├── catalog.ts             # 7 tema warna, path ikon vektor, 4 container, & 48 komponen
    │   └── templates.ts           # 6 template arsitektur siap pakai
    ├── components/
    │   ├── Header.tsx             # Header 3-zona
    │   ├── CatalogSidebar.tsx     # Sidebar katalog collapsible dengan filter 5 provider
    │   ├── Canvas.tsx             # Kanvas SVG interaktif, marquee, Ctrl+Drag, & inline edit
    │   ├── InspectorPanel.tsx     # Panel properti tunggal & multi-select + pemilih ikon
    │   ├── ExportModal.tsx        # Modal export PNG, SVG, & salin ke clipboard
    │   ├── ContextMenu.tsx        # Menu konteks klik kanan
    │   ├── ShortcutHelpModal.tsx  # Modal daftar pintasan (`?`)
    │   └── InfraIcon.tsx          # Renderer ikon vektor SVG
    └── utils/
        ├── roughSvg.ts            # Generator path sketsa RoughJS
        ├── geometry.ts            # Anchor port, Bezier, orthogonal routing, bounds, & containment
        ├── diagramOps.ts          # Kloning, clipboard, nudge, z-order, & gaya
        ├── fonts.ts               # Embed WOFF2 lokal untuk export SVG offline
        └── exportImport.ts        # Validasi/migrasi JSON v1→v2, Canvas PNG, & SVG builder
```

---

## Skrip yang Tersedia

| Perintah (`bun run` / `npm run`) | Deskripsi |
| :--- | :--- |
| `dev` | Menjalankan server pengembangan Vite di port `3000` (`--host=0.0.0.0`) |
| `build` | Mem-build aplikasi produksi ke folder `dist/` |
| `preview` | Pratinjau lokal hasil `build` |
| `typecheck` | Pengecekan tipe TypeScript (`tsc --noEmit`) |
| `lint` | Pengecekan kode dengan Oxlint (`oxlint src`) |
| `test` | Menjalankan unit test dengan Vitest (`vitest run`) |
| `clean` | Menghapus direktori `dist/` |
