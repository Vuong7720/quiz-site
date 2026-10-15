// Trình làm bài của trang: hiển thị bài thi dạng dữ liệu (JSON) — bắt đầu → làm bài → kết quả
// Dùng: QuizEngine.mount(element, data, { icon, preview, onFinish })
(function () {
  var esc = function (s) { return QuizUtil.escapeHtml(s); };
  var LETTERS = 'ABCDEFGHIJ';
  var DEFAULTS = { mode: 'one', minutes: 0, pass: 5, pick: 0, shuffleQuestions: false, shuffleOptions: false, color: '#2563eb' };
  var uidSeq = 0;

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Chỉ nhận ảnh nhúng (data:image) hoặc link http(s)
  function safeImg(src) {
    return typeof src === 'string' && /^(data:image\/(png|jpe?g|gif|webp);base64,|https?:\/\/)/i.test(src) ? src : '';
  }
  function safeColor(c) {
    return typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : DEFAULTS.color;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return h ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
  }
  function fmtScore(x) { return Number(x).toLocaleString('vi-VN', { maximumFractionDigits: 1 }); }

  // Mã nhận diện câu hỏi (không đổi khi xáo trộn) → dùng để nhớ câu sai
  function keyOf(q) {
    var s = q.q + '\u0001' + q.options.join('\u0001'), h1 = 0x811c9dc5, h2 = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = (h2 * 31 + c) >>> 0;
    }
    return h1.toString(36) + h2.toString(36);
  }

  function fmtDate(t) {
    return new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // Biểu đồ cột nhỏ các lượt gần nhất
  function sparkBars(attempts, pass) {
    var a = attempts.slice(-12);
    return '<div class="qz-spark" title="Điểm các lượt gần nhất">' + a.map(function (x) {
      return '<i class="' + (x.score >= pass ? 'ok' : 'bad') + '" style="height:' + Math.max(8, x.score * 10) + '%" title="' + fmtScore(x.score) + ' điểm · ' + fmtDate(x.at) + '"></i>';
    }).join('') + '</div>';
  }

  function normalize(raw) {
    var d = raw || {};
    var s = Object.assign({}, DEFAULTS, d.settings || {});
    s.minutes = Math.max(0, +s.minutes || 0);
    s.pick = Math.max(0, parseInt(s.pick, 10) || 0);
    s.pass = Math.min(10, Math.max(0, +s.pass || 0));
    s.mode = s.mode === 'all' ? 'all' : 'one';
    s.color = safeColor(s.color);
    var questions = (Array.isArray(d.questions) ? d.questions : []).map(function (q) {
      var options = (Array.isArray(q.options) ? q.options : []).map(function (o) { return String(o); });
      var answer = parseInt(q.answer, 10);
      return {
        q: String(q.q || ''),
        options: options,
        answer: answer >= 0 && answer < options.length ? answer : 0,
        explain: q.explain ? String(q.explain) : '',
        image: safeImg(q.image),
      };
    }).filter(function (q) { return q.q.trim() && q.options.length >= 2; });
    questions.forEach(function (q) { q.key = keyOf(q); });
    return { title: String(d.title || 'Bài thi'), description: String(d.description || ''), settings: s, questions: questions };
  }

  function remarkFor(score, passed) {
    if (score >= 9.5) return 'Xuất sắc! Gần như hoàn hảo 🎉';
    if (score >= 8) return 'Rất tốt! Bạn nắm bài rất chắc 👏';
    if (score >= 6.5) return 'Khá tốt! Ôn thêm một chút là tuyệt vời 💪';
    if (passed) return 'Đạt yêu cầu. Xem lại các câu sai để tiến bộ hơn nhé!';
    return 'Chưa đạt. Đừng nản, ôn lại và thử lần nữa nhé 💪';
  }

  function mount(root, raw, opts) {
    opts = opts || {};
    if (root._qzDestroy) root._qzDestroy();

    var data = normalize(raw);
    var S = data.settings;
    var uid = 'qz' + (++uidSeq);
    var st = null, timerId = 0, closeModal = null, reviewTab = 'all', result = null;

    root.classList.add('qz');
    root.style.setProperty('--qz-accent', S.color);

    function ref(name) { return root.querySelector('[data-ref="' + name + '"]'); }
    function total() { return st.items.length; }
    function poolSize() { return S.pick > 0 && S.pick < data.questions.length ? S.pick : data.questions.length; }

    function toTop() {
      root.scrollTop = 0;
      var top = root.getBoundingClientRect().top;
      if (top < 0) window.scrollBy(0, top - 8);
    }

    function beforeUnload(e) {
      if (st && !st.done) { e.preventDefault(); e.returnValue = ''; }
    }

    function stopRun() {
      clearInterval(timerId); timerId = 0;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', beforeUnload);
      root.classList.remove('qz-pal-open');
    }

    // ---------- Hộp thoại tự thiết kế ----------
    function modal(o) {
      return new Promise(function (resolve) {
        var el = document.createElement('div');
        el.className = 'qz-modal';
        el.innerHTML =
          '<div class="qz-card qz-modal-box" role="dialog" aria-modal="true">' +
          (o.icon ? '<div class="qz-modal-icon">' + o.icon + '</div>' : '') +
          '<h3>' + esc(o.title) + '</h3><p>' + o.body + '</p>' +
          '<div class="qz-modal-actions">' +
          (o.cancel ? '<button class="qz-btn" data-m="0">' + esc(o.cancel) + '</button>' : '') +
          '<button class="qz-btn qz-primary" data-m="1">' + esc(o.ok) + '</button></div></div>';
        function done(v) {
          el.remove();
          document.removeEventListener('keydown', esc_);
          closeModal = null;
          resolve(v);
        }
        function esc_(e) { if (e.key === 'Escape' && o.cancel) done(false); }
        el.addEventListener('click', function (e) {
          var b = e.target.closest('[data-m]');
          if (b) done(b.dataset.m === '1');
          else if (e.target === el && o.cancel) done(false);
        });
        document.addEventListener('keydown', esc_);
        closeModal = function () { done(false); };
        root.appendChild(el);
        el.querySelector('[data-m="1"]').focus();
      });
    }

    function stats() { return opts.getStats ? opts.getStats() : null; }
    function wrongInExam(st_) {
      var keys = (st_ && st_.wrongKeys) || [];
      return data.questions.filter(function (q) { return keys.indexOf(q.key) >= 0; });
    }

    // ---------- Lượt làm bài mới ----------
    // review = true: chỉ làm lại các câu từng sai, không giới hạn thời gian
    function newAttempt(review) {
      var qs = data.questions.map(function (q, i) { return Object.assign({}, q, { idx: i }); });
      if (review) {
        var wrong = wrongInExam(stats()).map(function (q) { return q.key; });
        qs = shuffle(qs.filter(function (q) { return wrong.indexOf(q.key) >= 0; }));
      } else if (S.pick > 0 && S.pick < qs.length) {
        qs = shuffle(qs).slice(0, S.pick);
        if (!S.shuffleQuestions) qs.sort(function (a, b) { return a.idx - b.idx; });
      } else if (S.shuffleQuestions) {
        qs = shuffle(qs);
      }
      var items = qs.map(function (q) {
        var o = q.options.map(function (text, i) { return { text: text, correct: i === q.answer }; });
        if (S.shuffleOptions || review) o = shuffle(o);
        return Object.assign({}, q, { opts: o });
      });
      st = {
        items: items, answers: items.map(function () { return null; }), flags: {}, review: !!review,
        cur: 0, start: Date.now(), end: S.minutes > 0 && !review ? Date.now() + S.minutes * 60000 : 0, done: false,
      };
    }

    // ---------- Màn hình bắt đầu ----------
    function renderStart() {
      stopRun();
      st = null;
      var n = poolSize();
      var maxOpts = data.questions.reduce(function (m, q) { return Math.max(m, q.options.length); }, 2);
      if (!data.questions.length) {
        root.innerHTML = '<div class="qz-wrap qz-narrow"><div class="qz-card qz-start"><div class="qz-start-icon">📭</div>' +
          '<h1 class="qz-title">' + esc(data.title) + '</h1><p class="qz-desc">Bài thi chưa có câu hỏi nào.</p></div></div>';
        return;
      }
      root.innerHTML =
        '<div class="qz-wrap qz-narrow"><div class="qz-card qz-start qz-enter">' +
        '<div class="qz-start-icon">' + esc(opts.icon || '📝') + '</div>' +
        '<h1 class="qz-title">' + esc(data.title) + '</h1>' +
        (data.description ? '<p class="qz-desc">' + esc(data.description) + '</p>' : '') +
        '<div class="qz-tiles">' +
        '<div class="qz-tile"><span>📝</span><b>' + n + '</b><small>câu hỏi</small></div>' +
        '<div class="qz-tile"><span>⏱</span><b>' + (S.minutes > 0 ? S.minutes : '∞') + '</b><small>' + (S.minutes > 0 ? 'phút' : 'không giới hạn') + '</small></div>' +
        '<div class="qz-tile"><span>🎯</span><b>' + fmtScore(S.pass) + '/10</b><small>điểm đạt</small></div>' +
        '</div><ul class="qz-guide">' +
        (n < data.questions.length ? '<li>Mỗi lượt gồm <b>' + n + ' câu ngẫu nhiên</b> từ ngân hàng ' + data.questions.length + ' câu.</li>' : '') +
        '<li>' + (S.mode === 'one' ? 'Mỗi lần hiện một câu, dùng bảng số câu để chuyển nhanh.' : 'Tất cả câu hỏi hiện trên một trang.') + '</li>' +
        '<li>Bấm 🚩 để đánh dấu câu muốn xem lại trước khi nộp.</li>' +
        (S.minutes > 0 ? '<li>Hết giờ, bài sẽ được nộp tự động.</li>' : '') +
        '<li class="qz-kbd-hint">Phím tắt: 1–' + maxOpts + ' hoặc A–' + LETTERS[maxOpts - 1] + ' để chọn đáp án' + (S.mode === 'one' ? ', ← → để chuyển câu' : '') + '.</li>' +
        '</ul><button class="qz-btn qz-primary qz-big" data-act="start">Bắt đầu làm bài →</button>' +
        historyHtml() +
        (opts.onPrint
          ? '<div class="qz-print-row"><button class="qz-btn qz-ghost" data-act="print" data-mode="paper">🖨️ In đề / Lưu PDF</button>' +
            (opts.canPrintAnswers ? '<button class="qz-btn qz-ghost" data-act="print" data-mode="answers">🖨️ In kèm đáp án</button>' : '') + '</div>'
          : '') +
        '</div></div>';
      toTop();
    }

    // Khối "Kết quả của bạn" trên màn hình bắt đầu
    function historyHtml() {
      var h = stats();
      if (!h) return '';
      var wrong = wrongInExam(h).length;
      if (!h.count && !wrong) return '';
      return '<div class="qz-hist">' +
        (h.count
          ? '<div class="qz-hist-row"><div class="qz-hist-nums">' +
            '<div><small>Lần gần nhất</small><b>' + fmtScore(h.last.score) + '</b></div>' +
            '<div><small>Cao nhất</small><b>' + fmtScore(h.best) + '</b></div>' +
            '<div><small>Số lượt</small><b>' + h.count + '</b></div></div>' +
            (h.count > 1 ? sparkBars(h.attempts, S.pass) : '') + '</div>'
          : '') +
        (wrong
          ? '<button class="qz-btn qz-review-btn" data-act="review">🔁 Ôn lại ' + wrong + ' câu từng làm sai</button>'
          : (h.count ? '<div class="qz-hist-ok">🎉 Bạn không còn câu sai nào cần ôn.</div>' : '')) +
        '</div>';
    }

    // ---------- Màn hình làm bài ----------
    function questionHtml(i) {
      var it = st.items[i], a = st.answers[i], flagged = !!st.flags[i];
      var last = i === total() - 1;
      return '<div class="qz-card qz-q" data-q="' + i + '" id="' + uid + '-q' + i + '">' +
        '<div class="qz-q-head"><span class="qz-q-no">Câu ' + (i + 1) + '<small>/' + total() + '</small></span>' +
        '<button class="qz-flag' + (flagged ? ' on' : '') + '" data-act="flag" data-i="' + i + '">🚩 ' + (flagged ? 'Đã đánh dấu' : 'Đánh dấu') + '</button></div>' +
        '<div class="qz-q-text">' + esc(it.q) + '</div>' +
        (it.image ? '<img class="qz-q-img" src="' + esc(it.image) + '" alt="">' : '') +
        '<div class="qz-opts">' + it.opts.map(function (o, j) {
          return '<button class="qz-opt' + (a === j ? ' on' : '') + '" data-act="pick" data-i="' + i + '" data-o="' + j + '">' +
            '<span class="qz-letter">' + LETTERS[j] + '</span><span class="qz-opt-text">' + esc(o.text) + '</span></button>';
        }).join('') + '</div>' +
        (S.mode === 'one'
          ? '<div class="qz-nav"><button class="qz-btn" data-act="prev"' + (i === 0 ? ' disabled' : '') + '>← Câu trước</button>' +
            '<button class="qz-btn' + (last ? ' qz-primary' : '') + '" data-act="' + (last ? 'submit' : 'next') + '">' + (last ? 'Nộp bài' : 'Câu tiếp →') + '</button></div>'
          : '') +
        '</div>';
    }

    function renderQuiz() {
      root.innerHTML =
        '<div class="qz-bar"><div class="qz-bar-in">' +
        '<div class="qz-bar-title">' + (st.review ? '🔁 Ôn câu sai · ' : '') + esc(data.title) + '</div>' +
        '<div class="qz-prog"><div class="qz-prog-text">Đã làm <b data-ref="done">0</b>/' + total() + ' câu</div>' +
        '<div class="qz-track"><div class="qz-fill" data-ref="fill"></div></div></div>' +
        (st.end ? '<div class="qz-timer" data-ref="timer"></div>' : '') +
        '<button class="qz-btn qz-primary" data-act="submit">Nộp bài</button>' +
        '</div></div>' +
        '<div class="qz-wrap qz-layout">' +
        '<div class="qz-main" data-ref="main"></div>' +
        '<aside class="qz-palette"><div class="qz-pal-head"><b>Danh sách câu</b><button class="qz-icon-btn qz-pal-close" data-act="palette" aria-label="Đóng">✕</button></div>' +
        '<div class="qz-grid">' + st.items.map(function (_, i) {
          return '<button class="qz-cell" data-act="goto" data-i="' + i + '">' + (i + 1) + '</button>';
        }).join('') + '</div>' +
        '<div class="qz-legend"><span><i class="qz-dot is-done"></i>Đã làm</span><span><i class="qz-dot"></i>Chưa làm</span><span><i class="qz-dot is-flag"></i>Đánh dấu</span></div>' +
        '</aside></div>' +
        '<div class="qz-backdrop" data-act="palette"></div>' +
        '<button class="qz-btn qz-fab" data-act="palette">☰ Danh sách câu</button>';

      if (S.mode === 'one') showQuestion(st.cur, 0);
      else ref('main').innerHTML = st.items.map(function (_, i) { return questionHtml(i); }).join('');

      updateStatus();
      if (st.end) { tick(); timerId = setInterval(tick, 1000); }
      document.addEventListener('keydown', onKey);
      if (!opts.preview) window.addEventListener('beforeunload', beforeUnload);
      toTop();
    }

    function showQuestion(i, dir) {
      st.cur = i;
      var main = ref('main');
      main.innerHTML = questionHtml(i);
      main.firstElementChild.classList.add(dir > 0 ? 'qz-in-right' : dir < 0 ? 'qz-in-left' : 'qz-enter');
      updateStatus();
      if (dir) toTop();
    }

    function updateStatus() {
      var done = st.answers.filter(function (a) { return a !== null; }).length;
      ref('done').textContent = done;
      ref('fill').style.width = (done / total() * 100) + '%';
      root.querySelectorAll('.qz-cell').forEach(function (c, i) {
        c.classList.toggle('is-done', st.answers[i] !== null);
        c.classList.toggle('is-flag', !!st.flags[i]);
        c.classList.toggle('is-cur', i === st.cur);
      });
    }

    function tick() {
      var left = (st.end - Date.now()) / 1000;
      var el = ref('timer');
      if (el) {
        el.textContent = '⏱ ' + fmtTime(left);
        // cảnh báo khi còn dưới 5 phút (bài ngắn: dưới 1/3 thời gian)
        el.classList.toggle('warn', left < Math.min(300, S.minutes * 20) && left >= 60);
        el.classList.toggle('danger', left < 60);
      }
      if (left <= 0) finish(true);
    }

    function pick(i, o) {
      st.answers[i] = o;
      st.cur = i;
      root.querySelectorAll('[data-q="' + i + '"] .qz-opt').forEach(function (b, j) { b.classList.toggle('on', j === o); });
      updateStatus();
    }

    function toggleFlag(i) {
      if (st.flags[i]) delete st.flags[i]; else st.flags[i] = true;
      var b = root.querySelector('[data-q="' + i + '"] .qz-flag');
      if (b) { b.classList.toggle('on', !!st.flags[i]); b.textContent = '🚩 ' + (st.flags[i] ? 'Đã đánh dấu' : 'Đánh dấu'); }
      updateStatus();
    }

    function go(i) {
      if (i < 0 || i >= total()) return;
      root.classList.remove('qz-pal-open');
      if (S.mode === 'one') return showQuestion(i, i > st.cur ? 1 : i < st.cur ? -1 : 0);
      st.cur = i;
      updateStatus();
      var el = document.getElementById(uid + '-q' + i);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function onKey(e) {
      if (!st || st.done || closeModal || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      var it = st.items[st.cur];
      var k = e.key.toLowerCase();
      var idx = /^[1-9]$/.test(k) ? +k - 1 : LETTERS.toLowerCase().indexOf(k);
      if (k.length === 1 && idx >= 0 && idx < it.opts.length) { e.preventDefault(); pick(st.cur, idx); return; }
      if (S.mode === 'one' && e.key === 'ArrowRight') { e.preventDefault(); go(st.cur + 1); }
      if (S.mode === 'one' && e.key === 'ArrowLeft') { e.preventDefault(); go(st.cur - 1); }
    }

    function askSubmit() {
      var un = st.answers.filter(function (a) { return a === null; }).length;
      var fl = Object.keys(st.flags).length;
      var body = un
        ? 'Bạn còn <b>' + un + '</b> câu chưa làm' + (fl ? ' và <b>' + fl + '</b> câu đang đánh dấu' : '') + '. Vẫn nộp bài?'
        : fl ? 'Bạn đã làm hết, còn <b>' + fl + '</b> câu đang đánh dấu xem lại. Nộp bài ngay?' : 'Bạn đã làm hết các câu. Nộp bài ngay?';
      modal({ icon: un ? '⚠️' : '📤', title: 'Nộp bài?', body: body, ok: 'Nộp bài', cancel: 'Làm tiếp' })
        .then(function (ok) { if (ok) finish(false); });
    }

    function finish(timeUp) {
      if (!st || st.done) return;
      st.done = true;
      var usedSec = Math.round(((st.end ? Math.min(Date.now(), st.end) : Date.now()) - st.start) / 1000);
      stopRun();
      if (closeModal) closeModal();
      var rows = st.items.map(function (it, i) {
        var a = st.answers[i];
        return { key: it.key, status: a === null ? 'skip' : it.opts[a].correct ? 'right' : 'wrong' };
      });
      var right = rows.filter(function (r) { return r.status === 'right'; }).length;
      var wrong = rows.filter(function (r) { return r.status === 'wrong'; }).length;
      var score = Math.round(right / total() * 100) / 10;
      result = { rows: rows, right: right, wrong: wrong, skip: total() - right - wrong, total: total(), score: score, passed: score >= S.pass, usedSec: usedSec, timeUp: timeUp, review: st.review };
      reviewTab = 'all';
      if (opts.onFinish) { try { opts.onFinish(result); } catch (e) {} }
      if (timeUp) {
        renderResult();
        modal({ icon: '⏰', title: 'Hết giờ!', body: 'Bài làm của bạn đã được nộp tự động.', ok: 'Xem kết quả' });
      } else {
        renderResult();
      }
    }

    // ---------- Màn hình kết quả ----------
    function renderResult() {
      var R = result, C = 2 * Math.PI * 52;
      var count = function (t) { return t === 'all' ? R.total : R[t === 'wrong' ? 'wrong' : 'skip']; };
      root.innerHTML =
        '<div class="qz-wrap qz-narrow">' +
        '<div class="qz-card qz-result qz-enter' + (R.passed ? '' : ' fail') + '">' +
        '<div class="qz-ring"><svg viewBox="0 0 120 120"><circle class="qz-ring-bg" cx="60" cy="60" r="52"/>' +
        '<circle class="qz-ring-fg" data-ref="ring" cx="60" cy="60" r="52" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/></svg>' +
        '<div class="qz-ring-num"><b data-ref="num">0</b><small>/10</small></div></div>' +
        (R.review ? '' : '<span class="qz-verdict">' + (R.passed ? 'ĐẠT' : 'CHƯA ĐẠT') + '</span>') +
        '<h2>' + (R.review
          ? (R.right === R.total ? 'Tuyệt vời! Bạn đã sửa hết các câu sai 🎉' : 'Đã sửa được ' + R.right + '/' + R.total + ' câu. Ôn tiếp nhé 💪')
          : remarkFor(R.score, R.passed)) + '</h2>' +
        '<p class="qz-desc">' + (R.review ? '🔁 Ôn câu sai · ' : '') + esc(data.title) + (R.review ? '' : ' · Điểm đạt ' + fmtScore(S.pass) + '/10') + '</p>' +
        '<div class="qz-stats">' +
        '<div class="qz-tile"><span>✅</span><b>' + R.right + '</b><small>câu đúng</small></div>' +
        '<div class="qz-tile"><span>❌</span><b>' + R.wrong + '</b><small>câu sai</small></div>' +
        '<div class="qz-tile"><span>⏭</span><b>' + R.skip + '</b><small>bỏ trống</small></div>' +
        '<div class="qz-tile"><span>⏱</span><b>' + fmtTime(R.usedSec) + '</b><small>thời gian</small></div>' +
        '</div><div class="qz-actions">' +
        (R.review
          ? (wrongInExam(stats()).length ? '<button class="qz-btn qz-primary" data-act="review">🔁 Ôn tiếp ' + wrongInExam(stats()).length + ' câu còn sai</button>' : '') +
            '<button class="qz-btn' + (wrongInExam(stats()).length ? '' : ' qz-primary') + '" data-act="retry">📝 Làm cả bài</button>'
          : '<button class="qz-btn qz-primary" data-act="retry">🔁 Làm lại' + (S.pick > 0 && S.pick < data.questions.length ? ' (đề mới)' : '') + '</button>') +
        '<button class="qz-btn" data-act="to-review">📋 Xem đáp án</button>' +
        '<button class="qz-btn" data-act="home">↩ Màn hình đầu</button>' +
        '</div></div>' +
        '<div class="qz-review" data-ref="review"><h3 class="qz-review-title">Xem lại bài làm</h3>' +
        '<div class="qz-tabs">' + [['all', 'Tất cả'], ['wrong', 'Sai'], ['skip', 'Bỏ trống']].map(function (t) {
          return '<button class="qz-tab' + (t[0] === reviewTab ? ' on' : '') + '" data-act="tab" data-t="' + t[0] + '">' + t[1] + ' (' + count(t[0]) + ')</button>';
        }).join('') + '</div>' +
        '<div data-ref="rlist" style="display:flex;flex-direction:column;gap:14px"></div></div></div>';
      renderReview();
      toTop();
      animateScore();
    }

    function animateScore() {
      var ring = ref('ring'), num = ref('num'), C = 2 * Math.PI * 52, target = result.score, t0 = performance.now();
      function step(now) {
        if (!ring.isConnected) return;
        var p = Math.min(1, (now - t0) / 1000), e = 1 - Math.pow(1 - p, 3);
        num.textContent = fmtScore(Math.round(target * e * 10) / 10);
        ring.setAttribute('stroke-dashoffset', C * (1 - e * target / 10));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function renderReview() {
      var list = st.items.map(function (it, i) { return { it: it, i: i, a: st.answers[i], status: result.rows[i].status }; })
        .filter(function (x) { return reviewTab === 'all' || x.status === reviewTab; });
      var tags = { right: '✅ Đúng', wrong: '❌ Sai', skip: '⏭ Bỏ trống' };
      ref('rlist').innerHTML = list.length ? list.map(function (x) {
        return '<div class="qz-card qz-rv is-' + x.status + '">' +
          '<div class="qz-q-head"><span class="qz-q-no">Câu ' + (x.i + 1) + '</span><span class="qz-tag ' + x.status + '">' + tags[x.status] + '</span></div>' +
          '<div class="qz-q-text">' + esc(x.it.q) + '</div>' +
          (x.it.image ? '<img class="qz-q-img" src="' + esc(x.it.image) + '" alt="">' : '') +
          '<div class="qz-opts">' + x.it.opts.map(function (o, j) {
            var cls = o.correct ? ' is-right' : x.a === j ? ' is-wrong' : '';
            return '<div class="qz-opt is-static' + cls + '"><span class="qz-letter">' + LETTERS[j] + '</span>' +
              '<span class="qz-opt-text">' + esc(o.text) + '</span>' + (x.a === j ? '<span class="qz-mine">Bạn chọn</span>' : '') + '</div>';
          }).join('') + '</div>' +
          (x.it.explain ? '<div class="qz-explain"><b>💡 Giải thích:</b> ' + esc(x.it.explain) + '</div>' : '') +
          '</div>';
      }).join('') : '<div class="qz-empty">🎉 Không có câu nào trong mục này.</div>';
    }

    // ---------- Sự kiện ----------
    function onClick(e) {
      var b = e.target.closest('[data-act]');
      if (!b || !root.contains(b) || b.disabled) return;
      var i = +b.dataset.i;
      switch (b.dataset.act) {
        case 'start': newAttempt(); renderQuiz(); break;
        case 'pick': pick(i, +b.dataset.o); break;
        case 'flag': toggleFlag(i); break;
        case 'goto': go(i); break;
        case 'prev': go(st.cur - 1); break;
        case 'next': go(st.cur + 1); break;
        case 'palette': root.classList.toggle('qz-pal-open'); break;
        case 'submit': askSubmit(); break;
        case 'retry': newAttempt(); renderQuiz(); break;
        case 'review': newAttempt(true); renderQuiz(); break;
        case 'print': if (opts.onPrint) opts.onPrint(b.dataset.mode); break;
        case 'home': renderStart(); break;
        case 'to-review': ref('review').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
        case 'tab':
          reviewTab = b.dataset.t;
          root.querySelectorAll('.qz-tab').forEach(function (t) { t.classList.toggle('on', t === b); });
          renderReview();
          break;
      }
    }
    root.addEventListener('click', onClick);

    root._qzDestroy = function () {
      stopRun();
      if (closeModal) closeModal();
      root.removeEventListener('click', onClick);
      root.innerHTML = '';
      root._qzDestroy = null;
    };

    // Link "?review=1" (từ trang Kết quả của tôi) → vào thẳng chế độ ôn câu sai
    if (opts.autoReview && wrongInExam(stats()).length) { newAttempt(true); renderQuiz(); }
    else renderStart();
    return { destroy: function () { if (root._qzDestroy) root._qzDestroy(); }, data: data };
  }

  // =====================================================================
  // In đề / Lưu PDF: dựng bản in trắng đen rồi gọi hộp thoại in của trình duyệt
  // mode: 'paper' (đề trống), 'answers' (đề kèm đáp án + giải thích + bảng đáp án)
  // =====================================================================
  function printExam(raw, mode, meta) {
    var data = normalize(raw), S = data.settings, withAns = mode === 'answers';
    meta = meta || {};
    var old = document.getElementById('qz-print');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'qz-print';
    var qs = data.questions;
    var info = [qs.length + ' câu', S.minutes > 0 ? S.minutes + ' phút' : 'không giới hạn thời gian', 'điểm đạt ' + fmtScore(S.pass) + '/10'];
    el.innerHTML =
      '<header class="qp-head">' +
      (meta.series ? '<div class="qp-series">' + esc(meta.series) + '</div>' : '') +
      '<h1>' + esc(data.title) + (withAns ? ' — ĐÁP ÁN' : '') + '</h1>' +
      (data.description ? '<p class="qp-desc">' + esc(data.description) + '</p>' : '') +
      '<p class="qp-info">' + info.join(' · ') + '</p>' +
      (withAns ? '' : '<div class="qp-student"><span>Họ và tên: ....................................................</span><span>Lớp/Nhóm: ....................</span><span>Điểm: ..........</span></div>') +
      '</header>' +
      '<ol class="qp-list">' + qs.map(function (q, i) {
        var short = q.options.every(function (o) { return o.length <= 28; });
        return '<li class="qp-q"><div class="qp-text"><b>Câu ' + (i + 1) + '.</b> ' + esc(q.q) + '</div>' +
          (q.image ? '<img class="qp-img" src="' + esc(q.image) + '" alt="">' : '') +
          '<div class="qp-opts' + (short && q.options.length <= 4 ? ' qp-cols' : '') + '">' + q.options.map(function (o, j) {
            var right = withAns && j === q.answer;
            return '<div class="qp-opt' + (right ? ' qp-right' : '') + '"><span class="qp-letter">' + LETTERS[j] + '.</span> ' + esc(o) + (right ? ' ✔' : '') + '</div>';
          }).join('') + '</div>' +
          (withAns && q.explain ? '<div class="qp-explain"><b>Giải thích:</b> ' + esc(q.explain) + '</div>' : '') +
          '</li>';
      }).join('') + '</ol>' +
      (withAns
        ? '<section class="qp-key"><h2>Bảng đáp án</h2><div class="qp-key-grid">' + qs.map(function (q, i) {
            return '<span><b>' + (i + 1) + '</b>' + LETTERS[q.answer] + '</span>';
          }).join('') + '</div></section>'
        : '') +
      '<footer class="qp-foot">' + esc(meta.footer || '') + '</footer>';
    document.body.appendChild(el);
    document.body.classList.add('qz-printing');
    var prevTitle = document.title;
    document.title = data.title + (withAns ? ' - Đáp án' : ''); // tên file khi "Lưu thành PDF"
    function cleanup() {
      document.body.classList.remove('qz-printing');
      document.title = prevTitle;
      el.remove();
      window.removeEventListener('afterprint', cleanup);
    }
    window.addEventListener('afterprint', cleanup);
    // chờ ảnh tải xong rồi mới in
    var imgs = [].slice.call(el.querySelectorAll('img'));
    Promise.all(imgs.map(function (im) {
      return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; });
    })).then(function () { setTimeout(function () { window.print(); }, 50); });
  }

  window.QuizEngine = { mount: mount, normalize: normalize, print: printExam, keyOf: keyOf, LETTERS: LETTERS };
})();
