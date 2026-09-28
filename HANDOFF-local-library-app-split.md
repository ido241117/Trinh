# HANDOFF — Tách OFFLINE LIBRARY (app đọc sách) ra repo riêng

> **Người nhận:** agent/dev thực hiện việc tách trong repo mới.
> **Nguồn tham chiếu (read-only, KHÔNG sửa):** `D:\PhanLeThien\Software_lan`
> **Repo nguồn (git):** `https://git.phanlethien.xyz/idoadmin/Software_lan.git` (commit `63e37a0`, working tree đang dirty — copy theo đĩa, không copy theo commit)
> **Mục tiêu:** tách module **Offline Library** (thư viện EPUB/PDF offline + trình đọc) thành app độc lập.
> **Khác với app Music:** module này **không dùng chung DB với `musicplayer`** — nó có MongoDB riêng (`Projectd_d3`) và thư mục blob riêng (`D:\Data\Book*`). Blob được dùng chung với **trình scrape Hako/DocLN bên ngoài repo**, không phải với `Software_lan`.
> Toàn bộ đường dẫn là **đường dẫn tuyệt đối** trên máy hiện tại.

---

## 0. Tóm tắt nhanh

| Hạng mục | Hiện trạng | Sau khi tách |
|---|---|---|
| Bản chất module | Web app đọc sách: grid thư viện + trang chi tiết + trình đọc EPUB (iframe) & PDF (pdf.js) | App độc lập 3 trang |
| Nguồn dữ liệu | 3 collection Mongo: `books_hako` (do **scraper ngoài** ghi), `books_epub`, `books_pdf` (do app import) | Giữ nguyên DB + collection để tái dùng dữ liệu ngay |
| Backend | 1 route file (402 dòng) + 2 service lớn (933 + 1166 dòng) | Copy nguyên, chỉ rút `db.ts`/`app.ts` |
| Frontend | 9 file trong `pages/local-library` + 1 hook + 2 lib helper | Copy nguyên + viết lại shell/router |
| DB | DB riêng `Projectd_d3`, 3 collection | Dùng lại y nguyên (không có ai khác ghi DB này) |
| Blob | `D:\Data\Book`, `D:\Data\Book-nopicture`, `D:\Data\Import`, `D:\Data\Book-cover` | **Bắt buộc giữ đúng 4 path** — scraper ngoài ghi vào đó |
| Tool ngoài | Node + `pdfinfo.exe`, `pdftoppm.exe` (poppler), `explorer.exe` | App mới phải có poppler trong `PATH` |
| FE deps mới | `jszip`, `pdfjs-dist` (không dùng ở module music) | Copy sang app mới |
| Blocker chính | `books_hako` do scraper ngoài sinh; app **chỉ đọc**, không import Hako | Quyết định D1 (§9) về việc ai ghi `books_hako` |

---

## 1. Kiến trúc hiện tại (điểm nối)

### 1.1 Backend

`D:\PhanLeThien\Software_lan\backend\src\app.ts` (dòng 43 — **toàn bộ** phần cần bứng):

```ts
app.use('/api/local-library', createLocalLibraryRouter(LOCAL_LIBRARY_CONFIG.imgDir))
```

`D:\PhanLeThien\Software_lan\backend\src\index.ts` — bootstrap `connectDb()` → `createApp()` → `listen(PORT ?? 2108)`.
`D:\PhanLeThien\Software_lan\backend\src\db.ts` — 1 `MongoClient`, 4 handle DB; handle của module này là `getLocalLibraryDb()`, tên DB = `LOCAL_LIBRARY_MONGODB_DB ?? 'Projectd_d3'`.

### 1.2 Frontend

`D:\PhanLeThien\Software_lan\frontend\src\App.tsx`:

```tsx
const LocalLibraryPage         = lazy(() => import('./pages/local-library'))
const LocalLibraryDetailRoute  = lazy(() => import('./pages/local-library/LocalLibraryDetailRoute'))
const LocalLibraryReadRoute    = lazy(() => import('./pages/local-library/LocalLibraryReadRoute'))
...
<Route path="/local-library" element={<LocalLibraryPage />} />
<Route path="/local-library/books/:bookId" element={<LocalLibraryDetailRoute />} />
<Route path="/local-library/books/:bookId/read" element={<LocalLibraryReadRoute />} />
```

`D:\PhanLeThien\Software_lan\frontend\src\routes\paths.ts`:
- `TAB_PATHS['local-library'] = '/local-library'`
- `localLibraryBookPath(bookId)` → `/local-library/books/<encoded>`
- `localLibraryReadPath(bookId)` → `/local-library/books/<encoded>/read`
- `defaultPathFromStorage()` có nhánh legacy: giá trị `'books'` trong `localStorage['app-active-tab']` → `/local-library`

`D:\PhanLeThien\Software_lan\frontend\src\components\Sidebar\Sidebar.tsx` (dòng 74-83): tab `'local-library'`, `title: 'Offline Library'`, `shortLabel: 'Books'`.

**Module này KHÔNG phụ thuộc state nhạc/player** — nó là module tách sạch nhất trong 4 module. Chỉ phụ thuộc: `api.ts`, `types.ts`, `utils.ts`, `index.css`, `routes/paths.ts`, `Sidebar`.

---

## 2. ĐƯỜNG DẪN TUYỆT ĐỐI — Inventory file nguồn

### 2.1 Backend — COPY NGUYÊN

| # | Đường dẫn tuyệt đối | Dòng | Vai trò |
|---|---|---|---|
| B1 | `D:\PhanLeThien\Software_lan\backend\src\routes\local-library.ts` | 402 | Toàn bộ 12 endpoint REST; multer cho import sách (200 MB) + cover (10 MB) |
| B2 | `D:\PhanLeThien\Software_lan\backend\src\services\book-read-service.ts` | 1166 | Resolve path + bảo vệ path traversal, mở file/folder, DTO mapping, list/union aggregate 3 collection, đọc/ghi tiến độ đọc, parse TOC EPUB (JSZip + regex docln) |
| B3 | `D:\PhanLeThien\Software_lan\backend\src\services\book-import-service.ts` | 933 | Import EPUB/PDF: parse metadata, đếm từ/trang, trích cover, cấp `key`/ID kế tiếp, update title/cover, xoá sách |
| B4 | `D:\PhanLeThien\Software_lan\backend\src\models\local-library.model.ts` | 72 | Interface document + 3 hàm `getLocalLibrary*Collection()` + `parseLocalLibraryItemId` / `toLocalLibraryItemId` |
| B5 | `D:\PhanLeThien\Software_lan\backend\src\config\local-library.ts` | 48 | `LOCAL_LIBRARY_CONFIG` + `resolveHakoBookDir` / `resolveImportDir` / `listAllowedLibraryRoots` |

### 2.2 Backend — COPY RỒI LỌC

| # | Đường dẫn tuyệt đối | Việc phải làm |
|---|---|---|
| B6 | `D:\PhanLeThien\Software_lan\backend\src\types.ts` | 207 dòng cho 9 module → chỉ giữ block Offline Library: `BookReadingProgressLocationDTO`, `BookReadingProgressDTO`, `LocalLibrarySourceDTO`, `LocalLibrarySort`, `LocalLibrarySourceFilter`, `LocalLibraryListItemDTO`, `LocalLibraryDetailDTO`, `LocalLibraryTocChapterDTO`, `LocalLibraryTocDTO`, `LocalLibraryListResponse` (dòng 25-99) |
| B7 | `D:\PhanLeThien\Software_lan\backend\src\db.ts` | 50 dòng, 4 DB → rút còn 1 `getLocalLibraryDb()`. **Giữ đúng env `LOCAL_LIBRARY_MONGODB_DB` + default `'Projectd_d3'`** |
| B8 | `D:\PhanLeThien\Software_lan\backend\src\app.ts` | 58 dòng → rút còn cors + json + `/health` + router local-library + static `frontend/dist` |
| B9 | `D:\PhanLeThien\Software_lan\backend\src\index.ts` | 19 dòng, copy gần nguyên (đổi `PORT` nếu chạy cùng máy — xem D3) |
| B10 | `D:\PhanLeThien\Software_lan\backend\package.json` | 36 dòng. Giữ: `cors`, `dotenv`, `express@^4`, `jszip`, `mongodb`, `multer`, `sharp`. Bỏ: `md5`, `music-metadata`, `node-id3`, `xlsx`. Giữ devDeps: `tsx`, `typescript`, `vitest`, `supertest`, `@types/*` |
| B11 | `D:\PhanLeThien\Software_lan\backend\tsconfig.json` | 16 dòng, copy nguyên |
| B12 | `D:\PhanLeThien\Software_lan\backend\vitest.config.ts` | 8 dòng, copy nguyên (`environment: 'node'`, `setupFiles: ['./tests/setup.ts']`) |

### 2.3 Backend tests — COPY + SỬA

| # | Đường dẫn tuyệt đối | Ghi chú |
|---|---|---|
| BT1 | `D:\PhanLeThien\Software_lan\backend\tests\book-read-service.test.ts` | Test resolve path theo `OFFLINE_EPUB_DIR` / `OFFLINE_IMPORT_DIR` — **đây là test duy nhất bao phủ module này**, phải copy |
| BT2 | `D:\PhanLeThien\Software_lan\backend\tests\book-import-service.test.ts` | Test parse EPUB/PDF metadata |
| BT3 | `D:\PhanLeThien\Software_lan\backend\tests\setup.ts` | 9 dòng. Rút còn 4 dòng env của module này (`OFFLINE_EPUB_DIR`, `OFFLINE_EPUB_NOPICTURE_DIR`, `OFFLINE_IMPORT_DIR`, `OFFLINE_IMG_DIR`) với giá trị test `D:\TestData\*` |
| — | `backend\tests\ai-quota-cycle.test.ts` | Của module khác — bỏ |

### 2.4 Frontend — COPY NGUYÊN

| # | Đường dẫn tuyệt đối | Dòng | Vai trò |
|---|---|---|---|
| F1 | `D:\PhanLeThien\Software_lan\frontend\src\pages\local-library\index.tsx` | 491 | Trang danh sách: grid card, search, drawer "Bộ lọc & Sắp xếp nâng cao", context menu chuột phải (Chi tiết/Xóa/Tải/Đọc), nút "Thêm sách" (import file), khôi phục vị trí scroll sau khi xoá |
| F2 | `D:\PhanLeThien\Software_lan\frontend\src\pages\local-library\LocalLibraryCard.tsx` | 98 | Card bìa + hover info (Source/Key/ID/Last update/Số từ-Số trang/Size) + nút xoá "lịch sử đọc" |
| F3 | `D:\PhanLeThien\Software_lan\frontend\src\pages\local-library\LocalLibraryDetailPage.tsx` | 483 | Trang chi tiết: metadata, TOC, đổi title, đổi cover, tải file, mở folder, xoá |
| F4 | `D:\PhanLeThien\Software_lan\frontend\src\pages\local-library\LocalLibraryDetailRoute.tsx` | 17 | Wrapper `useParams`/`useNavigate` cho trang chi tiết |
| F5 | `D:\PhanLeThien\Software_lan\frontend\src\pages\local-library\LocalLibraryReadPage.tsx` | 1047 | **Trình đọc**: EPUB render trong `<iframe sandbox="allow-same-origin allow-scripts">`, PDF qua `pdfjs-dist/legacy`, TOC sidebar, theme reader, font-size/margin, lưu tiến độ, chiến lược lite→full |
| F6 | `D:\PhanLeThien\Software_lan\frontend\src\pages\local-library\LocalLibraryReadRoute.tsx` | 15 | Wrapper route cho trình đọc |
| F7 | `D:\PhanLeThien\Software_lan\frontend\src\pages\local-library\books.css` | 822 | Style grid/card/filter drawer |
| F8 | `D:\PhanLeThien\Software_lan\frontend\src\pages\local-library\local-library.css` | 133 | Style context menu |
| F9 | `D:\PhanLeThien\Software_lan\frontend\src\pages\local-library\book-read.css` | 310 | Style trình đọc (dùng nhóm biến `--reader-*`) |
| F10 | `D:\PhanLeThien\Software_lan\frontend\src\hooks\useLocalLibrary.ts` | 192 | Hook list + phân trang 200/page, debounce search 250 ms, persist query vào `localStorage['local-library-query']`, `refresh`/`softRefresh`/`removeBook` |
| F11 | `D:\PhanLeThien\Software_lan\frontend\src\lib\epub-reader-utils.ts` | 107 | Theme reader (dark/light/parchment), CSS inject cho iframe, `resolvePath`, `mimeForExtension`, `parseEpubSpine` (JSZip + DOMParser) |

### 2.5 Frontend — COPY RỒI LỌC

| # | Đường dẫn tuyệt đối | Việc phải làm |
|---|---|---|
| F12 | `D:\PhanLeThien\Software_lan\frontend\src\api.ts` | 737 dòng cho 9 module → chỉ giữ nhóm local library (dòng 337-510): `fetchLocalLibrary`, `getLocalLibraryCoverUrl`, `fetchLocalLibraryBook`, `fetchLocalLibraryBookToc`, `getLocalLibraryFileUrl`, `openLocalLibraryFolder`, `updateLocalLibraryReadingProgress`, `updateLocalLibraryLastRead`, `clearLocalLibraryLastRead`, `importLocalLibraryBook`, `updateLocalLibraryBook`, `deleteLocalLibraryBook` |
| F13 | `D:\PhanLeThien\Software_lan\frontend\src\types.ts` | 267 dòng → chỉ giữ block Offline Library (xem F12/B6 tương ứng ở FE: `LocalLibrarySource`, `LocalLibrarySourceFilter`, `LocalLibrarySort`, `LocalLibraryListItemDTO`, `LocalLibraryDetailDTO`, `LocalLibraryTocChapterDTO`, `LocalLibraryTocDTO`, `LocalLibraryListResponse`) |
| F14 | `D:\PhanLeThien\Software_lan\frontend\src\utils.ts` | 45 dòng dùng chung → module này cần **`formatDateDdMmYyyy`** (dùng ở `LocalLibraryCard`, `LocalLibraryDetailPage`). Các hàm `formatDuration*` thuộc module music, bỏ được |
| F15 | `D:\PhanLeThien\Software_lan\frontend\src\lib\windows-path.ts` | 9 dòng — `trimWindowsFilePathToFolder()`, được `LocalLibraryDetailPage` dùng cho nút "mở folder". Copy |
| F16 | `D:\PhanLeThien\Software_lan\frontend\src\lib\windows-path.test.ts` | 9 dòng — copy kèm |
| F17 | `D:\PhanLeThien\Software_lan\frontend\src\index.css` | 219 dòng — **BẮT BUỘC copy**: `books.css`/`local-library.css` đọc nhóm `--color-*`, `--shadow-*`; `book-read.css` đọc nhóm `--reader-*` (24 biến, định nghĩa **chỉ ở `:root`**, không có bản `html.dark` → chrome trình đọc luôn tối) |
| F18 | `D:\PhanLeThien\Software_lan\frontend\src\main.tsx` | 14 dòng — copy; thêm `BrowserRouter` (app có 3 route) |
| F19 | `D:\PhanLeThien\Software_lan\frontend\src\App.tsx` | 326 dòng — **viết lại**: chỉ còn `ConfigProvider` + theme + `<Routes>` 3 route local library. Bỏ `useLibrary`/`usePlayer`/`Player`/`<audio>`/`NowPlayingProvider`/8 tab khác |
| F20 | `D:\PhanLeThien\Software_lan\frontend\src\context\AppThemeContext.tsx` | 30 dòng — copy nếu muốn giữ theme light/dark (nút đổi theme hiện nằm trong `Sidebar.tsx`) |
| F21 | `D:\PhanLeThien\Software_lan\frontend\src\lib\antd-message.ts` | 41 dòng — override `message.error` thành toast sticky; các trang local library dùng `message.error(...)` → **nên copy** + import ở `main.tsx` |

### 2.6 Cấu hình frontend (copy + sửa)

| # | Đường dẫn tuyệt đối | Sửa gì |
|---|---|---|
| F22 | `D:\PhanLeThien\Software_lan\frontend\package.json` | 34 dòng. Giữ toàn bộ dep hiện có **trừ** không cần gì thêm; `jszip` + `pdfjs-dist` **bắt buộc**; `antd`, `@ant-design/icons`, `react`, `react-dom`, `react-router-dom`. Có thể bỏ `dayjs` nếu không dùng (antd kéo theo) |
| F23 | `D:\PhanLeThien\Software_lan\frontend\vite.config.ts` | 19 dòng. `server.proxy['/api'] = 'http://localhost:2108'` → đổi port BE app mới; `port: 2413` → đổi nếu chạy cùng máy |
| F24 | `D:\PhanLeThien\Software_lan\frontend\tsconfig.json` | 17 dòng, copy nguyên |
| F25 | `D:\PhanLeThien\Software_lan\frontend\tailwind.config.js` | 9 dòng, copy nguyên |
| F26 | `D:\PhanLeThien\Software_lan\frontend\postcss.config.js` | copy nguyên |
| F27 | `D:\PhanLeThien\Software_lan\frontend\index.html` | 24 dòng — đổi title |
| F28 | `D:\PhanLeThien\Software_lan\frontend\public\Favicon.jpg` | copy |
| F29 | `D:\PhanLeThien\Software_lan\frontend\src\test-setup.ts` | 40 dòng — copy nguyên (mock ResizeObserver/matchMedia/getComputedStyle/HTMLMediaElement) |

### 2.7 Deploy / vận hành (tham khảo, phải làm bản mới)

| # | Đường dẫn tuyệt đối | Ghi chú |
|---|---|---|
| D-1 | `D:\PhanLeThien\Software_lan\deploy\deploy.bat` | 63 dòng: build FE → build BE → `stop.bat` → `wscript start-prod.vbs /silent /force` |
| D-2 | `D:\PhanLeThien\Software_lan\deploy\start-prod.vbs` | 114 dòng: chạy ẩn `node backend\dist\index.js`, env `PORT=2411` + `DOTENV_CONFIG_PATH=<root>\backend\.env`, health-check `/health` tối đa 90 s. **Hard-code port 2411** → app mới phải đổi |
| D-3 | `D:\PhanLeThien\Software_lan\deploy\stop.bat` | 6 dòng: kill node theo regex `PhanLeThien\Software_lan\backend\dist\index\.js` → **phải đổi path app mới**, nếu không sẽ không tắt được app mới |
| D-4 | `D:\PhanLeThien\Software_lan\deploy\start.bat` | 13 dòng: dev, mở browser `:2413` rồi `npm run dev` |
| D-5 | `D:\PhanLeThien\Software_lan\package.json` | 17 dòng: root scripts (`dev` concurrently, `build`, `start:prod`, `test`, `install:all`) |
| D-6 | `D:\PhanLeThien\Software_lan\backend\.env.example` | 33 dòng — copy 4 biến `OFFLINE_*` + `LOCAL_LIBRARY_MONGODB_DB` sang `.env.example` của app mới |
| D-7 | `D:\PhanLeThien\Software_lan\backend\.env` | ⚠️ File thật, **không copy vào repo** |

---

## 3. Hợp đồng API

Mount hiện tại: `app.use('/api/local-library', createLocalLibraryRouter(imgDir))`. Factory nhận `imgDir = LOCAL_LIBRARY_CONFIG.imgDir`.

| Method | Path | Input | Output | Ghi chú |
|---|---|---|---|---|
| GET | `/api/local-library` | `q? source? sort? page? limit?` | `LocalLibraryListResponse` | `limit` default 48, **max 100**; `page` default 1; `sort` ∈ 13 giá trị (§4.2) |
| POST | `/api/local-library/import` | multipart field `book` hoặc `epub`; kèm `lastModified` (số ms hoặc chuỗi ngày) | `201` + `LocalLibraryDetailDTO` | **max 200 MB**, chỉ nhận tên file `.epub`/`.pdf`; multer lưu vào `tmpdir()` rồi xoá sau khi xong; tên file bị mojibake được sửa qua `latin1→utf8` |
| POST | `/api/local-library/open-folder` | `{ folderPath: string }` | `{ ok: true }` | Validate path nằm trong allowed roots rồi `spawn('explorer.exe', [path], { detached, stdio:'ignore' })` |
| GET | `/api/local-library/cover/:id` | — | `image/jpeg` | `Cache-Control: max-age=86400`; 404 nếu không có cover/không thấy file |
| PATCH | `/api/local-library/:id/progress` | `{ locationKey, spineIndex?, chapterPath?, scrollPercent?, scrollTop? }` | `LocalLibraryDetailDTO` | Ghi `readingProgress` |
| PATCH | `/api/local-library/:id/last-read` | `{ locationKey? }` | `LocalLibraryDetailDTO` | Set `lastReadAt = now` |
| PATCH | `/api/local-library/:id` | multipart `cover?` (≤10 MB, jpg/png/webp) + `title?` | `LocalLibraryDetailDTO` | **403 với sách `hako`**; xoá cover cũ khi đổi |
| DELETE | `/api/local-library/:id` | — | `{ ok: true }` | **403 với sách `hako`**; xoá DB row + cover + file trên đĩa (500 nếu xoá file thất bại) |
| DELETE | `/api/local-library/:id/last-read` | — | `LocalLibraryDetailDTO` | Xoá lịch sử đọc |
| GET | `/api/local-library/:id/file` | `?variant=lite\|full` (default `full`), `?download=1` | stream file | `Content-Type: application/epub+zip` hoặc `application/pdf`; header `X-EPUB-Variant`; `Cache-Control: private, max-age=3600`; `inline` hoặc `attachment` |
| GET | `/api/local-library/:id/toc` | — | `{ chapters: [{ title, href, slug }] }` | Lỗi trả thêm `errorCode`; parse từ EPUB (xem §4.3) |
| GET | `/api/local-library/:id` | — | `LocalLibraryDetailDTO` | 400 nếu id sai định dạng |

**Định dạng `id` (bắt buộc giữ):** `"{source}:{objectIdHex24}"` với `source ∈ hako|epub|pdf`; regex `^(hako|epub|pdf):([a-f0-9]{24})$` (`parseLocalLibraryItemId`). `toLocalLibraryItemId()` sinh lại id khi map document → DTO.

**Mã lỗi có phân loại:** `LocalLibraryFileError` (400/403/404/500), `LocalLibraryUpdateError`, `LocalLibraryTocError` (kèm `errorCode`), `LocalLibraryImportError` (400/403/404/500). Route map `err.status` trực tiếp.

---

## 4. Dữ liệu

### 4.1 MongoDB

- Client: `MongoClient(MONGODB_URL)`; `MONGODB_URL` mặc định `mongodb://localhost:27017` (không set trong `.env` → dùng default).
- **DB riêng:** `getLocalLibraryDb()` = `LOCAL_LIBRARY_MONGODB_DB ?? 'Projectd_d3'`. ⚠️ `LOCAL_LIBRARY_CONFIG.dbName` (`config\local-library.ts` dòng 10) **không được dùng ở đâu cả** — dead config; tên DB thực tế đến từ `db.ts`. Đừng "sửa" theo `dbName` khi tách.
- Collections (tên override được bằng env):
  - `books_hako` (`LOCAL_LIBRARY_HAKO_COLLECTION`) — do scraper ngoài ghi; app **chỉ đọc**
  - `books_epub` (`LOCAL_LIBRARY_EPUB_COLLECTION`) — do app import
  - `books_pdf` (`LOCAL_LIBRARY_PDF_COLLECTION`) — do app import
- Không có index nào được tạo trong code (ngoài `_id`). `listLocalLibrary` dùng `$unionWith` + `$facet` trên 3 collection → cân nhắc index `title`/`lastUpdate` nếu dữ liệu lớn.

```ts
// books_hako
{ _id: ObjectId, hakoId: string, title: string, cover?: string|null,
  series_url?: string|null, lastUpdate?: Date|string|null, charCount?: number|null,
  drive?: string|null /* @deprecated, bỏ qua */, sizeKb?: number|null,
  lastReadAt?: Date|string|null, readingProgress?: { locationKey, spineIndex?, chapterPath?,
                                                     scrollPercent?, scrollTop?, savedAt? } }

// books_epub | books_pdf (LocalLibraryImportDocument)
{ _id: ObjectId, key: string /* vd "1.epub" | "12.pdf" */, title: string, cover?: string|null,
  lastUpdate?: Date|string|null, drive?: string|null /* @deprecated */, sizeKb?: number|null,
  charCount?: number|null, pageCount?: number|null, pdfVersion?: string|null,
  importSourceName?: string|null, importSourceSizeBytes?: number|null,
  lastReadAt?: Date|string|null, readingProgress?: { ... } }
```

### 4.2 Sort hợp lệ (`LocalLibrarySort`)

`''` (mặc định), `hako_id_asc|desc`, `title_asc|desc`, `length_asc|desc`, `size_asc|desc`, `last_read_asc|desc`, `last_update_asc|desc`.
FE mặc định `size_desc` (`useLocalLibrary.ts` `DEFAULT_QUERY`), có 6 nhóm sort trên UI và đảo chiều khi bấm lại.

### 4.3 Blob (thư mục file)

| Loại | Biến env | Giá trị thật | Nội dung |
|---|---|---|---|
| EPUB Hako (bản đầy đủ) | `OFFLINE_EPUB_DIR` | `D:\Data\Book` | File `<hakoId>` — **scraper ngoài** ghi |
| EPUB Hako bản "lite" (bỏ ảnh) | `OFFLINE_EPUB_NOPICTURE_DIR` | `D:\Data\Book-nopicture` | Cùng tên file; đọc trước cho nhanh rồi nâng cấp lên bản đầy đủ. Rỗng ⇒ tắt tính năng lite |
| Sách import | `OFFLINE_IMPORT_DIR` | `D:\Data\Import` | File `<key>` (vd `1.epub`); app ghi khi import/xoá |
| Cover | `OFFLINE_IMG_DIR` | `D:\Data\Book-cover` | Tên ngẫu nhiên `<random>.jpg`, sinh bằng `sharp` |

Quy tắc resolve path (giữ nguyên khi tách):
- `hako` → `path.win32.join(OFFLINE_EPUB_DIR, doc.hakoId)`
- import → `path.win32.join(OFFLINE_IMPORT_DIR, doc.key)`; nếu không thấy thì fallback tìm theo basename (có xử lý `legacyImportBasename` — key legacy không có tiền tố `I`)
- Mọi lần đọc file đều qua `assertReadableFile(filePath, rootDir, '.epub'|'.pdf')` → chặn path ngoài root; `open-folder` chỉ cho path nằm trong `listAllowedLibraryRoots()` = 3–4 root trên.
- PDF cover: `pdftoppm -f 1 -singlefile -jpeg -r 150` → `sharp.resize(480×720, fit:'contain', background:'#f5f7fb').jpeg({quality:90})`.
- EPUB charCount: `MIGRATE_CHARS_PER_WORD` (default `3.6`), `DEFAULT_CHARS_PER_PAGE = 1800`.

### 4.4 Tool ngoài bắt buộc

| Tool | Dùng cho | Nơi gọi |
|---|---|---|
| `pdfinfo.exe` | Đọc metadata PDF (`-enc UTF-8`) | `book-import-service.ts` dòng ~567 |
| `pdftoppm.exe` | Render trang 1 thành cover JPEG | `book-import-service.ts` dòng ~584 |
| `explorer.exe` | Mở folder chứa sách | `book-read-service.ts` dòng ~236 |

`pdfinfo`/`pdftoppm` thuộc **poppler-utils** — phải có trong `PATH`, nếu không thì import PDF sẽ tạo sách với metadata tối thiểu (title lấy từ tên file) và cover `status:'failed'` (không throw ra route, nhưng cover sẽ trống).

---

## 5. Biến môi trường

```dotenv
# Bắt buộc (config\local-library.ts dùng requireEnv → thiếu là app crash lúc khởi động)
OFFLINE_EPUB_DIR=D:\Data\Book
OFFLINE_IMPORT_DIR=D:\Data\Import
OFFLINE_IMG_DIR=D:\Data\Book-cover
# Tùy chọn (rỗng ⇒ tắt EPUB lite)
OFFLINE_EPUB_NOPICTURE_DIR=D:\Data\Book-nopicture

# MongoDB (đang comment trong .env ⇒ dùng default)
# MONGODB_URL=mongodb://localhost:27017
# LOCAL_LIBRARY_MONGODB_DB=Projectd_d3
# LOCAL_LIBRARY_HAKO_COLLECTION=books_hako
# LOCAL_LIBRARY_EPUB_COLLECTION=books_epub
# LOCAL_LIBRARY_PDF_COLLECTION=books_pdf
```

Biến khác: `PORT` (default 2108; prod `2411` qua `start-prod.vbs`), `FRONTEND_DIST`, `DOTENV_CONFIG_PATH`, và `MIGRATE_CHARS_PER_WORD` (hệ số quy đổi từ→"char" của EPUB, default 3.6).

Biến **không** cần ở app mới: `MUSIC_FOLDER`, `IMG_FOLDER`, `YTDLP_*`, `JOURNAL_ATTACHMENT_DIR`, `AI_QUOTA_ICON_DIR`, `ACCOUNTS_LOGO_DIR`, `DASHBOARD_BG_DIR`, `MONGODB_DB`, `JOURNAL_MONGODB_DB`.

---

## 6. Coupling phải xử lý

| # | Vấn đề | Cách xử lý |
|---|---|---|
| 6.1 | `LOCAL_LIBRARY_CONFIG.dbName` **không được dùng** (dead config); tên DB thật nằm ở `db.ts` | Khi tách, chọn một nguồn duy nhất (khuyến nghị: giữ `config\local-library.ts` làm nguồn và cho `db.ts` đọc từ đó) — nhưng **phải giữ nguyên tên DB `Projectd_d3`** để không mất dữ liệu |
| 6.2 | `pages\local-library\*` import `routes/paths.ts` (`localLibraryBookPath`, `localLibraryReadPath`) | `paths.ts` (52 dòng) chứa cả 8 tab → app mới **viết lại file paths nhỏ hơn** chỉ giữ 2 hàm + `TAB_PATHS` không cần |
| 6.3 | `index.tsx` (page) import `books.css` + `local-library.css`; `LocalLibraryReadPage` import `book-read.css` | Copy cả 3 file, **giữ nguyên tên class** (CSS không dùng CSS-module) |
| 6.4 | CSS phụ thuộc biến toàn cục trong `index.css` | **Bắt buộc** copy `index.css`. `--reader-*` (24 biến) chỉ nằm ở `:root` → chrome trình đọc luôn tối kể cả khi app ở light mode |
| 6.5 | `books_hako` do **scraper ngoài repo** ghi; app chỉ đọc, và chặn sửa/xoá Hako (403) | Sau khi tách, scraper vẫn ghi vào `Projectd_d3.books_hako` + `D:\Data\Book` — 2 app (Software_lan cũ nếu còn dùng, và app mới) **không** ghi đè nhau, nhưng nếu **cả hai** cùng chạy thì cùng đọc chung dữ liệu. Xem D1 |
| 6.6 | Không có coupling với music/journal/accounts | ZERO — module này không dùng `youtube-service`, không dùng `getDb()`, không dùng `Player` |
| 6.7 | `Sidebar.tsx` cung cấp cả tab **và** nút đổi theme | Nếu app mới bỏ Sidebar, phải tự thêm nút toggle `html.dark` (hoặc bỏ hẳn dark mode) |
| 6.8 | `pdfjs-dist` worker được import với `?url` (`LocalLibraryReadPage.tsx` dòng 14) | Giữ nguyên cách import này; đổi sang `new Worker(...)` thủ công sẽ vỡ với Vite |
| 6.9 | Trình đọc dùng `localStorage` riêng (không thấy key nào trong `pages/local-library` ngoài `local-library-query` ở hook) | Xem D3 về trùng origin |

---

## 7. Cấu trúc repo mới & thi công

### 7.1 Cây thư mục

```
<REPO_MỚI>\
├─ package.json                 # dev (concurrently), build, start:prod, test, install:all
├─ start.bat
├─ deploy\{deploy.bat, start-prod.vbs, stop.bat, start.bat}
├─ backend\
│  ├─ package.json  tsconfig.json  vitest.config.ts  .env  .env.example
│  ├─ src\
│  │  ├─ index.ts  app.ts  db.ts  types.ts
│  │  ├─ config\local-library.ts
│  │  ├─ models\local-library.model.ts
│  │  ├─ routes\local-library.ts
│  │  └─ services\{book-read-service.ts, book-import-service.ts}
│  └─ tests\{setup.ts, book-read-service.test.ts, book-import-service.test.ts}
└─ frontend\
   ├─ package.json  tsconfig.json  vite.config.ts  tailwind.config.js  postcss.config.js  index.html
   ├─ public\Favicon.jpg
   └─ src\
      ├─ main.tsx  index.css  api.ts  types.ts  utils.ts  test-setup.ts
      ├─ App.tsx                  # shell mới: ConfigProvider + 3 route
      ├─ lib\{antd-message.ts, epub-reader-utils.ts, windows-path.ts, windows-path.test.ts}
      ├─ context\AppThemeContext.tsx
      ├─ hooks\useLocalLibrary.ts
      └─ pages\local-library\{index.tsx, LocalLibraryCard.tsx, LocalLibraryDetailPage.tsx,
                              LocalLibraryDetailRoute.tsx, LocalLibraryReadPage.tsx,
                              LocalLibraryReadRoute.tsx, books.css, local-library.css, book-read.css}
```

### 7.2 `App.tsx` mới (rút từ `D:\PhanLeThien\Software_lan\frontend\src\App.tsx`)

Giữ: `ConfigProvider` + `THEME_COLORS` + `appTheme` state + effect toggle `html.dark` (dòng 39-106, 188-220), `<AppThemeProvider>`.
Đổi: `<Routes>` chỉ còn 3 route local library (dòng 282-284) + `<Route path="*" element={<Navigate to="/local-library" replace />} />`; bỏ toàn bộ `useLibrary`/`usePlayer`/`Player`/`<audio>`/`NowPlayingProvider`/`Sidebar`/lazy import của 7 module khác.

### 7.3 Lệnh copy gợi ý (PowerShell, chạy trên máy này)

```powershell
$SRC = 'D:\PhanLeThien\Software_lan'
$DST = '<REPO_MỚI>'   # <-- chốt trước khi chạy

# Backend
robocopy "$SRC\backend\src\routes"   "$DST\backend\src\routes"   local-library.ts /NFL /NDL
robocopy "$SRC\backend\src\services" "$DST\backend\src\services" book-read-service.ts book-import-service.ts /NFL /NDL
robocopy "$SRC\backend\src\models"   "$DST\backend\src\models"   local-library.model.ts /NFL /NDL
robocopy "$SRC\backend\src\config"   "$DST\backend\src\config"   local-library.ts /NFL /NDL
Copy-Item "$SRC\backend\tests\book-read-service.test.ts","$SRC\backend\tests\book-import-service.test.ts" "$DST\backend\tests\"
Copy-Item "$SRC\backend\tsconfig.json","$SRC\backend\vitest.config.ts" "$DST\backend\"

# Frontend
robocopy "$SRC\frontend\src\pages\local-library" "$DST\frontend\src\pages\local-library" /E /NFL /NDL
Copy-Item "$SRC\frontend\src\hooks\useLocalLibrary.ts" "$DST\frontend\src\hooks\"
Copy-Item "$SRC\frontend\src\lib\epub-reader-utils.ts","$SRC\frontend\src\lib\windows-path.ts","$SRC\frontend\src\lib\windows-path.test.ts","$SRC\frontend\src\lib\antd-message.ts" "$DST\frontend\src\lib\"
Copy-Item "$SRC\frontend\src\index.css","$SRC\frontend\src\utils.ts","$SRC\frontend\src\test-setup.ts","$SRC\frontend\src\main.tsx","$SRC\frontend\src\context\AppThemeContext.tsx" "$DST\frontend\src\"
Copy-Item "$SRC\frontend\src\context\AppThemeContext.tsx" "$DST\frontend\src\context\"
Copy-Item "$SRC\frontend\vite.config.ts","$SRC\frontend\tsconfig.json","$SRC\frontend\tailwind.config.js","$SRC\frontend\postcss.config.js","$SRC\frontend\index.html" "$DST\frontend\"
Copy-Item "$SRC\frontend\public\Favicon.jpg" "$DST\frontend\public\"

# Rồi LỌC TAY: api.ts, types.ts (FE + BE), App.tsx, db.ts, app.ts, tests\setup.ts, package.json (2 cái)
```

Sau khi copy: `npm run install:all`; **không** copy `node_modules`, `dist`.

---

## 8. Rủi ro & lưu ý vận hành

1. **`books_hako` là dữ liệu của scraper ngoài.** App không có endpoint import Hako, không sửa/xoá được (403). Nếu scraper ngừng chạy thì app mới vẫn đọc được dữ liệu cũ nhưng không có sách mới. Phải làm rõ ai chịu trách nhiệm cập nhật collection này (D1).
2. **API này có thể xoá file trên ổ đĩa.** `DELETE /:id` xoá DB row → cover → **file sách trong `OFFLINE_IMPORT_DIR`**. Không có thùng rác, không có xác nhận phía server. Chỉ chặn được sách `hako`.
3. **`POST /open-folder` spawn `explorer.exe` trên máy chạy backend.** App chỉ nên chạy localhost/LAN tin cậy; path đã được validate trong allowed roots nhưng đây vẫn là bề mặt tấn công nếu lộ ra Internet.
4. **Import là đồng bộ và nặng**: multer ghi file tạm (≤200 MB) → `JSZip.loadAsync` / `pdftoppm` + `sharp` ngay trong request. Sách lớn sẽ giữ connection lâu; không có progress/SSE như `ytdlp`. Timeout proxy (Vite) mặc định có thể cắt request → cần lưu ý khi test sách lớn.
5. **Trình đọc nâng cấp lite→full trong nền**: `LocalLibraryReadPage` nạp `variant=lite` trước (nếu `hasLiteFile`), rồi tải `full`. Nếu `OFFLINE_EPUB_NOPICTURE_DIR` không tồn tại, luồng này tự bỏ qua — nhưng đừng xoá nhầm biến, vì `openLocalLibraryFile` sẽ throw `404 Lite EPUB not available`.
6. **iframe sandbox**: `sandbox="allow-same-origin allow-scripts"` + inject CSS qua `contentDocument`. EPUB là nội dung do người dùng/scraper đưa vào → giữ nguyên sandbox, **không** thêm `allow-top-navigation`/`allow-popups`.
7. **`sharp` và `jszip` là native/heavy**: `sharp` cần đúng platform binary; nhớ copy `package-lock.json` tương ứng (hoặc để npm tự resolve) khi sang máy khác.
8. **Dead code / cần để ý khi refactor:** `localizeJournalAttachments` không liên quan; trong module này có `LOCAL_LIBRARY_CONFIG.dbName` và `resolveLocalLibraryFolderPath()` (export nhưng route không dùng — route nhận `folderPath` trực tiếp từ client). Nhiều helper được `export` **chỉ để test** (`buildHakoCollectionMatch`, `normalizeLocalLibrarySort`, `extractNcxChapterLinks`, …) — đừng xoá nhầm nếu giữ test.
9. **Working tree nguồn đang dirty** — copy theo đĩa.

---

## 9. Quyết định cần chốt

| ID | Câu hỏi | Khuyến nghị |
|---|---|---|
| **D1** | Ai ghi `books_hako` sau khi tách? | Giữ scraper ngoài ghi thẳng vào `Projectd_d3.books_hako` + `D:\Data\Book`; app mới chỉ đọc. Ghi rõ trong README app mới |
| **D2** | App `Software_lan` cũ có giữ Offline Library không? | Nếu bỏ hẳn: xoá 9 file `pages/local-library`, hook `useLocalLibrary`, tab Sidebar, 3 route trong `App.tsx`, 12 hàm API, route BE + 2 service + model + config. Nếu giữ tạm: 2 app cùng đọc DB `Projectd_d3` là an toàn (chỉ app mới được ghi) |
| **D3** | Port & origin app mới | Phải **khác** app cũ vì cùng key `localStorage['local-library-query']` (và `app-theme`, `app-active-tab`) — đề xuất BE `2110`, FE `2415`, prod `2413` (hoặc dải riêng bạn chọn) |
| **D4** | DB name | Giữ **nguyên `Projectd_d3`** + 3 tên collection. Đừng tạo DB mới nếu muốn dùng ngay 100% dữ liệu |
| **D5** | Có giữ dark mode / nút đổi theme? | Nếu bỏ Sidebar thì phải tự thêm toggle; `book-read.css` luôn tối nên không ảnh hưởng trình đọc |
| **D6** | Có giữ 3 route riêng hay gộp 1 trang? | Giữ 3 route (`/`, `/books/:bookId`, `/books/:bookId/read`) để không phải sửa `LocalLibraryDetailRoute`/`ReadRoute` |
| **D7** | Có copy `AppThemeContext` không? | Chỉ cần nếu giữ nút đổi theme ở D5 |

---

## 10. Checklist nghiệm thu

- [ ] `npm run install:all` + `npm run build` pass (BE `tsc`, FE `tsc && vite build`).
- [ ] `GET /health` → `{"status":"ok"}`.
- [ ] `GET /api/local-library?limit=48&page=1&sort=size_desc` trả đúng dữ liệu đang có trong `Projectd_d3` (đủ 3 source khi `source=all`).
- [ ] Filter `source=hako|epub|pdf` và 6 nhóm sort (asc/desc) hoạt động.
- [ ] Grid hiện cover; card thiếu cover hiện fallback "No cover + FORMAT".
- [ ] Click card → trang chi tiết: metadata, TOC, nút Tải, nút mở folder (mở đúng Explorer), đổi title, đổi cover, xoá (chỉ với epub/pdf).
- [ ] Nút "Thêm sách": import 1 `.epub` và 1 `.pdf` → xuất hiện trong grid; **kiểm tra cover PDF không rỗng** (xác nhận poppler có trong PATH).
- [ ] Đọc EPUB: mở được, TOC điều hướng được, đổi theme/font/margin, đóng rồi mở lại đúng vị trí (progress được lưu).
- [ ] Đọc PDF: render đúng, chuyển trang, số trang hiện đúng.
- [ ] Nếu có `OFFLINE_EPUB_NOPICTURE_DIR`: quan sát request `?variant=lite` chạy trước `?variant=full`.
- [ ] Sách `hako`: PATCH/DELETE trả **403**; nút Xóa trên UI bị chặn.
- [ ] `open-folder` với path ngoài allowed roots trả **403**.
- [ ] App `Software_lan` cũ vẫn build/chạy sau khi bị lấy module (theo D2).
- [ ] Port app mới khác app cũ; `deploy\stop.bat` mới chỉ kill đúng process của app mới.

---

## 11. Phụ lục — chi tiết dễ mất khi viết lại

| Chủ đề | Chi tiết |
|---|---|
| `listLocalLibrary` | `$unionWith` 3 collection + `$facet` để lấy `items`/`total` trong 1 round-trip; mỗi source có pipeline chuẩn hoá riêng (`buildHakoNormalizeStages`, `buildImportNormalizeStages`) để ra `NormalizedLocalLibraryRow` thống nhất; `numericId` parse từ `hakoId` hoặc `key` |
| Cấp ID khi import | `allocateNextLocalImportId()` = max ID quét từ **cả thư mục trên đĩa** (depth ≤6) **và** cả 2 collection + 1; `IMPORT_KEY_FILE = /^I?(\d+)\.(?:epub|pdf)$/i`; `importKey(id, ext)` |
| Chống trùng khi import | `assertNotDuplicateLocalImport()` so `importSourceName` + `importSourceSizeBytes` |
| EPUB metadata | `parseEpubMetadata()` đọc `META-INF/container.xml` → OPF → manifest/spine; cover: `findCoverHref` (ưu tiên `properties="cover-image"`) + fallback; `coverExtension` map về `.jpg|.png|.webp` |
| PDF metadata | `pdfinfo.exe -enc UTF-8` → parse `Pages/Title/Author/Subject/Keywords/Creator/Producer/CreationDate/ModDate/Encrypted/Page size/PDF version`; file PDF được **copy sang temp dir ASCII** trước khi gọi poppler (tránh lỗi path Unicode) |
| TOC EPUB | Nguồn theo thứ tự: file trong zip khớp `index_split_\d+\.html` / `index.html` / `toc.html` → `extractLinksFromListChaptersBlock` (docln `ul.list-chapters`) → `toc.ncx`/`nav.ncx` → `extractNcxChapterLinks`; base URL mặc định `https://docln.sbs`; `chapterSlugFromHref()` sinh slug |
| Tiến độ đọc | `readingProgress.locationKey` là khoá chính (mặc định = bookId); `spineIndex`, `chapterPath`, `scrollPercent` (0–1), `scrollTop`; `savedAt` ISO |
| Reader lite/full | `resolveLocalLibraryLiteFilePath()` chỉ có tác dụng với `source === 'hako'`; file lite cùng **basename** với file trong `D:\Data\Book` nhưng nằm ở `D:\Data\Book-nopicture` |
| `books.css` | 822 dòng: grid `auto-fill minmax`, hover overlay, chip filter, card context; dùng `--color-cover-placeholder`, `--color-cover-overlay*`, `--shadow-card-hover` |
| `book-read.css` | 310 dòng: toolbar/sidebar/floating controls của reader + khung PDF; **toàn bộ màu lấy từ `--reader-*`** (không theo theme app) |
