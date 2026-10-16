# DigSpice 4 Converter (ds4_convert)

> [!IMPORTANT]
> **【重要】統合版「DS Universal Suite」への機能移行・開発終了のお知らせ**
>
> 本ツール（`ds4_convert`）のログ変換機能は、ラップ比較・テレメトリ解析・ロガー設定機能を備えた統合版 **[DS Universal Suite](https://github.com/oud0n/ds_universal)** に統合されました。これに伴い、**本リポジトリ単体での開発・更新は終了予定**です。
>
> 今後は下記の GitHub Pages（ブラウザ版）をご利用ください：
> - **移行先 Web アプリ（ログ変換）**: **<https://oud0n.github.io/ds_universal/#convert>**
> - **DS Universal Suite トップ**: **<https://oud0n.github.io/ds_universal/>**
> - **統合先リポジトリ**: **<https://github.com/oud0n/ds_universal>**
>
> ---
> **Notice: Migrated to DS Universal Suite**
> The features of `ds4_convert` have been integrated into **[DS Universal Suite](https://github.com/oud0n/ds_universal)**, and standalone development of this repository is being discontinued. Please use the new browser version at **<https://oud0n.github.io/ds_universal/#convert>**.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/oud0n)

[日本語](#日本語) | [English](#english)

---

<a name="日本語"></a>
## 日本語

### 概要
> **お知らせ**: 本ツールの機能は統合版 **DS Universal Suite** に移行しました（単体での更新は終了予定）。今後は <https://oud0n.github.io/ds_universal/#convert> をご利用ください。

**DigSpice 4 Converter (ds4_convert)** は、デジスパイス4 (DigSpice 4) などのモータースポーツ向けGPSデータロガーのログファイル（`.bnx4`, `.bon4`, `.binx`, `.bon`, `.txt`, `.nmea`）を、標準的な **NMEA-0183 形式** をはじめとする各種データフォーマットに変換・解析・可視化できるWebアプリケーションです。

デジスパイスアプリのフォルダ内に記録される `.bon4` ファイル等を本アプリで変換し、**RaceChrono** などのモータースポーツ用解析アプリにインポートすることで、スマートフォン上で簡単にサーキットの**走行ライン解析やラップタイム比較**を行うことができます。

また、ブラウザ上でのインタラクティブなトラックプレビュー（地図・速度グラフ）や走行データの区間切り出し（トリミング）、タイムゾーン調整機能も備えています。

### 主な特徴
- **デジスパイス4（DigSpice 4）データ対応**:
  - デジスパイスアプリフォルダ内の `.bon4` ファイルやバイナリログ（`.bnx4`, `.bon4`, `.binx`, `.bon`）、各種NMEAテキストログを自動認識して高精度に解析。
- **RaceChrono等の解析アプリ連携 (NMEA / GPX / CSV)**:
  - **NMEA-0183 (`.nmea`)**: 各点について GGA、RMC の順に生成し、入力の GGA は時刻と Talker ID 以外のフィールドを保持。GGA を生成する場合、入力に無い標高・衛星数・HDOP・ジオイド高などは空欄（測位品質は 1）。バイナリ入力の実測標高・衛星数は保持。トークンID (`$GP` / `$GN`) の切り替えに対応し、RaceChrono等でそのまま走行ライン解析が可能。
  - **GPX (`.gpx`)**: 各種GPS解析アプリやサードパーティツール向けのトラック形式。
  - **CSV (`.csv`)**: ExcelやPython等のデータ分析に適した詳細テーブル形式。
  - **TXT (`.txt`)**: タイムスタンプ・位置・速度・方位のプレーンテキストデータ。
  - **HTML Map (`.html`)**: インタラクティブな地図（Leaflet）を組み込んだHTMLファイル（表示時に外部リソースを取得）。
- **走行データの可視化 & トリミング**:
  - ブラウザ上で走行軌跡（マップ）と速度グラフを表示し、ホバーした点の標高も表示。
  - トラックの開始時間・終了時間を視覚的に指定して必要なスティント・ラップ区間のみを抽出（トリミング）。
  - タイムゾーンオフセット（時差補正）の調整機能。
- **完全ローカル処理（安心のプライバシー保護）**:
  - データのデコードや変換処理はすべてユーザーのWebブラウザ内で完結。ログを外部サーバーへ送信しません。ただし、出力した HTML 地図を開くと Leaflet を CDN から、地図タイルを外部サービスから取得します。タイル取得時には閲覧地域に応じたリクエストが送信されます。

### 活用例: RaceChronoでの走行ライン解析
1. デジスパイスアプリのフォルダ内から記録データ（`.bon4` ファイル）を取り出します。
2. 本アプリで `.bon4` を読み込み、`NMEA`（または `GPX`）フォーマットでダウンロードします。
3. 変換したファイルをスマートフォンに転送し、**RaceChrono** のインポート機能で読み込むことで、スマホ画面上で走行ラインや速度変化の比較・解析が行えます。

### 使い方
1. ブラウザでアプリケーションを開きます。
2. デジスパイス4のファイル（`.bnx4`, `.bon4`, `.txt` 等）をドラッグ＆ドロップまたはファイル選択して読み込みます。
3. 必要に応じてトークンID (`$GP` / `$GN`)、タイムゾーン、トリミング範囲を設定します。
4. 「NMEAダウンロード」ボタンをクリックして、変換されたNMEAファイルを取得します。（GPX / CSV / HTML Map 等のダウンロードも可能）

### 開発・ローカル実行手順

#### 動作要件
- Node.js 18.0.0 以上
- npm

#### インストール & 起動
```bash
# リポジトリのクローン
git clone <repository-url>
cd ds4_convert

# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```
ブラウザで `http://localhost:3000` にアクセスしてください。

#### ビルド
```bash
npm run build
```

### 開発をサポート (Support & Donation)
本ツールがお役に立ちましたら、継続的な開発・保守のため **Buy Me a Coffee** にてサポート（寄付）していただけると大変励みになります！

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/oud0n)

---

<a name="english"></a>
## English

### Overview
> **Notice**: This tool has been integrated into **DS Universal Suite** and standalone development is being discontinued. Please use the browser version at <https://oud0n.github.io/ds_universal/#convert>.

**DigSpice 4 Converter (ds4_convert)** is a modern Web application designed to convert, parse, and visualize GPS log files from **DigSpice 4** motorsport data loggers (`.bnx4`, `.bon4`, `.binx`, `.bon`, `.txt`, `.nmea`) into standard **NMEA-0183 format** and other compatible formats.

By converting `.bon4` files recorded in the DigSpice app folder and importing them into mobile lap timer and analysis apps such as **RaceChrono**, drivers can easily analyze driving lines and compare telemetry directly on their smartphones.

It also features interactive track previews (maps and speed graphs), time-range trimming, and UTC timezone adjustment directly in the browser.

### Key Features
- **DigSpice 4 Data Support**:
  - Automatically parses `.bon4` files from the DigSpice app folder, binary log files (`.bnx4`, `.bon4`, `.binx`, `.bon`), and NMEA text logs.
- **Seamless Integration with RaceChrono & Telemetry Tools**:
  - **NMEA-0183 (`.nmea`)**: GGA followed by RMC for each point, preserving all input GGA fields except time and Talker ID. Generated GGA sentences leave missing altitude, satellite count, HDOP, geoid height, and other unrecorded fields blank (fix quality defaults to 1), and retain measured binary altitude and satellite counts, with selectable Talker IDs (`$GP` / `$GN`), fully compatible with RaceChrono for driving line analysis on smartphones.
  - **GPX (`.gpx`)**: Standard GPS Exchange Format for telemetry and mapping software.
  - **CSV (`.csv`)**: Structured tabular data ready for Excel and data analysis workflows.
  - **TXT (`.txt`)**: Space-separated timestamped coordinate and telemetry text output.
  - **HTML Map (`.html`)**: Interactive Leaflet HTML map file for track visualization (loads external resources when opened).
- **Data Visualization & Range Trimming**:
  - Interactive track map and speed graph, with altitude shown for the hovered point.
  - Visually trim start and end times to isolate specific laps or stints.
  - Custom UTC timezone offset adjustment.
- **100% Client-Side Processing (Privacy First)**:
  - All file decoding and conversion processes happen strictly within your browser. Logs are not uploaded to external servers. Opening an exported HTML map fetches Leaflet from a CDN and map tiles from external services; tile requests reflect the region being viewed.

### Use Case: Smartphone Driving Line Analysis with RaceChrono
1. Extract `.bon4` log files recorded inside the DigSpice application folder.
2. Load the `.bon4` file into **ds4_convert** and download the converted `NMEA` or `GPX` file.
3. Transfer the converted file to your smartphone and import it into **RaceChrono** to analyze driving lines and speed profiles on your phone.

### How to Use
1. Open the application in your web browser.
2. Drag and drop your DigSpice 4 log file (`.bnx4`, `.bon4`, `.txt`, etc.) into the drop zone.
3. Configure settings (Talker ID, Timezone Offset, or Time Range trimming).
4. Click **Download NMEA** to export the converted NMEA file (or choose GPX, CSV, TXT, or HTML Map).

### Local Development Setup

#### Prerequisites
- Node.js 18.0.0 or higher
- npm

#### Installation & Development
```bash
# Clone the repository
git clone <repository-url>
cd ds4_convert

# Install dependencies
npm install

# Start development server
npm run dev
```
Open `http://localhost:3000` in your browser.

#### Production Build
```bash
npm run build
```

### Support & Donation
If you find this project useful for your motorsport telemetry and track data analysis, please consider supporting its ongoing development and maintenance!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/oud0n)

---

### License
MIT
