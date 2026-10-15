// Lịch sử làm bài & câu sai — lưu trên máy người làm bài (localStorage)
// Chỉ áp dụng cho bài "Soạn câu hỏi" (bài HTML tự chấm nên trang không biết điểm)
(function () {
  var KEY = 'quiz.history.v1';
  var MAX_ATTEMPTS = 30;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; }
  }

  // db = { [slug]: { title, attempts: [{ at, score, right, total, usedSec, passed }], wrong: { [questionKey]: { n, at } } } }
  function entry(db, slug) {
    return db[slug] || (db[slug] = { title: '', attempts: [], wrong: {} });
  }

  // Ghi kết quả một lượt làm bài. rows: [{ key, status: 'right' | 'wrong' | 'skip' }]
  function record(slug, title, result, isReview) {
    var db = load(), e = entry(db, slug), now = Date.now();
    e.title = title || e.title;
    if (!isReview) {
      e.attempts.push({
        at: now, score: result.score, right: result.right, total: result.total,
        usedSec: result.usedSec, passed: !!result.passed,
      });
      if (e.attempts.length > MAX_ATTEMPTS) e.attempts = e.attempts.slice(-MAX_ATTEMPTS);
    }
    // Câu sai / bỏ trống → thêm vào danh sách ôn; làm đúng → gỡ khỏi danh sách
    result.rows.forEach(function (r) {
      if (!r.key) return;
      if (r.status === 'right') delete e.wrong[r.key];
      else e.wrong[r.key] = { n: ((e.wrong[r.key] || {}).n || 0) + 1, at: now };
    });
    save(db);
    return summary(slug);
  }

  function summary(slug) {
    var e = load()[slug];
    if (!e) return null;
    var a = e.attempts;
    var best = a.reduce(function (m, x) { return Math.max(m, x.score); }, -1);
    return {
      title: e.title,
      attempts: a,
      count: a.length,
      last: a[a.length - 1] || null,
      best: best >= 0 ? best : null,
      wrongKeys: Object.keys(e.wrong || {}),
    };
  }

  function all() {
    var db = load();
    return Object.keys(db).map(function (slug) { return Object.assign({ slug: slug }, summary(slug)); })
      .filter(function (s) { return s.count || s.wrongKeys.length; });
  }

  function clear(slug) {
    if (!slug) { try { localStorage.removeItem(KEY); } catch (e) {} return; }
    var db = load(); delete db[slug]; save(db);
  }

  window.QuizHistory = { record: record, summary: summary, all: all, clear: clear };
})();
