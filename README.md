# Quiz Site

Trang bài thi trắc nghiệm tĩnh (HTML/CSS/JS), chạy trên GitHub Pages, không cần database.

- `index.html`: danh sách bài thi (đọc từ `exams.json`), gom bộ đề
- `series.html`: trang một bộ đề
- `play.html`: trang làm bài (bài soạn câu hỏi chạy bằng `quiz-engine.js`; bài HTML chạy trong iframe cô lập)
- `create.html`: soạn câu hỏi (`quiz-editor.js`) hoặc dán HTML → xem trước → đăng (commit thẳng vào repo qua GitHub API)
- `exams/<tên>.json`: bài soạn câu hỏi · `exams/<tên>.html`: bài HTML
- `results.html` + `history.js`: lịch sử làm bài & câu sai, lưu trên máy người làm (localStorage)
- `manifest.webmanifest`, `sw.js`, `icons/`: cài như ứng dụng, dùng offline cho các trang/bài đã mở
- `crypto.js`: mã hóa bài có mật khẩu (AES-GCM) · `common.js`, `theme.js`: tiện ích chung

## Định dạng bài soạn câu hỏi (`exams/<tên>.json`)

```json
{
  "v": 1,
  "title": "Tên bài",
  "description": "Mô tả",
  "settings": { "mode": "one", "minutes": 15, "pass": 5, "pick": 0, "shuffleQuestions": false, "shuffleOptions": true, "color": "#2563eb" },
  "questions": [
    { "q": "Câu hỏi?", "options": ["A", "B", "C", "D"], "answer": 0, "explain": "Giải thích", "image": "data:image/jpeg;base64,..." }
  ]
}
```

Bài có mật khẩu được lưu dạng `{ "locked": { ...dữ liệu mã hóa... } }`.

## Deploy

1. Tạo repo mới trên GitHub (Public), đẩy toàn bộ thư mục này lên nhánh `main`.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main` / `(root)` → Save.
3. Sau ~1 phút trang chạy tại `https://<tài-khoản>.github.io/<tên-repo>/`.

## Tạo token để đăng bài

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. *Repository access*: **Only select repositories** → chọn repo này.
3. *Permissions → Repository permissions → Contents*: **Read and write**.
4. Copy token, mở `create.html` → **Cấu hình GitHub** → dán token → Lưu.

Token chỉ lưu trong trình duyệt, không nằm trong repo. Ai vào `create.html` mà không có token thì cũng không đăng được bài.
