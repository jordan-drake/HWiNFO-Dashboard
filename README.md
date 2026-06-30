# HWiNFO Dashboard

A fully-local, **offline** dashboard for [HWiNFO](https://www.hwinfo.com/) sensor logs. Drop in one or more CSV exports and the app parses, stores, and charts them — so you can lay multiple logging sessions over the same axes and **see a thermal or power regression instead of diffing a spreadsheet**.

Everything runs in your browser. There are **no network calls of any kind** — your logs never leave your machine. Parsed data is cached locally in IndexedDB so reopening the app is instant.

> **What this is not:** it does not poll your hardware live or talk to HWiNFO directly — it reads the **CSV files HWiNFO exports**. Set HWiNFO to log to CSV, then load those files here. It's a log *analysis* tool, not a replacement for HWiNFO's own sensor panel.

## Features

- **HWiNFO CSV parser** that handles the format's real-world quirks — `DD.MM.YYYY` dates, quoted headers, trailing commas, duplicate column names (disambiguated with numeric suffixes), periodically repeated header rows, hardware-description rows, variable polling intervals, and Latin-1 (`windows-1252`) encoding for the `°C` degree symbol.
- **Multi-file comparison** — load several sessions and overlay them on shared axes to compare before/after a cooler swap, a repaste, an undervolt, or a driver change.
- **Interactive time-series charts** (Chart.js) with pan/zoom and a category-grouped **sensor selector** that stays usable even with 100+ columns.
- **Heatmap timeline** for spotting hot spots across a long session at a glance.
- **Briefing & comparison summary** panels — automatic high/low/average rollups and a plain-language readout of what changed between sessions.
- **Threshold alerts with auto-detected safe limits** — a built-in hardware-spec database infers sensible warn/critical temps and power limits for common Intel/AMD CPUs and NVIDIA/AMD GPUs, with generic fallbacks for unknown parts.
- **Automatic event detection** — throttling events (power/thermal limits) are surfaced from the log rather than buried in columns.
- **Export** — save charts and summaries to PDF (jsPDF + html2canvas) or re-export filtered data to CSV.
- **Persistent local storage** — loaded logs are kept in IndexedDB; no re-uploading between sessions.
- **Dark-themed, single-page** — built with React 19 + Vite + Tailwind.

## Tech stack

React 19 · Vite · Tailwind CSS · Chart.js (+ zoom plugin) · PapaParse · idb (IndexedDB) · jsPDF + html2canvas · Vitest

## Getting started

Requires Node.js 18+.

```bash
npm install      # install dependencies
npm run dev      # start the dev server (Vite)
npm run build    # production build to dist/
npm run preview  # preview the production build
npm test         # run the test suite (Vitest)
```

Then open the dev server URL, and load a HWiNFO CSV export.

### Producing a compatible CSV in HWiNFO

1. Open HWiNFO in **Sensors-only** mode.
2. Click the **Logging Start** button (the floppy-disk icon at the bottom of the sensor window) and choose a `.csv` destination.
3. Run your workload (game, benchmark, stress test).
4. Click **Logging Stop**, then load the resulting CSV here.

Repeat for a second configuration and load both files to compare them side by side.

## Privacy

There is no telemetry, no analytics, and no backend. The Content-Security-Policy in `index.html` restricts the app to `'self'` — it cannot make outbound requests even if a dependency tried to. CSV contents (including filenames and column headers) are treated strictly as **data**, never executed.

## License

[MIT](LICENSE) © Jordan Drake
