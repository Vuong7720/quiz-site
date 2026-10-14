# Quiz Site

Trang bài thi trắc nghiệm tĩnh (HTML/CSS/JS), chạy trên GitHub Pages, không cần database.

- `index.html`: danh sách bài thi (đọc từ `exams.json`)
- `create.html`: dán HTML bài thi → xem trước → đăng (commit thẳng vào repo qua GitHub API)
- `exams/*.html`: các bài thi

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
