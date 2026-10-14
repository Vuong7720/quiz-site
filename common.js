// Tiện ích dùng chung cho các trang
(function () {
  // "Đề thi Tiếng Anh" → "de-thi-tieng-anh"
  function slugify(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Thứ tự đề trong bộ: theo "order", rồi theo tên (Đề 2 trước Đề 10)
  function compareInSeries(a, b) {
    return ((a.order || 1e9) - (b.order || 1e9)) ||
      String(a.title).localeCompare(String(b.title), 'vi', { numeric: true });
  }

  var ACCENTS = ['#2f6fed', '#7a5af8', '#ee46bc', '#f04438', '#f79009', '#12b76a', '#06aed4', '#6172f3'];
  function accent(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ACCENTS[h % ACCENTS.length];
  }

  function loadExams() {
    return fetch('exams.json?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (d) { return Array.isArray(d) ? d : []; });
  }

  window.QuizUtil = { slugify: slugify, escapeHtml: escapeHtml, compareInSeries: compareInSeries, accent: accent, loadExams: loadExams };
})();
