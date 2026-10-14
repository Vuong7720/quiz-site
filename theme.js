// Chế độ sáng/tối: chạy trong <head> để không bị nháy màu khi tải trang
(function () {
  var KEY = 'quiz.theme';
  var root = document.documentElement;
  try { var saved = localStorage.getItem(KEY); if (saved) root.dataset.theme = saved; } catch (e) {}

  function isDark() {
    return root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function sync() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.textContent = isDark() ? '☀️' : '🌙';
      b.title = isDark() ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
    });
  }
  function toggle() {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) {}
    sync();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) { b.addEventListener('click', toggle); });
    sync();
  });
})();
