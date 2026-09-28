# HANDOFF — Tách module SERVICES (Ops Console) ra repo riêng

> ## ⚠️ TRẠNG THÁI — ĐÃ THI CÔNG XONG, KHÁC KẾ HOẠCH BAN ĐẦU
>
> Tài liệu này là **bản kế hoạch đầy đủ** (inventory module gốc). App thực tế đã được dựng tại
> **`D:\PhanLeThien\Control`** theo yêu cầu rút gọn của người dùng — **khác** bản kế hoạch này ở
> nhiều điểm. Đọc **§12** ngay bên dưới để biết chính xác đã làm gì; các mục §1–§11 giữ nguyên
> giá trị tham chiếu cho module gốc.
>
> **Điểm khác biệt cốt lõi:** bỏ 5 service (software-domain, software-lan, medic, sneat, forgejo),
> Docker/tunnel/tailscale chỉ còn **check health** (bỏ start/stop), thêm **UniPrep**
> (`D:\Bach_Khoa\DATH\UniPrep`) ở repo ngoài platform, bỏ hẳn LAN (chỉ `127.0.0.1`), bỏ sidebar +
> dark-only, deploy **detached**, thêm probe `docker info`, bỏ endpoint `GET /:id`.

---

## 12. THỰC TẾ ĐÃ LÀM (D:\PhanLeThien\Control)

### 12.1 Catalog cuối cùng — 5 mục

| # | `id` | Name | Root | Start/Stop/Deploy | Health probe | Open |
|---|---|---|---|---|---|---|
| 1 | `docker-desktop` | Docker Desktop | platform | ❌ chỉ check | `process://com.docker.backend.exe` + `command://docker-info` (`docker info`, expect `Server Version`) | — |
| 2 | `tunnel` | Cloudflare Tunnel | platform | ❌ chỉ check | `process://cloudflared.exe` | — |
| 3 | `tailscale` | Tailscale | platform | ❌ chỉ check | `command://tailscale-status` (JSON `BackendState==Running`) | — |
| 4 | `map` | Map | platform, `dir: 'map'` | ✅ | `http://127.0.0.1:2510/api/health` (`ok`) | `:2510` |
| 5 | `uniprep` | UniPrep | **repo**, `dir: 'UniPrep'` | ✅ | `:3000` (API) + `:5173` (FE) | `:5173` |

`map` giữ `deployArgs: ['nopause']`; `uniprep` để trống (`deploy.bat` của UniPrep không có `pause`).

### 12.2 Khác kế hoạch §7 — cụ thể

| Hạng mục | Kế hoạch ban đầu | Đã làm |
|---|---|---|
| Vị trí repo | không chốt | `D:\PhanLeThien\Control` (sibling của `map`, `tunnel`) |
| Catalog | copy 10 service | **5 mục** (§12.1) |
| `PLATFORM_ROOT` | bắt buộc, fail-fast nếu thiếu | **tự dò** thư mục cha + dò ngược 6 cấp, có cờ `verified`; env chỉ để override. Log in root khi khởi động |
| Repo ngoài platform | không có | thêm trục `root: 'platform' \| 'repo' \| 'control'` + `REPO_ROOT` cho UniPrep |
| Port | BE 2418 / dev 2110 / FE 2414 | y nguyên + `HOST=127.0.0.1` |
| LAN | `lanHost` hard-code IP Tailscale | **bỏ hẳn**; `resolveOpenUrl` luôn `http://127.0.0.1:<port>` |
| Deploy | chờ (`runWait`) | **detached**, trả `async: true` ngay; override được theo từng action |
| Health | tự `checkAll()` khi vào trang | **chỉ khi bấm Refresh** (hoặc click 1 dòng) |
| `actionStatus` so khớp chuỗi | khuyến nghị thay bằng mã lỗi | **đã làm** — `code: UNKNOWN_SERVICE \| NOT_ALLOWED \| BUSY \| SCRIPT_MISSING \| SCRIPT_UNSUPPORTED \| SPAWN_FAILED \| EXIT_NONZERO` |
| `GET /api/services/:id` | khuyến nghị bỏ | **đã bỏ** (không còn rò rỉ đường dẫn script) |
| `db.ts` / Mongo | bỏ `connectDb()` | bỏ luôn file; deps chỉ còn `cors`, `dotenv`, `express` |
| Sidebar + theme toggle | tuỳ chọn | bỏ hẳn; **dark-only**, không tạo `AppThemeContext` |
| CORS | `origin: true` | whitelist `127.0.0.1` / `localhost` / `::1` |
| DTO list | giữ `dir`, `scripts` | thêm `dir` + `scriptsPresent` → UI cảnh báo **thiếu script** và **root sai** |

### 12.3 Endpoint cuối cùng

```
GET  /health                          # { status, roots }
GET  /api/services/config             # controlRoot, host, probeTimeoutMs, roots[]
GET  /api/services                    # catalog, KHÔNG probe
POST /api/services/check              # probe tất cả
POST /api/services/:id/check          # probe 1
POST /api/services/:id/start          # nền  → 200 { async: true }
POST /api/services/:id/stop           # chờ  → 200 { stdout, exitCode }
POST /api/services/:id/deploy         # nền  → 200 { async: true }
```

`404` unknown · `403` not allowed · `409` busy / script missing / exit ≠ 0.

### 12.4 File đã tạo

```
D:\PhanLeThien\Control\
├─ README.md  package.json  .gitignore
├─ deploy\{deploy.bat, start.bat, start-prod.bat, start-prod.vbs, stop.bat}
├─ backend\
│  ├─ package.json  tsconfig.json  vitest.config.ts  .env.example
│  ├─ src\{index.ts, app.ts}
│  │  ├─ config\services.ts
│  │  ├─ routes\services.ts
│  │  └─ services\{ops-catalog.ts, ops-probe.ts, ops-lifecycle.ts}
│  └─ tests\{setup.ts, ops-catalog.test.ts, ops-probe.test.ts, ops-lifecycle.test.ts}
└─ frontend\
   ├─ package.json  tsconfig.json  vite.config.ts  tailwind.config.js  postcss.config.js  index.html
   ├─ public\Favicon.jpg
   └─ src\{main.tsx, App.tsx, api.ts, types.ts, index.css, test-setup.ts, vite-env.d.ts}
      ├─ lib\antd-message.ts
      └─ pages\services\{index.tsx, services.css, index.test.tsx, sortServices.test.ts}
```

**Không** tạo: `db.ts`, `models/`, `context/AppThemeContext.tsx`. `index.css` mới chỉ giữ biến dark cần thiết.

### 12.5 Kết quả kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| `backend` `tsc --noEmit` | ✅ exit 0 |
| `backend` `npm test` | ✅ **44 test / 3 file pass** |
| `frontend` `tsc --noEmit` | ✅ exit 0 |
| `frontend` `npm test` | ✅ **9 test / 2 file pass** |
| `frontend` `npm run build` | ✅ 3115 modules, `dist/` 841 kB JS |
| `backend` `npm run build` | ✅ `dist/` 7 file JS |
| `GET /health` | ✅ `PLATFORM_ROOT=D:\PhanLeThien [auto (thư mục cha của repo)]` · `REPO_ROOT=D:\Bach_Khoa\DATH` |
| `GET /api/services` | ✅ 5 mục, `health.probed=false` toàn bộ |
| `POST /api/services/check` | ✅ probe thật: docker process+engine Down, cloudflared Down, tailscale `BackendState=NoState`, map/uniprep `fetch failed` (chưa bật) |
| `GET /` | ✅ 200, `text/html`, title `Control` |
| `GET /bat-ky` (SPA fallback) | ✅ 200 |
| `GET /api/services/map` | ✅ **404** (đã bỏ endpoint) |
| `POST /api/services/khong-ton-tai/start` | ✅ **404** `UNKNOWN_SERVICE` |
| `POST /api/services/docker-desktop/start` | ✅ **403** `NOT_ALLOWED` |
| `POST /api/services/tunnel/stop` | ✅ **403** `NOT_ALLOWED` |

Test đáng chú ý:
- `ops-catalog.test.ts` — chốt **đúng 5 id**; docker/tunnel/tailscale không start/stop/deploy được;
  **script của mọi service được phép điều khiển phải tồn tại thật trên đĩa**.
- `ops-lifecycle.test.ts` — chốt `map.start` = `wscript //B` + `detached:true` + `unref()`;
  `map.stop` **không** detach và trả `exitCode` thật; `deploy` truyền `nopause`; lock `BUSY` hoạt động.
- `ops-probe.test.ts` — chốt hành vi **404 vẫn tính là online**; `docker info` expect `Server Version`;
  Tailscale `BackendState` khớp / không khớp / JSON hỏng.
- `index.test.tsx` — chốt **mở trang KHÔNG probe** (chỉ gọi list) và 3 service infra **không có nút thao tác**.

### 12.6 Việc còn lại

1. **`Software_lan` vẫn còn module Services cũ** (`pages/services/`, 3 file `ops-*`,
   `config/services.ts`, `routes/services.ts`, 3 type `Ops*`, 6 hàm API, route + lazy import trong
   `App.tsx`, `TAB_PATHS.services`). **Chưa xoá** — chờ xác nhận (D7 §9).
2. Control chưa có `backend\.env` (chưa cần — auto-detect đúng; tạo khi muốn override).
3. Repo Control chưa `git init`.
4. `map` / `uniprep` chưa chạy thật để test Start/Stop/Deploy end-to-end (tránh build thật khi test).
5. `UniPrep\deploy\deploy.bat` đang được gọi **không arg** (mặc định branch `main`) — thêm arg khi cần branch khác.

---

> **Người nhận (kế hoạch gốc):** agent/dev thực hiện việc tách trong repo mới.
> **Nguồn tham chiếu (read-only, KHÔNG sửa):** `D:\PhanLeThien\Software_lan`
> **Repo nguồn (git):** `https://git.phanlethien.xyz/idoadmin/Software_lan.git`
> **Commit đã kiểm tra:** `63e37a088015b1109d12542b6bfa4e97898aa751` (2026-09-09, nhánh `main`, working tree **dirty**: `backend/src/routes/music.ts`, `frontend/src/hooks/useLibrary.ts(.test.ts)`, `frontend/src/pages/music/EditTrackModal.tsx` đang sửa) → **copy theo đĩa, không copy theo commit**.
> **Mục tiêu:** tách module **Services** (bảng điều khiển vận hành LAN: start / deploy / stop / health-check các app anh em trong `D:\PhanLeThien`) thành app độc lập.
> **Khác biệt căn bản với 3 module đã tách trước (Music / Offline Library / …):** module này **KHÔNG có MongoDB**, **KHÔNG có blob**, **KHÔNG có dữ liệu người dùng**. Nó là một **bảng điều khiển chạy script** — quyền năng thật nằm ở việc `spawn` các `.vbs`/`.bat` trong `D:\PhanLeThien\<app>\deploy\`. Đây là module **nguy hiểm nhất** trong repo xét theo bề mặt tấn công.
> Toàn bộ đường dẫn là **đường dẫn tuyệt đối** trên máy hiện tại.

---

## 0. Tóm tắt nhanh

| Hạng mục | Hiện trạng | Sau khi tách |
|---|---|---|
| Bản chất module | Web app 1 trang: bảng 10 service + nút Start/Deploy/Stop + probe port/process | App độc lập 1 trang |
| Backend | **4 file, 627 dòng, ZERO phụ thuộc ngoài** (không DB, không model, không blob) | Copy nguyên 4 file + rút `app.ts`/`index.ts`. **Không cần `db.ts`** |
| Frontend | 2 file (`index.tsx` 463 dòng + `services.css` 111 dòng) + 4 type + 6 hàm API | Copy gần nguyên + viết lại shell |
| Dữ liệu | **Không có.** Catalog hard-code 10 service trong `ops-catalog.ts` | Giữ nguyên; cân nhắc chuyển sang JSON để thêm service không cần build |
| DB | **Không dùng MongoDB** | Bỏ hẳn `connectDb()` khỏi bootstrap |
| Blob | **Không có.** Chỉ *trỏ tới* file script của app khác | Giữ đúng biến `PLATFORM_ROOT` |
| Tool ngoài | `wscript.exe`, `cmd.exe`, `tasklist`, `tailscale.exe` | Có sẵn trên Windows, không cần cài |
| Env bắt buộc | **`PLATFORM_ROOT` (hoặc `ROOT`)** — nếu không set, app tự suy ra bằng đường dẫn tương đối và **sẽ sai sau khi tách** | **Phải set tường minh** — xem §6.1 |
| Blocker chính | `SERVICES_CONFIG.root` suy ra `D:\PhanLeThien` bằng `path.resolve(here, '../../..')` — **công thức này vỡ ngay khi đổi vị trí repo** | Set `PLATFORM_ROOT=D:\PhanLeThien` trong `.env` **và** trong launcher prod |
| Test hiện có | **KHÔNG có test nào** cho module này | Phải viết mới — xem §7.3 |
| Rủi ro cao nhất | Endpoint không auth có thể **chạy script tuỳ ý trên máy** (deploy = build + kill + restart app khác) | Xem §8.1 — cân nhắc bind `127.0.0.1` thay vì LAN |

---

## 1. Kiến trúc hiện tại (điểm nối)

### 1.1 Backend

`D:\PhanLeThien\Software_lan\backend\src\app.ts`:

```ts
// dòng 15
import { createServicesRouter } from './routes/services.js'
// dòng 48
app.use('/api/services', createServicesRouter())
```

Router là **factory không tham số** — khác mọi router khác trong `app.ts` (đều nhận `imgDir`/`musicFolder`/…). Đây là module duy nhất **không cần truyền config qua `createApp()`**, vì nó đọc `SERVICES_CONFIG` trực tiếp từ `config/services.ts`.

`D:\PhanLeThien\Software_lan\backend\src\index.ts` — bootstrap hiện tại:

```ts
connectDb().then(() => { const app = createApp(); app.listen(PORT ?? 2108) })
```

⚠️ **Sau khi tách phải bỏ `connectDb()`** — module Services không dùng Mongo. Giữ lại sẽ khiến app mới **không khởi động được khi MongoDB tắt** (`process.exit(1)`). Xem §7.2.

### 1.2 Frontend

`D:\PhanLeThien\Software_lan\frontend\src\App.tsx`:
- dòng 29: `const ServicesPage = lazy(() => import('./pages/services'))`
- dòng 288: `<Route path="/services" element={<ServicesPage />} />`

`D:\PhanLeThien\Software_lan\frontend\src\routes\paths.ts` (dòng 13): `services: '/services'` trong `TAB_PATHS`, và `'services'` trong `isTab()`.

`D:\PhanLeThien\Software_lan\frontend\src\components\Sidebar\Sidebar.tsx` (dòng 116-118): tab `'services'`, `title: 'Services'`, `shortLabel: 'Ops'`. Type `Tab` (dòng 3) cũng liệt kê `'services'`.

**Module này chỉ phụ thuộc:** `api.ts`, `types.ts`, `services.css`, và 4 biến CSS trong `index.css`. **KHÔNG** phụ thuộc player/music/journal/`AppThemeContext`.

### 1.3 Bản đồ phụ thuộc (đã kiểm tra bằng grep toàn repo)

| Chiều | Kết quả |
|---|---|
| BE files ngoài module import vào module | **Không có.** `ops-*` chỉ được `routes/services.ts` và `app.ts` import |
| Module import ra ngoài | `config/services.js`, `node:*`, `express` — hết |
| FE files ngoài module | Chỉ `App.tsx` (lazy + route), `routes/paths.ts`, `Sidebar.tsx`, `api.ts`, `types.ts` |
| `app.ts` phụ thuộc ngược | **Không có** |

→ Đây là module **tách sạch nhất trong toàn repo** về mặt phụ thuộc code. Độ khó nằm ở **vận hành/path**, không nằm ở refactor.

---

## 2. ĐƯỜNG DẪN TUYỆT ĐỐI — Inventory file nguồn

### 2.1 Backend — COPY NGUYÊN (4 file, không sửa 1 dòng nào)

| # | Đường dẫn tuyệt đối | Dòng | Vai trò |
|---|---|---|---|
| B1 | `D:\PhanLeThien\Software_lan\backend\src\config\services.ts` | 26 | `SERVICES_CONFIG` = `{ root, probeTimeoutMs, lanHost }`. Có `resolvePlatformRoot()` — logic quan trọng nhất của module, xem §6.1 |
| B2 | `D:\PhanLeThien\Software_lan\backend\src\services\ops-catalog.ts` | 233 | **Toàn bộ tri thức vận hành**: type `ServiceDef`/`HealthTarget`/`ServiceOpen`, mảng `SERVICES` (10 service, dòng 50-206), `getService()`, `resolveOpenUrl()`, 3 hàm `serviceCan*()`, `resolveScripts()` |
| B3 | `D:\PhanLeThien\Software_lan\backend\src\services\ops-probe.ts` | 187 | 3 kiểu health probe: HTTP fetch (`AbortController` + `probeTimeoutMs`), `process://` → `tasklist /FI`, `command://` → `execFile` + so khớp stdout/JSON field. Xuất `probeUrl()`, `probeAll()`, type `ProbeResult` |
| B4 | `D:\PhanLeThien\Software_lan\backend\src\services\ops-lifecycle.ts` | 316 | `runServiceAction()`: guard canStart/Stop/Deploy → **lock `busy` theo id** → `runScript()` → `buildCommand()` (`.vbs`→`wscript //B`, `.bat|.cmd`→`cmd /d /c`) → detach (chỉ `start`) hoặc `runWait`. `spawnEnv()` tự vá `PATH` (nodejs, .dotnet, Docker, Git) + `DOTNET_ROOT` |

### 2.2 Backend — COPY (route)

| # | Đường dẫn tuyệt đối | Dòng | Việc phải làm |
|---|---|---|---|
| B5 | `D:\PhanLeThien\Software_lan\backend\src\routes\services.ts` | 110 | Copy gần nguyên. Có thể đổi `createServicesRouter()` → `createServicesRouter(catalog)` nếu muốn bơm catalog từ ngoài (khuyến nghị, xem D3) |

### 2.3 Backend — COPY RỒI LỌC

| # | Đường dẫn tuyệt đối | Việc phải làm |
|---|---|---|
| B6 | `D:\PhanLeThien\Software_lan\backend\src\app.ts` | 58 dòng, 8 router → rút còn `cors({origin:true})` + `express.json()` + `/health` + `/api/services` + static `frontend/dist` + SPA fallback. **Bỏ 7 import router khác và 6 import `*_CONFIG`** |
| B7 | `D:\PhanLeThien\Software_lan\backend\src\index.ts` | 19 dòng → `createApp()` + `listen(PORT ?? <port mới>)`. **Bỏ hoàn toàn `connectDb()`/`.catch()`** — không có Mongo |
| B8 | `D:\PhanLeThien\Software_lan\backend\package.json` | 36 dòng. **Giữ:** `cors`, `dotenv`, `express@^4`. **Bỏ:** `jszip`, `md5`, `mongodb`, `multer`, `music-metadata`, `node-id3`, `sharp`, `xlsx`. DevDeps giữ: `@types/cors`, `@types/express`, `@types/node`, `supertest`, `@types/supertest`, `tsx`, `typescript`, `vitest`. **Bỏ:** `@types/md5`, `@types/multer` |
| B9 | `D:\PhanLeThien\Software_lan\backend\tsconfig.json` | 16 dòng, copy nguyên (kiểm tra `outDir: dist`, `module: NodeNext`) |
| B10 | `D:\PhanLeThien\Software_lan\backend\vitest.config.ts` | 8 dòng, copy nguyên (`environment: 'node'`, `setupFiles: ['./tests/setup.ts']`) |
| B11 | `D:\PhanLeThien\Software_lan\backend\.env.example` | 33 dòng → **viết lại hoàn toàn**, chỉ 4 biến (xem §5). Đừng copy các biến `OFFLINE_*`/`MUSIC_*`/`JOURNAL_*`/`AI_QUOTA_*`/`ACCOUNTS_*` |

### 2.4 Backend tests — KHÔNG có gì để copy

`D:\PhanLeThien\Software_lan\backend\tests\` chỉ có: `ai-quota-cycle.test.ts`, `book-import-service.test.ts`, `book-read-service.test.ts`, `setup.ts` — **không file nào chạm module Services**. `tests/setup.ts` (9 dòng) toàn biến của module khác → **app mới viết `setup.ts` rỗng hoặc chỉ `import 'dotenv/config'`**.

→ **Phải viết test mới từ đầu.** Xem §7.3 để có danh sách test tối thiểu.

### 2.5 Frontend — COPY NGUYÊN

| # | Đường dẫn tuyệt đối | Dòng | Vai trò |
|---|---|---|---|
| F1 | `D:\PhanLeThien\Software_lan\frontend\src\pages\services\index.tsx` | 463 | Toàn bộ UI: toolbar (Filter nhóm Apps/Infra + Check all), bảng antd 5 cột, `ProbeBadge`, `statusTag`, `sortServices()` (Down→Partial→Up→chưa check), `waitUntilReady()` poll 2 s × 90 s sau Start/Deploy, `measureTableBodyHeight()` + `ResizeObserver`, click dòng = check 1 service |
| F2 | `D:\PhanLeThien\Software_lan\frontend\src\pages\services\services.css` | 111 | Chỉ dùng 2 biến CSS (`--color-surface`, `--color-border`) **và cả hai đều có fallback** (`#fff`, `#e5e7eb`) → có thể chạy độc lập |

### 2.6 Frontend — COPY RỒI LỌC

| # | Đường dẫn tuyệt đối | Việc phải làm |
|---|---|---|
| F3 | `D:\PhanLeThien\Software_lan\frontend\src\api.ts` | 737 dòng/9 module → chỉ giữ **dòng 697-736**: `fetchOpsServices`, `checkOpsServices`, `checkOpsService`, `startOpsService`, `stopOpsService`, `deployOpsService`. Xoá import type ở dòng 19-20 rồi import lại từ `types.ts` mới |
| F4 | `D:\PhanLeThien\Software_lan\frontend\src\types.ts` | 267 dòng → chỉ giữ **dòng 230-266**: `OpsProbeDTO`, `OpsServiceDTO`, `OpsActionResult` |
| F5 | `D:\PhanLeThien\Software_lan\frontend\src\App.tsx` | 300 dòng → **viết lại**: `ConfigProvider` + theme + `<Routes>` 1 route (`/` → `ServicesPage`) + `<Route path="*" element={<Navigate to="/" replace />} />`. **Bỏ:** `Sidebar`, `useLibrary`, `usePlayer`, `Player`, `<audio>`, `NowPlayingProvider`, `AppThemeProvider`, 7 lazy import khác, `tabFromPathname` |
| F6 | `D:\PhanLeThien\Software_lan\frontend\src\main.tsx` | 14 dòng. Nếu app chỉ 1 route thì **không cần `BrowserRouter`** — nhưng nên thêm để đồng bộ pattern và giữ `/` rõ ràng |
| F7 | `D:\PhanLeThien\Software_lan\frontend\package.json` | 34 dòng. **Bắt buộc:** `react`, `react-dom`, `antd@^6`, `@ant-design/icons@^6`. **Bỏ được:** `jszip`, `pdfjs-dist`, `react-router-dom` (nếu bỏ router). DevDeps giữ nguyên; **bỏ được `jsdom`? Không** — antd cần jsdom cho test FE |
| F8 | `D:\PhanLeThien\Software_lan\frontend\vite.config.ts` | 19 dòng. `server.proxy['/api']` → **port BE app mới**; `port: 2413` → **đổi** (xem D2). `test.environment: 'jsdom'` giữ nguyên |
| F9 | `D:\PhanLeThien\Software_lan\frontend\tsconfig.json` / `tailwind.config.js` / `postcss.config.js` | Copy nguyên |
| F10 | `D:\PhanLeThien\Software_lan\frontend\index.html` | 24 dòng — **đổi `<title>`** |
| F11 | `D:\PhanLeThien\Software_lan\frontend\public\Favicon.jpg` | Copy |
| F12 | `D:\PhanLeThien\Software_lan\frontend\src\test-setup.ts` | 35 dòng — copy nguyên (module Services dùng `ResizeObserver` → **bắt buộc**, xem §6.5) |
| F13 | `D:\PhanLeThien\Software_lan\frontend\src\index.css` | 188 dòng — **nên copy** để có theme sáng/tối. Bắt buộc nếu muốn antd table có màu nền/border nhất quán. `services.css` vẫn chạy nếu không copy (có fallback), nhưng giao diện sẽ trắng trơn |
| F14 | `D:\PhanLeThien\Software_lan\frontend\src\lib\antd-message.ts` | 41 dòng — page dùng `message.error/info/success/warning` rất nhiều (8 chỗ). Override này biến `message.error` thành toast sticky → **nên copy** + import ở `main.tsx` |
| F15 | `D:\PhanLeThien\Software_lan\frontend\src\context\AppThemeContext.tsx` | 30 dòng — **chỉ copy nếu giữ dark mode** (D5) |
| F16 | `D:\PhanLeThien\Software_lan\frontend\src\hooks\useMediaQuery.ts` | 20 dòng — kiểm tra: `App.tsx` dùng để ẩn/hiện layout mobile. Page Services không dùng. **Bỏ được**, trừ khi giữ nguyên `App.tsx` layout responsive |

### 2.7 Deploy / vận hành (phải làm bản mới — KHÔNG copy)

| # | Đường dẫn tuyệt đối | Ghi chú |
|---|---|---|
| D-1 | `D:\PhanLeThien\Software_lan\deploy\deploy.bat` | 63 dòng: build FE → build BE → `stop.bat` → `wscript //B start-prod.vbs /silent /force`. Nhận arg `nopause` (Host Manager gọi). **Viết bản mới**, đổi log path + tên app |
| D-2 | `D:\PhanLeThien\Software_lan\deploy\start-prod.vbs` | 114 dòng: chạy ẩn `node backend\dist\index.js`, health-check `/health` `WinHttp` tối đa 90 s, `sh.Environment("PROCESS")` set `PORT` + `DOTENV_CONFIG_PATH`. **Hard-code `:2411` ở 3 chỗ (dòng 50, 87, 109)** → app mới **phải đổi cả 3**, và **thêm `PLATFORM_ROOT`** (xem §6.1) |
| D-3 | `D:\PhanLeThien\Software_lan\deploy\stop.bat` | 6 dòng: `Get-CimInstance Win32_Process` + regex `PhanLeThien\Software_lan\backend\dist\index\.js` → **phải đổi path app mới**, nếu không sẽ không tắt được app mới |
| D-4 | `D:\PhanLeThien\Software_lan\deploy\start.bat` | 13 dòng: dev, mở browser `:2413` rồi `npm run dev` |
| D-5 | `D:\PhanLeThien\Software_lan\deploy\start.vbs` | Launcher dev ẩn — tham khảo |
| D-6 | `D:\PhanLeThien\Software_lan\package.json` | 17 dòng: root scripts `dev` (concurrently), `build`, `start:prod`, `test`, `install:all` |
| D-7 | `D:\PhanLeThien\Software_lan\backend\.env` | ⚠️ File thật, **không copy vào repo**. Nó **hiện KHÔNG chứa `PLATFORM_ROOT`** (đã kiểm tra) → app cũ đang dựa vào đường dẫn tương đối |
| D-8 | `D:\PhanLeThien\Software_lan\deploy\kill-stale-pwa.ps1` | Tiện ích phụ — chỉ copy nếu app mới có PWA |
| D-9 | `D:\PhanLeThien\Software_lan\deploy\*.log` | Log runtime, **không copy** |

---

## 3. Hợp đồng API

Mount: `app.use('/api/services', createServicesRouter())`. **9 endpoint, không auth, không rate-limit.**

| Method | Path | Input | Output | Ghi chú |
|---|---|---|---|---|
| GET | `/api/services` | — | `{ services: ServiceSummary[] }` | **KHÔNG probe** (`probes: null` → `health.probed = false`). Chỉ trả catalog. Nhanh |
| POST | `/api/services/check` | — | `{ services: ServiceSummary[] }` | Probe **tất cả** song song (`Promise.all`). Mỗi service 1 `probeAll()` |
| GET | `/api/services/:id` | — | `ServiceSummary` + `{ scripts: { start, stop, deploy } }` | Probe service đó. **404** nếu id lạ. `scripts` là **đường dẫn tuyệt đối** — rò rỉ cấu trúc thư mục máy chủ ra client |
| POST | `/api/services/:id/check` | — | `ServiceSummary` | Probe lại 1 service. Đây là endpoint FE gọi nhiều nhất (click dòng + poll `waitUntilReady`) |
| POST | `/api/services/:id/start` | — | `ActionResult` | 200/403/404/409. `canStart === false` → **403**; script không tồn tại → 200 nhưng `ok:false` |
| POST | `/api/services/:id/stop` | — | `ActionResult` | Như trên |
| POST | `/api/services/:id/deploy` | — | `ActionResult` | Như trên. **Blocking** — xem §6.4 |

### 3.1 Shape `ServiceSummary` (từ `summarize()`, `routes/services.ts` dòng 13-35)

```ts
{
  id, name, description,
  canStart, canStop, canDeploy,      // boolean — suy từ script + cờ canXxx
  busy: 'start'|'stop'|'deploy'|null, // từ lock in-memory; null nếu rảnh
  open: string|null,                  // `http://<lanHost>:<lanPort><lanPath||'/'>`
  health: {
    probed: boolean,                  // false ở GET / (list)
    online: boolean,                  // >=1 probe online
    allOnline: boolean,               // tất cả probe online && length > 0
    probes: ProbeResult[]
  }
}
```

`ProbeResult` = `{ label, url, online, status, latencyMs, error? }`.

### 3.2 Shape `ActionResult` (từ `ops-lifecycle.ts`)

```ts
{ ok, id, action, command, stdout, stderr, exitCode, async?, error? }
```

`command` là **chuỗi hiển thị** (`wscript //B "D:\..." /silent`), `stdout`/`stderr` **đã `.trim()`**. Khi detach: `ok:true`, `stdout:'Launched async — poll health for status'`, `exitCode:0`, `async:true`.

### 3.3 Ánh xạ mã lỗi

```ts
function actionStatus(result) {
  if (result.ok) return 200
  if (result.error?.includes('Unknown')) return 404      // id không có trong catalog
  if (result.error?.includes('not allowed')) return 403  // canStart/Stop/Deploy === false
  return 409                                             // busy, script not found, exit != 0
}
```

⚠️ Đây là **so khớp chuỗi** — rất dễ vỡ nếu đổi message. Khi tách nên thay bằng trường `code` tường minh (xem D4).

---

## 4. SERVICES đang quản lý những gì

### 4.1 Catalog — 10 service (`ops-catalog.ts` dòng 50-206)

| # | `id` | Tên | Thư mục / script (tương đối `PLATFORM_ROOT`) | Health probe | Open | canDeploy |
|---|---|---|---|---|---|---|
| 1 | `docker-desktop` | Docker Desktop | `docker-desktop\deploy\{start.vbs,stop.bat}` ⚠️ **KHÔNG TỒN TẠI** | `process://com.docker.backend.exe` | — | ❌ |
| 2 | `tunnel` | Cloudflare Tunnel | `tunnel\deploy\{start.vbs,stop.bat}` | `process://cloudflared.exe` | — | ❌ |
| 3 | `tailscale` | Tailscale | `tailscale\deploy\{start.vbs,stop.bat}` ⚠️ **KHÔNG TỒN TẠI** | `command://tailscale-status` → `C:\Program Files\Tailscale\tailscale.exe status --json`, `BackendState === 'Running'` | — | ❌ |
| 4 | `software-domain` | Software Domain | `software_domain\deploy\{start.vbs,stop.bat,deploy.bat}` | `http://127.0.0.1:2412/health` (`expect: 'status'`) | `:2412` | ✅ |
| 5 | `software-lan` | Software LAN | `Software_lan\deploy\{start-prod.vbs, stop.bat, deploy.bat}` | `http://127.0.0.1:2411/health` (`expect: 'status'`) | `:2411` | ✅ |
| 6 | `map` | Map | `map\deploy\*` (`stopArgs: ['docker']`) | `http://127.0.0.1:2510/api/health` (`expect: 'ok'`) | `:2510` | ✅ |
| 7 | `move` | MOVE | `MOVE\deploy\*` (`stopArgs: ['all']`) | `http://127.0.0.1:2610/api/health` (`expect: 'ok'`) | `:2610` | ✅ |
| 8 | `medic` | Medic (SMAR) | `Medic\deploy\*` (`stopArgs: ['docker']`) | 2 probe: `:2710` (FE), `:2711/graphql` | `:2710` | ✅ |
| 9 | `sneat` | Sneat | `Medic\FE-SMAR\sample\deploy\*` | `http://127.0.0.1:2810` | `:2810` | ✅ |
| 10 | `forgejo` | Forgejo | `forgejo\deploy\{start.vbs,stop.bat}` | `http://127.0.0.1:3010/` | `:3010` | ❌ |

**Đã kiểm tra thực tế trên đĩa `D:\PhanLeThien`:** 8/10 service có đủ script; **`docker-desktop` và `tailscale` thiếu cả `start.vbs` lẫn `stop.bat`** → 2 nút Start/Stop của 2 dòng này luôn trả **409 `Script not found`**. Sibling dirs hiện có: `Account`, `file`, `forgejo`, `Journal`, `map`, `Medic`, `MOVE`, `Music`, `software_domain`, `Software_lan`, `tunnel`.

### 4.2 Phân nhóm trên UI (hard-code ở FE, **không** ở catalog)

`frontend/src/pages/services/index.tsx` dòng 42:

```ts
const INFRA_SERVICE_IDS = new Set(['docker-desktop', 'tunnel', 'tailscale'])
```

→ Nhóm `infra` = 3 id trên; **mọi id còn lại rơi vào `apps`**. Service mới thêm vào catalog sẽ **tự động vào nhóm `apps`**. Filter mặc định = cả 2 nhóm; không cho bỏ hết (giữ ít nhất 1).

### 4.3 3 loại health probe (`ops-probe.ts`)

| Kind | Trigger | Cách làm | `online` khi |
|---|---|---|---|
| `http` (default) | `url` là `http(s)://` | `fetch` + `AbortController` timeout `probeTimeoutMs` | `200 ≤ status < 500` **và** body chứa `expect` (không phân biệt hoa thường) |
| `process` | `kind: 'process'` hoặc `url` khớp `^process://` | `tasklist /FI "IMAGENAME eq <name>" /NH` | stdout chứa tên process |
| `command` | `kind: 'command'` hoặc `url` khớp `^command://` | `execFile(command, commandArgs)` | có `jsonField` → parse JSON, so `jsonField === jsonEquals ?? 'Running'`; không có → stdout chứa `expect` |

⚠️ `statusOk = res.status >= 200 && res.status < 500` → **HTTP 404/403 được coi là ONLINE** (miễn body chứa `expect`). Với Medic/Sneat/Forgejo (`expect` không set cho đường `/`) thì chỉ cần HTTP < 500 là Up. Đây là chủ ý (phát hiện "có gì đó đang nghe port") nhưng cần biết rõ khi viết test.

### 4.4 Health mặc định + UI

- `GET /` → `health.probed = false` → UI hiện tag **"Chưa check"** và cột Port/Process hiện *"Bấm dòng để check"*.
- Vào trang: `useEffect` chạy `loadList()` **rồi** `checkAll()` (tuần tự).
- `sortServices()` xếp: **Up (0) → Partial (1) → Down (2) → Chưa check (3)**, cùng hạng thì `localeCompare(..., 'vi')`.

### 4.5 Cách "Open" hoạt động

`resolveOpenUrl(open)` = `http://${SERVICES_CONFIG.lanHost}:${open.lanPort}${open.lanPath||'/'}`.

`lanHost` = `process.env.LAN_HOST || '100.110.119.68'` (**hard-code IP Tailscale của máy này** trong code, dòng 25 `config/services.ts`). Nút "Open" trên UI mở URL này ở tab mới → **từ máy khác trong tailnet vẫn mở được app đích**. 3 service infra không có `open` (hiện `—`).

### 4.6 Điều module này **KHÔNG** quản lý

- ❌ Không biết service nào **đang** chạy ngoài probe (không có state store, không đọc PID/port registry).
- ❌ Không có auto-start / watchdog / scheduled check — mọi hành động đều do người dùng bấm.
- ❌ Không có log viewer (chỉ trả `stdout`/`stderr` của lần chạy script vừa rồi).
- ❌ Không có auth, audit trail, hay lịch sử hành động.
- ❌ Không có cấu hình runtime — thêm/sửa service **phải sửa code + build lại**.
- ❌ Không theo dõi `Software_lan` cũ trong khi `Software_lan` cũ đang phục vụ chính trang này (xem §8.2).

---

## 5. Biến môi trường

```dotenv
# === BẮT BUỘC ở app mới — nếu thiếu, app tự suy ra SAI (xem §6.1) ===
PLATFORM_ROOT=D:\PhanLeThien

# === Tuỳ chọn ===
# PROBE_TIMEOUT_MS=4000          # timeout cho MỖI probe (fetch/execFile/tasklist)
# LAN_HOST=100.110.119.68        # IP dùng để dựng URL nút "Open" (mặc định = IP Tailscale máy này)
# PORT=2418                      # default trong code là 2108 — launcher prod phải set
# FRONTEND_DIST=...              # mặc định resolve từ dist → ../../frontend/dist
# DOTENV_CONFIG_PATH=...         # launcher prod (start-prod.vbs) set biến này
```

`resolvePlatformRoot()` cũng chấp nhận biến **`ROOT`** (legacy alias) — nhưng **ưu tiên `PLATFORM_ROOT`**.

**Không cần ở app mới:** `MONGODB_URL`, `MONGODB_DB`, `LOCAL_LIBRARY_*`, `JOURNAL_*`, `AI_QUOTA_*`, `ACCOUNTS_*`, `DASHBOARD_*`, `OFFLINE_*`, `MUSIC_FOLDER`, `IMG_FOLDER`, `YTDLP_*`, `MIGRATE_CHARS_PER_WORD`.

---

## 6. Coupling phải xử lý

### 6.1 ⚠️ `SERVICES_CONFIG.root` — **vấn đề số 1, phải xử lý trước mọi thứ khác**

```ts
// config/services.ts dòng 5-7
const here = path.dirname(fileURLToPath(import.meta.url))
const softwareLanRoot = path.resolve(here, '../../..')
const defaultRoot = path.resolve(softwareLanRoot, '..')
```

Ở repo hiện tại:
- `src/config/services.ts` → `here` = `...\backend\src\config` → lên 3 cấp = `D:\PhanLeThien\Software_lan` → lên 1 cấp = **`D:\PhanLeThien`** ✅
- `dist/config/services.js` → `here` = `...\backend\dist\config` → lên 3 cấp = `D:\PhanLeThien\Software_lan` → **`D:\PhanLeThien`** ✅ (trùng hợp đúng vì `src` và `dist` cùng độ sâu)

**Sau khi tách, nếu giữ nguyên code:** repo mới nằm ngay trong `D:\PhanLeThien\<repo_mới>` → `defaultRoot` = **`D:\PhanLeThien`** — tình cờ **vẫn đúng** *nếu* repo mới là sibling trực tiếp của các app kia. Nhưng:
- Nếu đặt repo sâu hơn 1 cấp (vd `D:\PhanLeThien\ops\console`) → `defaultRoot` = `D:\PhanLeThien\ops` → **mọi script path sai** → Start/Stop/Deploy trả 409 `Script not found` / 404, health probe HTTP vẫn chạy (không dùng `root`) nên UI **trông như bình thường** nhưng không bấm được gì.
- Nếu đổi cấu trúc `src/`/`dist/` (vd bỏ `config/`) → cũng lệch.

**Cách xử lý (bắt buộc, chọn 1):**
1. **Khuyến nghị:** set `PLATFORM_ROOT=D:\PhanLeThien` trong `.env` **và** trong `start-prod.vbs` (`sh.Environment("PROCESS")("PLATFORM_ROOT") = "D:\PhanLeThien"`) → đường dẫn không còn phụ thuộc vị trí repo.
2. Hoặc viết lại `resolvePlatformRoot()` để **không có fallback đoán mò**: nếu thiếu `PLATFORM_ROOT` thì **throw ngay lúc khởi động** kèm message rõ ràng (fail-fast tốt hơn fail-im lặng).
3. Khuyến nghị làm **cả 1 và 2**.
4. Thêm endpoint/log khởi động in ra `SERVICES_CONFIG.root` để xác nhận.

⚠️ Đừng "sửa" bằng cách hard-code `D:\PhanLeThien` **trong code** — như hiện trạng `lanHost` đang làm. Đưa vào env.

### 6.2 `lanHost` hard-code

`'100.110.119.68'` là IP Tailscale của máy dev, nằm thẳng trong code. App mới nên bắt buộc `LAN_HOST` trong `.env` (hoặc suy ra từ một biến duy nhất như `PLATFORM_LAN_HOST`).

### 6.3 `spawnEnv()` vá `PATH` bằng đường dẫn hard-code Windows

`ops-lifecycle.ts` dòng 35-45 hard-code: `C:\Program Files\nodejs`, `~/.dotnet`, `C:\Program Files\Docker\Docker\resources\bin`, `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin`, `C:\Program Files\Git\cmd`, `C:\Program Files\Git\bin`. Chỉ thêm nếu `existsSync` → an toàn trên máy hiện tại, nhưng **app này chỉ chạy được trên Windows**. Cân nhắc: giữ nguyên (đơn giản, đã hoạt động) và ghi rõ "Windows-only" trong README, hoặc chuyển thành `EXTRA_PATH_DIRS` trong `.env`.

### 6.4 Deploy `Software_lan` = **tự deploy chính mình** (dead branch)

```ts
// ops-lifecycle.ts dòng 197-198
const detach = action === 'start' || (action === 'deploy' && svc.id === 'host-manager')
```

`'host-manager'` **không tồn tại trong catalog** → nhánh detach cho deploy **không bao giờ chạy**. Hệ quả:
- **Mọi deploy đều chạy `runWait` (blocking)** — request có thể treo **nhiều phút** (build FE + build BE + stop + start + health-check 90 s).
- Vite dev proxy **không set timeout** → dễ bị cắt; `fetch` của trình duyệt cũng có ngưỡng riêng.
- FE `runAction('deploy')` chờ POST xong **rồi** mới poll 90 s → tổng thời gian chờ có thể vượt xa 90 s.
- Khi tách app ra, việc deploy `Software_lan` (hoặc deploy app Ops mới) có thể **kill chính process đang phục vụ request** → client mất kết nối, không nhận được `ActionResult`.

**Cách xử lý (xem D6):** hoặc (a) bỏ nhánh `'host-manager'` chết và **luôn detach cho `deploy`**, trả về ngay `{ async: true }`; hoặc (b) đổi `deployScript` của các app cần thiết + thêm cơ chế job id + polling trạng thái. (a) là tối thiểu và khớp với cách `start` đang làm.

### 6.5 `ResizeObserver` trong test

`index.tsx` dùng `ResizeObserver` (dòng 174) để đo chiều cao bảng. Test FE **bắt buộc** copy `test-setup.ts` (đã mock `ResizeObserver`/`matchMedia`/`getComputedStyle`), nếu không test sẽ crash ngay khi mount.

### 6.6 antd v6 API đặc thù

`index.tsx` dòng 419 dùng `popupRender` trên `<Dropdown>` (API antd 6.x). **Không** hạ antd xuống 5.x khi tách — sẽ vỡ. Giữ `antd@^6.4.3`.

### 6.7 `services.css` vs `index.css`

Chỉ dùng `--color-surface` và `--color-border`, **cả hai đều có fallback**. Nếu app mới không copy `index.css` thì bảng vẫn dùng được nhưng mất theme dark/sáng đồng bộ. Nếu copy `index.css`, giữ nhóm `--color-*`; **bỏ được** nhóm `--reader-*` (24 biến, chỉ dùng cho trình đọc Offline Library) và các biến `--color-terminal-*`/`--color-cover-*`.

### 6.8 Không có coupling nào khác

Đã grep toàn repo: module Services **không** chạm `db.ts`, `models/`, `path-utils.ts`, Blob, Mongo, hay module nào khác. `backend/src/types.ts` (181 dòng, 9 module) **cũng không chứa type nào của Services** — type của module này là **nội bộ** (`ops-catalog.ts` export `ServiceDef`/`HealthTarget`/`ServiceOpen`; `ops-probe.ts` export `ProbeResult`), FE tự khai báo lại `Ops*DTO` trong `types.ts`. Nghĩa là **không cần lọc `types.ts` ở backend** — chỉ FE.

---

## 7. Cấu trúc repo mới & thi công

### 7.1 Cây thư mục

```
<REPO_MỚI>\
├─ package.json                 # dev (concurrently), build, start:prod, test, install:all
├─ README.md                    # ⚠️ ghi rõ: Windows-only, PLATFORM_ROOT bắt buộc, quyền hạn script
├─ start.bat
├─ deploy\{deploy.bat, start-prod.vbs, stop.bat, start.bat}
├─ backend\
│  ├─ package.json  tsconfig.json  vitest.config.ts  .env  .env.example
│  ├─ src\
│  │  ├─ index.ts               # KHÔNG có connectDb()
│  │  ├─ app.ts                 # cors + json + /health + /api/services + static
│  │  ├─ config\services.ts     # + fail-fast nếu thiếu PLATFORM_ROOT
│  │  └─ services\{ops-catalog.ts, ops-probe.ts, ops-lifecycle.ts}
│  │  └─ routes\services.ts
│  └─ tests\{setup.ts, ops-catalog.test.ts, ops-probe.test.ts, ops-lifecycle.test.ts}
└─ frontend\
   ├─ package.json  tsconfig.json  vite.config.ts  tailwind.config.js  postcss.config.js  index.html
   ├─ public\Favicon.jpg
   └─ src\
      ├─ main.tsx  index.css  api.ts  types.ts  test-setup.ts
      ├─ App.tsx                # shell mới: ConfigProvider + 1 route
      ├─ lib\antd-message.ts
      ├─ context\AppThemeContext.tsx   # nếu giữ dark mode (D5)
      └─ pages\services\{index.tsx, services.css}
```

### 7.2 Bootstrap backend mới (điểm khác biệt then chốt)

```ts
// index.ts — KHÔNG import connectDb
import 'dotenv/config'
import { createApp } from './app.js'
import { SERVICES_CONFIG } from './config/services.js'

const PORT = process.env.PORT ?? 2418

console.log(`[ops] PLATFORM_ROOT = ${SERVICES_CONFIG.root}`)
const app = createApp()
app.listen(PORT, () => {
  console.log(`Ops backend running on http://localhost:${PORT}`)
})
```

`app.ts` mới chỉ còn:

```ts
app.use(cors({ origin: true }))
app.use(express.json())
app.get('/health', (_req, res) => { res.json({ status: 'ok' }) })
app.use('/api/services', createServicesRouter())
// + static frontend/dist + SPA fallback
```

### 7.3 Test cần viết mới (hiện **không có test nào**)

| # | File | Nội dung tối thiểu |
|---|---|---|
| T1 | `tests/ops-catalog.test.ts` | (a) mọi `id` duy nhất; (b) mọi `serviceCan*(svc)` **nhất quán** với script tương ứng (không có `canStart:true` mà thiếu `startScript`); (c) **mọi script path resolve ra file có thật** (test này sẽ **fail ngay** vì `docker-desktop`/`tailscale` → quyết định D1 trước); (d) `resolveOpenUrl()` đúng format với/không có `lanPath` |
| T2 | `tests/ops-probe.test.ts` | Mock `tasklist` stdout → `probeProcess` online/offline; mock `execFile` JSON → `jsonField`/`jsonEquals` khớp và không khớp; `probeUrl` HTTP: 200 + `expect` khớp = online, 200 thiếu `expect` = offline, **404 = online** (chốt hành vi bất ngờ này bằng test), timeout/abort = offline |
| T3 | `tests/ops-lifecycle.test.ts` | `runServiceAction` id lạ → `error` chứa `Unknown`; `canStart:false` → `error` chứa `not allowed`; script không tồn tại → `error` chứa `Script not found`; gọi 2 lần đồng thời → lần 2 nhận `Service busy`; `buildCommand()` map `.vbs`→`wscript //B`, `.bat`→`cmd /d /c`, `.ps1`→`Unsupported script type` |
| T4 | `frontend/src/pages/services/index.test.tsx` | Mock `api.ts`; render → gọi `fetchOpsServices` + `checkOpsServices`; `sortServices()` thứ tự Up→Partial→Down→Chưa-check; nút Start **disabled** khi `canStart:false`; Filter nhóm giữ ít nhất 1 nhóm |

**T1(c) là test quan trọng nhất** — nó biến lỗi "script không tồn tại" từ phát hiện lúc runtime thành lỗi lúc CI. Nhưng phải chốt D1 trước (giữ hay bỏ `docker-desktop`/`tailscale`).

### 7.4 Lệnh copy gợi ý (PowerShell, chạy trên máy này)

```powershell
$SRC = 'D:\PhanLeThien\Software_lan'
$DST = '<REPO_MỚI>'   # <-- chốt trước khi chạy

# Backend — không có test nào để copy
robocopy "$SRC\backend\src\config"   "$DST\backend\src\config"   services.ts /NFL /NDL
robocopy "$SRC\backend\src\services" "$DST\backend\src\services" ops-catalog.ts ops-probe.ts ops-lifecycle.ts /NFL /NDL
robocopy "$SRC\backend\src\routes"   "$DST\backend\src\routes"   services.ts /NFL /NDL
Copy-Item "$SRC\backend\tsconfig.json","$SRC\backend\vitest.config.ts" "$DST\backend\"

# Frontend
robocopy "$SRC\frontend\src\pages\services" "$DST\frontend\src\pages\services" /E /NFL /NDL
Copy-Item "$SRC\frontend\src\index.css","$SRC\frontend\src\test-setup.ts","$SRC\frontend\src\main.tsx" "$DST\frontend\src\"
Copy-Item "$SRC\frontend\src\lib\antd-message.ts" "$DST\frontend\src\lib\"
Copy-Item "$SRC\frontend\src\context\AppThemeContext.tsx" "$DST\frontend\src\context\"
Copy-Item "$SRC\frontend\vite.config.ts","$SRC\frontend\tsconfig.json","$SRC\frontend\tailwind.config.js","$SRC\frontend\postcss.config.js","$SRC\frontend\index.html" "$DST\frontend\"
Copy-Item "$SRC\frontend\public\Favicon.jpg" "$DST\frontend\public\"

# Rồi VIẾT MỚI: app.ts, index.ts, api.ts, types.ts, App.tsx, .env.example,
#                tests/setup.ts, deploy/*, package.json (3 cái), README.md
```

**Không** copy `node_modules`, `dist`, `backend/.env`, `deploy/*.log`, `frontend/src/temp_insert.cjs`.

---

## 8. Rủi ro & lưu ý vận hành

### 8.1 🔴 App này chạy script tuỳ ý trên máy — bề mặt tấn công lớn nhất repo

`POST /api/services/:id/deploy` → `cmd /d /c <script> nopause`, `POST /:id/stop` → `cmd /d /c <script>`. **Không auth, không CSRF, không rate-limit, `cors({origin:true})` cho mọi origin.**

- Bất kỳ ai truy cập được port đều có thể **stop Medici/MOVE/Map, deploy Forgejo, tắt Software_lan**.
- Vì `cors({origin:true})`, **một trang web độc hại mở trên máy này có thể POST** tới `http://127.0.0.1:<port>/api/services/...` (simple request? không — nhưng preflight vẫn được `cors({origin:true})` chấp thuận) → **CSRF thật sự khả thi**.
- Hiện tại rủi ro được giới hạn gián tiếp vì trang nằm chung app Music LAN. **Sau khi tách, nếu app mới vẫn bind LAN như cũ thì rủi ro y nguyên** — không tự giảm.

**Khuyến nghị mạnh:**
1. Bind **`127.0.0.1`** thay vì `0.0.0.0` (`app.listen(PORT, '127.0.0.1')`). Mở rộng ra LAN/Tailscale chỉ khi thật cần.
2. Nếu phải mở LAN: thêm **shared token** (`Authorization: Bearer <OPS_TOKEN>`) cho **mọi** `POST`, lưu token trong `.env`, FE đọc từ `VITE_OPS_TOKEN`.
3. Siết CORS: đổi `origin: true` thành whitelist origin cụ thể (bao gồm cả origin Tailscale).
4. **Bỏ `GET /api/services/:id`** (hoặc bỏ trường `scripts` khỏi response) — nó rò rỉ đường dẫn tuyệt đối của máy ra client mà không có tác dụng gì cho UI (UI không dùng).
5. Ghi rõ trong README: **không** expose app này ra Internet; Cloudflare Tunnel (`tunnel` service) **không** được route vào app Ops.

### 8.2 Nghịch lý "tự bắn vào chân"

Catalog **có** service `software-lan` (`Software_lan\deploy\deploy.bat`). Nếu sau khi tách, app Ops mới được chạy như một binary riêng (không phải trong `Software_lan`), thì bấm **Deploy `software-lan`** sẽ:
- `runWait` → `deploy.bat` → `stop.bat` (kill node theo path `Software_lan\backend\dist\index.js`).
- Nếu app Ops **không** chạy từ path đó → **không tự sát** → tốt.
- Nếu app Ops **có** chạy từ path đó (chưa chuyển hẳn) → **tự kill chính nó giữa request** → mất kết nối, không có `ActionResult`.

→ Sau khi tách, **thêm chính app Ops vào catalog** (id mới, vd `ops-console`) để nó tự quản lý mình, và **đảm bảo `deploy` detach** (§6.4) trước khi làm vậy.

### 8.3 Timeout & trải nghiệm "Deploy treo"

Xem §6.4. Ngoài ra: `PROBE_TIMEOUT_MS` mặc định 4000 ms **cho mỗi probe**; `POST /check` probe cả 10 service song song → **worst case ~4 s** cho 1 lần check-all (chấp nhận được). `waitUntilReady` poll mỗi 2 s trong 90 s = 45 request `POST /:id/check` — không có debounce/abort, nếu người dùng rời trang giữa chừng thì **loop vẫn chạy tới hết** (không có cleanup trong `useEffect`). Cân nhắc thêm `AbortController`/cờ `cancelled`.

### 8.4 `busy` lock là in-memory, không chia sẻ

`const busy = new Map()` trong `ops-lifecycle.ts`. Restart backend = mất lock. Nhiều instance app Ops = mỗi instance 1 lock → **2 người có thể deploy cùng lúc**. Với app 1 instance thì ổn; ghi rõ "chỉ chạy 1 instance".

### 8.5 `.env` không có `PLATFORM_ROOT` (hiện trạng)

Đã kiểm tra `backend/.env`: **không** có `PLATFORM_ROOT`, `ROOT`, `LAN_HOST`, `PROBE_TIMEOUT_MS`. App cũ đang chạy **hoàn toàn dựa vào đường dẫn tương đối** — tức là nó "hoạt động được vì tình cờ đúng cấu trúc thư mục". Đây là **nợ kỹ thuật phải trả khi tách**.

### 8.6 `expect` không set = "chỉ cần HTTP < 500"

Với `medic` (cả 2 probe), `sneat`, `forgejo`, `expect` **không** được set → probe chỉ kiểm tra `200 ≤ status < 500`. Một trang lỗi 404 của server khác vẫn báo **Up**. Nếu muốn chặt hơn, thêm `expect` tường minh cho từng service (làm ở catalog, không cần sửa code probe).

### 8.7 Thêm service mới phải sửa code + build

Catalog là **mảng TypeScript hard-code**. Thêm app mới = sửa `ops-catalog.ts` + `npm run build` + deploy app Ops. Cân nhắc (D3) chuyển sang `services.json` để giảm ma sát.

---

## 9. Quyết định cần chốt

| ID | Câu hỏi | Khuyến nghị |
|---|---|---|
| **D1** | `docker-desktop` và `tailscale` **không có script** trên đĩa (đã kiểm tra). Giữ trong catalog (2 dòng UI luôn lỗi) hay bỏ/đánh dấu `canStart:false, canStop:false`? | Giữ **hiển thị** (vẫn hữu ích để xem process Docker/Tailscale có chạy không) nhưng set `canStart:false, canStop:false` để nút bị disable thay vì bấm vào ăn 409. **Đồng thời** cho test T1(c) chỉ assert script **của service có `canXxx !== false`** |
| **D2** | Vị trí repo mới + port | Repo: **sibling trực tiếp** `D:\PhanLeThien\<tên>`. Port đề xuất: BE prod **2418**, BE dev **2110**, FE dev **2414** (đã kiểm tra 2108/2411/2412/2413/2415/2418/2420/2510/2610/2710/2711/2810/3010 hiện **không** có gì listen). **Tránh 2413** (đang là FE dev của Software_lan) và **tránh 2411/2412** (app khác) |
| **D3** | Catalog hard-code TS hay chuyển sang `services.json`/`SERVICES_JSON` env? | **Giai đoạn 1 giữ TS** (ít rủi ro, giữ nguyên test/semantics). Ghi TODO chuyển sang JSON ở giai đoạn 2 để thêm service không cần build |
| **D4** | Thay `actionStatus()` so khớp chuỗi bằng mã lỗi tường minh (`code: 'UNKNOWN_SERVICE' \| 'NOT_ALLOWED' \| 'BUSY' \| 'SCRIPT_MISSING'`)? | **Có** — nhưng giữ nguyên **HTTP status** như hiện tại để FE không phải sửa. Đây là refactor an toàn |
| **D5** | Giữ dark mode / `AppThemeContext`? | Trang Services dùng antd `ConfigProvider` theme — nếu bỏ Sidebar thì **mất nút toggle theme**. Đề xuất: **copy `AppThemeContext` + thêm 1 nút toggle nhỏ ở toolbar** (thay vì bỏ hẳn) |
| **D6** | Sửa dead branch `'host-manager'` → **luôn detach cho `deploy`**? | **Có, nên làm ngay khi tách.** Nếu không, deploy vẫn block nhiều phút và rủi ro tự-kill (§6.4 + §8.2) |
| **D7** | App `Software_lan` cũ có giữ tab Services không? | Xem D2 của `HANDOFF-local-library-app-split.md`. Nếu bỏ: xoá `pages/services/`, 3 type `Ops*` ở FE `types.ts`, 6 hàm API, route `App.tsx:288`, lazy import `App.tsx:29`, `TAB_PATHS.services` + `isTab`, tab Sidebar. Ở BE: `routes/services.ts` + 3 `ops-*` + `config/services.ts` + `app.ts:15,48`. **Ở BE không cần sửa `types.ts`/`db.ts`/`models/`** — module này không chạm vào chúng |
| **D8** | Bind `127.0.0.1` hay LAN? Có thêm token? | **127.0.0.1** nếu chỉ dùng trên máy này. Nếu cần LAN → **bắt buộc** token. Xem §8.1 |
| **D9** | Giữ 7 endpoint hay rút gọn? | Bỏ `GET /:id` (§8.1 mục 4). Giữ 6 endpoint còn lại |

---

## 10. Checklist nghiệm thu

### Build & khởi động
- [ ] `npm run install:all` + `npm run build` pass (BE `tsc`, FE `tsc && vite build`).
- [ ] `GET /health` → `{"status":"ok"}`.
- [ ] **App khởi động được khi MongoDB ĐÃ TẮT** (chứng minh đã bỏ `connectDb()`).
- [ ] Log khởi động in ra `PLATFORM_ROOT` **đúng** `D:\PhanLeThien`. Thử set sai (`PLATFORM_ROOT=D:\Sai`) → app **fail-fast** hoặc log rõ ràng, không im lặng.

### Catalog & probe
- [ ] `GET /api/services` trả **đủ 10 service**, **không probe** (`health.probed === false` cho mọi item).
- [ ] `POST /api/services/check` trả về đủ 10, mỗi item có `probes` với `latencyMs`. Tổng thời gian ≲ 4 s.
- [ ] Với service đang chạy thật (vd `software-domain` nếu bật): `health.allOnline === true`.
- [ ] `GET /api/services/khong-ton-tai` → **404**.
- [ ] `docker-desktop` / `tailscale`: nút Start/Stop **bị disable** (nếu chọn D1 khuyến nghị), hoặc bấm → **409** với message chứa `Script not found` (nếu giữ nguyên).

### Hành động (kiểm tra trên **1 service ít rủi ro**, vd `forgejo` hoặc `software-domain`)
- [ ] **Start** → trả `200` + `async: true` + `stdout` chứa `Launched async`; FE hiện "đang chờ port…" rồi `Up`.
- [ ] **Stop** → trả `200`; sau đó `check` → **Down**.
- [ ] **Deploy** → xác nhận hành vi theo D6 (detach = trả ngay; không detach = chờ và có thể timeout).
- [ ] Bấm Start 2 lần liên tiếp thật nhanh → lần 2 nhận **409 `Service busy`**.
- [ ] Service `canDeploy:false` (vd `forgejo`) → **403** `Deploy not allowed`.
- [ ] `busy` hiển thị đúng: trong lúc start, `busy === 'start'`; xong thì `null`.

### Giao diện
- [ ] Bảng render đủ 10 dòng, sắp xếp **Up → Partial → Down → Chưa check**, cùng hạng theo tên tiếng Việt.
- [ ] Cột "Open" có nút cho 7 service (2411/2412/2510/2610/2710/2810/3010), `—` cho 3 infra. URL đúng `http://<LAN_HOST>:<port>/`.
- [ ] Click dòng → gọi check 1 service, tag đổi từ "Chưa check" sang Up/Partial/Down.
- [ ] Filter: mặc định 2 nhóm; bỏ 1 nhóm còn lại vẫn hiện; **không bỏ được nhóm cuối cùng**.
- [ ] "Check all" → spin trên bảng, kết quả sắp xếp lại.
- [ ] Resize cửa sổ → chiều cao bảng co giãn theo (ResizeObserver hoạt động), không tràn trang.
- [ ] `message.error` khi tắt BE → hiện **toast sticky** (nếu copy `antd-message.ts`), không tự biến mất.

### An toàn & vận hành
- [ ] Port app mới **khác** 2108/2411/2412/2413.
- [ ] `deploy\stop.bat` mới chỉ kill **đúng** process app Ops (test: chạy app, chạy `stop.bat`, xác nhận app chết **và** `Software_lan` **vẫn sống**).
- [ ] `deploy\start-prod.vbs` mới set đủ `PORT`, `PLATFORM_ROOT`, `DOTENV_CONFIG_PATH`; health-check đúng port mới (đổi **cả 3 chỗ** hard-code `:2411`).
- [ ] App Ops **không** bị route qua Cloudflare Tunnel.
- [ ] (Nếu D8 = LAN) mọi `POST` thiếu token → **401**.
- [ ] `GET /api/services/:id` đã bỏ (D9) → **404**, xác nhận không còn rò rỉ đường dẫn script.
- [ ] App `Software_lan` cũ vẫn build/chạy sau khi bị lấy module (theo D7).

### Test tự động
- [ ] `npm run test --prefix backend` pass (T1, T2, T3).
- [ ] `npm run test --prefix frontend` pass (T4).
- [ ] T1(c) — mọi script path của service có `canXxx` bật — **tồn tại thật trên đĩa**.

---

## 11. Phụ lục — chi tiết dễ mất khi viết lại

| Chủ đề | Chi tiết |
|---|---|
| `summarize()` | `busy: isBusy(svc.id) \|\| null` — **không phải boolean**, là `'start'\|'stop'\|'deploy'\|null`. FE type khai đúng (`busy: 'start'\|'stop'\|'deploy'\|null`) nhưng route dùng `\|\| null` nên `isBusy` trả `undefined` → `null` |
| `onlineCount` | `probed ? probes.filter(p => p.online).length : 0`. `online = probed && onlineCount > 0`; `allOnline = probed && onlineCount === probes.length && probes.length > 0`. **Service không có probe nào** → `allOnline = false` (không phải "up") |
| `POST /check` | `Promise.all(SERVICES.map(async svc => summarize(svc, await probeAll(svc.health))))` — **probe song song**, giữ nguyên thứ tự mảng `SERVICES` trong response (FE tự sort lại) |
| `resolveScripts()` | `path.join(SERVICES_CONFIG.root, rel)` — **không** `path.resolve`, **không** kiểm tra path traversal. Vì `rel` hard-code trong catalog nên hiện tại an toàn; **nếu chuyển catalog sang JSON (D3) thì phải thêm validate `rel` không chứa `..` và không phải absolute path** |
| `buildCommand()` | `.vbs` → `command: 'wscript.exe'`, `args: ['//B', scriptPath, ...extraArgs]`; `.bat`/`.cmd` → `command: 'cmd.exe'`, `args: ['/d', '/c', scriptPath, ...extraArgs]`; khác → lỗi `Unsupported script type: <ext>`. `cwd = path.dirname(scriptPath)` — **quan trọng**, nhiều script sibling dùng đường dẫn tương đối |
| `runWait` vs `runDetached` | `runWait`: `spawn` có `shell:false`, `windowsHide:true`, thu `stdout`/`stderr`, resolve ở `close` **và** ở `error` (nên không bao giờ reject). `runDetached`: `detached:true`, `stdio:'ignore'`, `unref()`, trả `{}` ngay — **không có stdout** nên `ActionResult.stdout` là chuỗi thông báo cứng |
| `actionStatus` cho detach | Detach trả `ok:true` → luôn **200**, kể cả khi script chưa kịp chạy. Không có cách biết script thất bại ngoài poll health |
| `startArgs`/`stopArgs`/`deployArgs` | `docker-desktop`/`tunnel`/`tailscale`/`software-domain`/`software-lan`/`map`/`move`/`medic`/`sneat` đều `startArgs: ['/silent']`. `map.stopArgs: ['docker']`, `move.stopArgs: ['all']`, `medic.stopArgs: ['docker']`, tất cả `deployArgs: ['nopause']` để script không `pause` chờ Enter |
| Muốn thêm `software-lan` deploy từ app mới | `deployScript: 'Software_lan\\deploy\\deploy.bat'` + `deployArgs: ['nopause']` — đã có sẵn trong catalog |
| `PROBE_TIMEOUT_MS` | Áp cho **cả** `tasklist` (`execFileAsync` option `timeout`), `execFile` command probe, **và** `fetch` (qua `AbortController` + `setTimeout`, có `clearTimeout` trong `finally`) |
| `probeCommand` JSON path | Parse `stdout.toString()` bằng `JSON.parse`; `value == null ? '' : String(value)`; so với `jsonEquals ?? 'Running'`. `tailscale status --json` có thể trả `BackendState: "NeedsLogin"`/`"Stopped"` → hiện Down, đúng ý đồ |
| `probeProcess` | `tasklist /FI "IMAGENAME eq <name>" /NH` rồi `stdout.toLowerCase().includes(name.toLowerCase())`. ⚠️ Nếu process **không** chạy, `tasklist` in ra `INFO: No tasks are running...` — không chứa tên process → `online=false`, đúng. Nhưng nếu tên process là chuỗi con của thông báo thì có thể dương tính giả (không xảy ra với 2 tên hiện tại) |
| `spawnEnv()` | `extras.reverse()` **trước** vòng `unshift` để giữ thứ tự ưu tiên ban đầu; kiểm tra trùng bằng `toLowerCase()`. Đặt **cả** `Path` và `PATH` (Windows có thể dùng tên nào cũng được) + `DOTNET_ROOT` |
| FE `waitUntilReady` | `timeoutMs = 90_000`, poll `2000 ms`, **không có cleanup khi unmount**, `catch {}` bỏ qua lỗi mạng và tiếp tục poll |
| FE `measureTableBodyHeight` | `max(120, container.clientHeight - headerHeight - paginationHeight)`; `paginationHeight = 0` vì `pagination={false}`; `ResizeObserver` observe `.ops-services-panel` |
| FE cột bảng | `Service`(220) / `Open`(100) / `Trạng thái`(130) / `Port / Process`(auto) / `Thao tác`(260); `scroll={{ y: scrollY, x: 980 }}` — **x:980 là ngưỡng cuộn ngang cứng**, cần giữ nếu thêm cột |
| FE chặn sự kiện | `onClick={e => e.stopPropagation()}` ở nút Open và ở `<Space>` Thao tác — nếu bỏ, bấm Start sẽ **đồng thời** trigger click dòng → gọi thêm 1 probe |
| `INFRA_SERVICE_IDS` | Nằm ở **FE**, không ở catalog. Chuyển vào catalog (vd `group: 'apps'\|'infra'`) là cải tiến hợp lý khi tách, nhưng làm ở giai đoạn 2 |
| `antd` v6 | `Dropdown` dùng `popupRender` (không phải `dropdownRender` của v5). Giữ `antd@^6.4.3` |
| Không có `types.ts` ở BE | Type của Services là nội bộ module (`ops-catalog.ts`, `ops-probe.ts`). `backend/src/types.ts` **không** chứa gì của Services → **không cần lọc** |
| Không có test nào | `backend/tests/` có 3 file đều thuộc module khác. `tests/setup.ts` chỉ set biến `OFFLINE_*`/`MUSIC_FOLDER`/`JOURNAL_*` → app mới **không copy** |
