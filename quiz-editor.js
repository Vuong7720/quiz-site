// Trình soạn câu hỏi + bộ nhận dạng câu hỏi dán từ Word / Excel / Gemini (JSON)
(function () {
  var esc = function (s) { return QuizUtil.escapeHtml(s); };
  var LETTERS = 'ABCDEFGHIJ';

  // =====================================================================
  // Nhận dạng câu hỏi
  // =====================================================================
  function letterIndex(s) {
    s = String(s == null ? '' : s).trim();
    if (/^[A-Ja-j]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
    if (/^[1-9]$/.test(s)) return +s - 1;
    return -1;
  }

  // Câu hỏi từ object JSON với nhiều kiểu tên trường khác nhau
  function fromObject(o) {
    if (!o || typeof o !== 'object') return null;
    var q = o.q || o.question || o.cauHoi || o.cau_hoi || o.text || o.title || '';
    var options = o.options || o.choices || o.answers || o.dapAn || o.dap_an || [];
    if (!Array.isArray(options) && typeof options === 'object') options = Object.keys(options).sort().map(function (k) { return options[k]; });
    options = (Array.isArray(options) ? options : []).map(function (x) {
      return String(x && typeof x === 'object' ? (x.text || x.content || '') : x).replace(/^\s*[A-Ja-j]\s*[.):]\s+/, '');
    });
    var ans = o.answer !== undefined ? o.answer : o.correct !== undefined ? o.correct : o.dapAnDung !== undefined ? o.dapAnDung : o.answerIndex;
    var answer = typeof ans === 'number' ? ans : letterIndex(ans);
    if (answer < 0 && typeof ans === 'string') answer = options.findIndex(function (x) { return x.trim() === ans.trim(); });
    return {
      q: String(q).trim(),
      options: options,
      answer: answer >= 0 && answer < options.length ? answer : -1,
      explain: String(o.explain || o.explanation || o.giaiThich || o.giai_thich || '').trim(),
      image: typeof o.image === 'string' ? o.image : '',
    };
  }

  function parseJson(text) {
    var t = text.replace(/```(?:json)?/gi, '').trim();
    var start = t.search(/[\[{]/);
    if (start < 0) return null;
    var end = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
    var obj;
    try { obj = JSON.parse(t.slice(start, end + 1)); } catch (e) { return null; }
    var list = Array.isArray(obj) ? obj : obj.questions || obj.cauHoi || obj.items;
    if (!Array.isArray(list)) return null;
    return {
      questions: list.map(fromObject).filter(Boolean),
      meta: Array.isArray(obj) ? {} : { title: obj.title, description: obj.description, settings: obj.settings },
    };
  }

  // Excel / Google Sheets: Câu hỏi | A | B | C | D | Đáp án | Giải thích
  function parseTable(text) {
    var rows = text.split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (l) { return l.split('\t'); });
    if (rows.length < 1 || rows.filter(function (r) { return r.length >= 4; }).length < rows.length * 0.6) return null;
    var questions = [];
    rows.forEach(function (cells) {
      cells = cells.map(function (c) { return c.trim(); });
      // bỏ qua dòng tiêu đề (Câu hỏi | A | B | ... | Đáp án | Giải thích)
      if (cells.some(function (c) { return /^(đáp\s*án(\s*đúng)?|dap\s*an(\s*dung)?|answer|correct|giải\s*thích|giai\s*thich|câu\s*hỏi|cau\s*hoi|question|nội\s*dung|stt)$/i.test(c); })) return;
      // ô đáp án = ô cuối cùng (từ cột thứ 4 trở đi) chỉ chứa một chữ A–J hoặc số 1–9
      var ai = -1;
      for (var k = cells.length - 1; k >= 3; k--) { if (letterIndex(cells[k]) >= 0) { ai = k; break; } }
      if (ai < 0) return; // dòng tiêu đề hoặc dòng không hợp lệ
      var options = cells.slice(1, ai).filter(function (c) { return c !== ''; });
      questions.push({
        q: cells[0].replace(/^(câu|cau)\s*\d+\s*[:.)\-]\s*/i, ''),
        options: options,
        answer: letterIndex(cells[ai]) < options.length ? letterIndex(cells[ai]) : -1,
        explain: cells.slice(ai + 1).join(' ').trim(),
        image: '',
      });
    });
    return questions.length ? { questions: questions, meta: {} } : null;
  }

  // Văn bản kiểu Word:
  //   Câu 1: Nội dung...
  //   A. ...   (đáp án đúng có thể đánh dấu *A. / A. ...(*) / [*])
  //   Đáp án: B
  //   Giải thích: ...
  var Q_START = /^\s*(?:(?:câu|cau|question|bài|bai)\s*\d+\s*[:.)\-–]?|\d+\s*[.):]\s+)/i;
  var OPT = /^\s*(\*?)\s*\(?([A-Ja-j])\s*[.):]\s+(.*)$/;
  var ANS = /^\s*(?:đáp\s*án(?:\s*đúng)?|dap\s*an(?:\s*dung)?|đa|answer|key)\s*[:：\-]?\s*\(?([A-Ja-j1-9])\b/i;
  var EXP = /^\s*(?:giải\s*thích|giai\s*thich|lời\s*giải|loi\s*giai|explanation|hướng\s*dẫn)\s*[:：\-]?\s*(.*)$/i;
  var MARK = /\s*(?:\(\*\)|\[\*\]|\*)\s*$/;

  // "A. x   B. y   C. z" trên cùng một dòng → tách thành nhiều dòng
  function splitInlineOptions(line) {
    if (!/^\s*\*?\s*\(?A\s*[.):]\s+/i.test(line)) return [line];
    var parts = line.split(/\s+(?=\*?\s*\(?[B-J]\s*[.):]\s+)/);
    return parts.length > 1 ? parts : [line];
  }

  function parseText(text) {
    var lines = [];
    text.replace(/\u00a0/g, ' ').split(/\r?\n/).forEach(function (l) { lines.push.apply(lines, splitInlineOptions(l)); });

    var blocks = [], cur = null;
    lines.forEach(function (l) {
      if (Q_START.test(l) && !OPT.test(l)) { cur = []; blocks.push(cur); }
      if (!cur) { cur = []; blocks.push(cur); }
      cur.push(l);
    });

    var questions = [];
    blocks.forEach(function (b) {
      var qLines = [], options = [], answer = -1, explain = [], mode = 'q';
      b.forEach(function (l) {
        var m;
        if ((m = l.match(ANS))) { answer = letterIndex(m[1]); mode = 'ans'; return; }
        if ((m = l.match(EXP))) { explain.push(m[1]); mode = 'exp'; return; }
        if (mode !== 'exp' && (m = l.match(OPT))) {
          var txt = m[3], marked = m[1] === '*' || MARK.test(txt);
          txt = txt.replace(MARK, '').trim();
          var idx = m[2].toUpperCase().charCodeAt(0) - 65;
          if (idx === options.length) {
            options.push(txt);
            if (marked) answer = idx;
            mode = 'opt';
            return;
          }
        }
        if (!l.trim()) return;
        if (mode === 'q') qLines.push(l);
        else if (mode === 'opt' && options.length) options[options.length - 1] += ' ' + l.trim();
        else if (mode === 'exp') explain.push(l);
      });
      var q = qLines.join('\n').replace(Q_START, '').trim();
      if (q && options.length >= 2) {
        questions.push({ q: q, options: options, answer: answer < options.length ? answer : -1, explain: explain.join('\n').trim(), image: '' });
      }
    });
    return questions.length ? { questions: questions, meta: {} } : null;
  }

  function parse(text) {
    text = String(text || '');
    if (!text.trim()) return { questions: [], meta: {}, format: '' };
    var r;
    if ((r = parseJson(text))) return Object.assign(r, { format: 'JSON' });
    if ((r = parseTable(text))) return Object.assign(r, { format: 'bảng Excel' });
    if ((r = parseText(text))) return Object.assign(r, { format: 'văn bản' });
    return { questions: [], meta: {}, format: '' };
  }

  // =====================================================================
  // Nén ảnh: thu nhỏ tối đa 1000px, chuyển JPEG để nhẹ (ảnh nằm luôn trong bài)
  // =====================================================================
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1000, w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')); };
      img.src = url;
    });
  }

  // =====================================================================
  // Trình soạn
  // =====================================================================
  var COLORS = [
    ['#2563eb', 'Xanh dương'], ['#059669', 'Xanh lục'], ['#7c3aed', 'Tím'],
    ['#db2777', 'Hồng'], ['#ea580c', 'Cam'], ['#1e3a8a', 'Navy'],
  ];
  var DEFAULT_SETTINGS = { mode: 'one', pass: 5, pick: 0, shuffleQuestions: false, shuffleOptions: false, color: '#2563eb' };

  function blankQuestion() { return { q: '', options: ['', '', '', ''], answer: -1, explain: '', image: '' }; }

  function create(root, cfg) {
    cfg = cfg || {};
    var questions = [];
    var settings = Object.assign({}, DEFAULT_SETTINGS);
    var dragFrom = -1;

    root.innerHTML =
      '<div class="qe">' +
      '<div class="qe-section"><div class="qe-section-title">⚙️ Cách làm bài</div><div class="row">' +
      '<div><label>Kiểu hiển thị</label><select data-s="mode"><option value="one">Từng câu một (như thi thật)</option><option value="all">Tất cả câu trên một trang</option></select></div>' +
      '<div><label>Điểm đạt (hệ 10)</label><input type="number" data-s="pass" min="0" max="10" step="0.5"></div>' +
      '<div><label>Số câu mỗi lượt</label><input type="number" data-s="pick" min="0" placeholder="0 = tất cả"><div class="hint">Nhỏ hơn tổng số câu → mỗi lượt bốc ngẫu nhiên (ngân hàng câu hỏi).</div></div>' +
      '</div>' +
      '<div class="qe-checks"><label class="inline"><input type="checkbox" data-s="shuffleQuestions"> Xáo trộn thứ tự câu hỏi</label>' +
      '<label class="inline"><input type="checkbox" data-s="shuffleOptions"> Xáo trộn thứ tự đáp án</label></div>' +
      '<div><label>Màu chủ đạo</label><div class="qe-colors">' + COLORS.map(function (c) {
        return '<button type="button" class="qe-color" data-color="' + c[0] + '" style="--c:' + c[0] + '" title="' + c[1] + '"></button>';
      }).join('') + '</div></div></div>' +

      '<details class="qe-section qe-import" data-ref="importBox"><summary>📋 Dán câu hỏi từ Word / Excel / Gemini</summary>' +
      '<textarea data-ref="importText" placeholder="Dán vào đây. Hỗ trợ:\n\n• Văn bản:\nCâu 1: Thủ đô của Việt Nam là?\nA. Hà Nội\nB. Huế\nC. TP.HCM\nD. Đà Nẵng\nĐáp án: A\nGiải thích: ...\n\n• Bảng Excel / Google Sheets (copy các ô):  Câu hỏi | A | B | C | D | Đáp án | Giải thích\n\n• Mã JSON do Gemini trả về"></textarea>' +
      '<div class="actions"><button type="button" class="btn primary" data-act="import-append">➕ Thêm vào cuối</button>' +
      '<button type="button" class="btn" data-act="import-replace">♻️ Thay thế tất cả</button></div>' +
      '<div class="hint">Đánh dấu đáp án đúng bằng dòng <b>Đáp án: B</b>, hoặc thêm dấu <b>*</b> trước/sau đáp án (vd: <b>*B. Huế</b>).</div>' +
      '<div class="status" data-ref="importStatus"></div></details>' +

      '<div class="qe-list-head"><div class="qe-section-title" data-ref="count">Câu hỏi</div>' +
      '<button type="button" class="btn small danger" data-act="clear-all">Xóa hết</button></div>' +
      '<div class="qe-list" data-ref="list"></div>' +
      '<button type="button" class="btn qe-add" data-act="add">+ Thêm câu hỏi</button>' +
      '<input type="file" accept="image/*" data-ref="imgInput" hidden>' +
      '</div>';

    function ref(n) { return root.querySelector('[data-ref="' + n + '"]'); }
    function changed() { if (cfg.onChange) cfg.onChange(); }

    // ---------- Cài đặt ----------
    function renderSettings() {
      root.querySelectorAll('[data-s]').forEach(function (el) {
        var v = settings[el.dataset.s];
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = el.dataset.s === 'pick' && !v ? '' : v;
      });
      root.querySelectorAll('.qe-color').forEach(function (b) { b.classList.toggle('on', b.dataset.color === settings.color); });
    }
    root.addEventListener('input', function (e) {
      var s = e.target.dataset.s;
      if (s) {
        var el = e.target;
        settings[s] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
        changed();
        return;
      }
      var card = e.target.closest('.qe-card');
      if (!card) return;
      var i = +card.dataset.i, f = e.target.dataset.f, q = questions[i];
      if (f === 'q') q.q = e.target.value;
      else if (f === 'explain') q.explain = e.target.value;
      else if (f === 'opt') q.options[+e.target.dataset.o] = e.target.value;
      else if (f === 'answer') {
        q.answer = +e.target.value;
        card.querySelectorAll('.qe-opt').forEach(function (o, j) { o.classList.toggle('correct', j === q.answer); });
      }
      markCard(card, q);
      changed();
    });
    root.addEventListener('change', function (e) {
      if (e.target.dataset.s) e.target.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // ---------- Danh sách câu hỏi ----------
    function problems(q) {
      var p = [];
      if (!q.q.trim()) p.push('chưa có nội dung');
      var filled = q.options.filter(function (o) { return o.trim(); }).length;
      if (filled < 2) p.push('cần ít nhất 2 đáp án');
      if (q.answer < 0 || q.answer >= q.options.length || !String(q.options[q.answer] || '').trim()) p.push('chưa chọn đáp án đúng');
      return p;
    }
    function markCard(card, q) {
      var p = problems(q);
      card.classList.toggle('has-error', p.length > 0);
      card.querySelector('.qe-warn').textContent = p.length ? '⚠️ ' + p.join(', ') : '';
    }

    function cardHtml(q, i) {
      return '<div class="qe-card" data-i="' + i + '">' +
        '<div class="qe-card-head"><span class="qe-handle" draggable="true" title="Kéo để đổi thứ tự">⋮⋮</span>' +
        '<b>Câu ' + (i + 1) + '</b><span class="qe-warn"></span>' +
        '<div class="qe-tools">' +
        '<button type="button" data-act="up" title="Lên"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" data-act="down" title="Xuống"' + (i === questions.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button type="button" data-act="dup" title="Nhân bản">⧉</button>' +
        '<button type="button" data-act="del" title="Xóa câu" class="danger">🗑</button></div></div>' +
        '<textarea data-f="q" rows="2" placeholder="Nội dung câu hỏi...">' + esc(q.q) + '</textarea>' +
        '<div class="qe-img">' + (q.image
          ? '<img src="' + esc(q.image) + '" alt=""><button type="button" class="btn small danger" data-act="img-del">Xóa ảnh</button>'
          : '<button type="button" class="btn small" data-act="img-add">🖼 Thêm ảnh</button>') + '</div>' +
        '<div class="qe-opts">' + q.options.map(function (o, j) {
          return '<div class="qe-opt' + (q.answer === j ? ' correct' : '') + '">' +
            '<label class="qe-radio" title="Chọn làm đáp án đúng"><input type="radio" name="qe-ans-' + i + '" data-f="answer" value="' + j + '"' + (q.answer === j ? ' checked' : '') + '><span>' + LETTERS[j] + '</span></label>' +
            '<input type="text" data-f="opt" data-o="' + j + '" value="' + esc(o) + '" placeholder="Đáp án ' + LETTERS[j] + '">' +
            '<button type="button" data-act="opt-del" data-o="' + j + '" title="Xóa đáp án"' + (q.options.length <= 2 ? ' disabled' : '') + '>✕</button></div>';
        }).join('') + '</div>' +
        (q.options.length < LETTERS.length ? '<button type="button" class="btn small" data-act="opt-add">+ Thêm đáp án</button>' : '') +
        '<span class="hint qe-hint">Bấm vào chữ cái để chọn đáp án đúng.</span>' +
        '<textarea data-f="explain" rows="1" placeholder="💡 Giải thích (không bắt buộc)">' + esc(q.explain) + '</textarea>' +
        '</div>';
    }

    function render() {
      ref('count').textContent = questions.length ? '📝 ' + questions.length + ' câu hỏi' : '📝 Chưa có câu hỏi';
      ref('list').innerHTML = questions.map(cardHtml).join('') ||
        '<div class="qe-empty">Chưa có câu hỏi nào. Bấm “+ Thêm câu hỏi” hoặc dán câu hỏi ở mục 📋 phía trên.</div>';
      root.querySelectorAll('.qe-card').forEach(function (c) { markCard(c, questions[+c.dataset.i]); });
    }

    function move(from, to) {
      if (to < 0 || to >= questions.length || from === to) return;
      var q = questions.splice(from, 1)[0];
      questions.splice(to, 0, q);
      render(); changed();
    }

    var imgTarget = -1;
    root.addEventListener('click', function (e) {
      var color = e.target.closest('.qe-color');
      if (color) { settings.color = color.dataset.color; renderSettings(); changed(); return; }
      var b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      var card = b.closest('.qe-card'), i = card ? +card.dataset.i : -1;
      switch (b.dataset.act) {
        case 'add':
          questions.push(blankQuestion()); render(); changed();
          var last = root.querySelector('.qe-card:last-child textarea');
          if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); last.focus({ preventScroll: true }); }
          break;
        case 'up': move(i, i - 1); break;
        case 'down': move(i, i + 1); break;
        case 'dup': questions.splice(i + 1, 0, JSON.parse(JSON.stringify(questions[i]))); render(); changed(); break;
        case 'del':
          if (questions[i].q.trim() && !confirm('Xóa câu ' + (i + 1) + '?')) return;
          questions.splice(i, 1); render(); changed(); break;
        case 'opt-add': questions[i].options.push(''); render(); changed(); break;
        case 'opt-del':
          var o = +b.dataset.o, q = questions[i];
          q.options.splice(o, 1);
          if (q.answer === o) q.answer = -1; else if (q.answer > o) q.answer--;
          render(); changed(); break;
        case 'img-add': imgTarget = i; ref('imgInput').click(); break;
        case 'img-del': questions[i].image = ''; render(); changed(); break;
        case 'clear-all':
          if (questions.length && confirm('Xóa toàn bộ ' + questions.length + ' câu hỏi?')) { questions = []; render(); changed(); }
          break;
        case 'import-append': doImport(false); break;
        case 'import-replace': doImport(true); break;
      }
    });

    ref('imgInput').addEventListener('change', function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f || imgTarget < 0) return;
      compressImage(f).then(function (data) {
        questions[imgTarget].image = data; render(); changed();
      }).catch(function (err) { alert(err.message); });
    });

    // Kéo thả đổi thứ tự (bằng tay nắm ⋮⋮)
    root.addEventListener('dragstart', function (e) {
      var card = e.target.closest('.qe-card');
      if (!card || !e.target.classList.contains('qe-handle')) return;
      dragFrom = +card.dataset.i;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setDragImage(card, 20, 20); } catch (err) {}
    });
    root.addEventListener('dragover', function (e) {
      var card = e.target.closest('.qe-card');
      if (dragFrom < 0 || !card) return;
      e.preventDefault();
      root.querySelectorAll('.qe-card.drop-target').forEach(function (c) { c.classList.remove('drop-target'); });
      card.classList.add('drop-target');
    });
    root.addEventListener('drop', function (e) {
      var card = e.target.closest('.qe-card');
      if (dragFrom < 0 || !card) return;
      e.preventDefault();
      var to = +card.dataset.i, from = dragFrom;
      dragFrom = -1;
      move(from, to);
    });
    root.addEventListener('dragend', function () {
      dragFrom = -1;
      root.querySelectorAll('.dragging, .drop-target').forEach(function (c) { c.classList.remove('dragging', 'drop-target'); });
    });

    // ---------- Nhập câu hỏi ----------
    function doImport(replace) {
      var st = ref('importStatus');
      var r = parse(ref('importText').value);
      if (!r.questions.length) {
        st.className = 'status show err';
        st.innerHTML = '❌ Không nhận dạng được câu hỏi nào. Kiểm tra lại định dạng (xem ví dụ trong ô).';
        return;
      }
      if (replace && questions.some(function (q) { return q.q.trim(); }) && !confirm('Thay thế ' + questions.length + ' câu hiện có bằng ' + r.questions.length + ' câu mới?')) return;
      var clean = r.questions.map(function (q) {
        return { q: q.q, options: q.options.length ? q.options : ['', ''], answer: q.answer, explain: q.explain || '', image: q.image || '' };
      });
      questions = replace ? clean : questions.filter(function (q) { return q.q.trim() || q.options.some(function (o) { return o.trim(); }); }).concat(clean);
      if (r.meta && r.meta.settings) applySettings(r.meta.settings);
      render(); changed();
      var missing = clean.filter(function (q) { return q.answer < 0; }).length;
      st.className = 'status show ' + (missing ? 'info' : 'ok');
      st.innerHTML = '✅ Đã nhận <b>' + clean.length + '</b> câu (định dạng ' + r.format + ').' +
        (missing ? ' <b>' + missing + '</b> câu chưa có đáp án đúng, được đánh dấu ⚠️ bên dưới.' : '');
      ref('importText').value = '';
      if (cfg.onImportMeta && r.meta) cfg.onImportMeta(r.meta);
    }

    function applySettings(s) {
      s = s || {};
      Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (s[k] !== undefined) settings[k] = s[k]; });
      renderSettings();
    }

    renderSettings();
    render();

    return {
      getQuestions: function () {
        return questions.map(function (q) {
          var o = { q: q.q.trim(), options: q.options.map(function (x) { return x.trim(); }), answer: q.answer };
          if (q.explain.trim()) o.explain = q.explain.trim();
          if (q.image) o.image = q.image;
          return o;
        });
      },
      getSettings: function () { return Object.assign({}, settings); },
      setData: function (d) {
        d = d || {};
        questions = (d.questions || []).map(function (q) {
          return { q: String(q.q || ''), options: (q.options || []).map(String), answer: Number.isInteger(q.answer) ? q.answer : -1, explain: q.explain || '', image: q.image || '' };
        });
        settings = Object.assign({}, DEFAULT_SETTINGS);
        applySettings(d.settings);
        render();
      },
      setSetting: function (k, v) { settings[k] = v; renderSettings(); },
      clear: function () { questions = []; settings = Object.assign({}, DEFAULT_SETTINGS); renderSettings(); render(); },
      count: function () { return questions.length; },
      // Trả về danh sách lỗi: [{ i, problems }]
      validate: function () {
        var errs = [];
        questions.forEach(function (q, i) { var p = problems(q); if (p.length) errs.push({ i: i, problems: p }); });
        if (errs.length) {
          var c = root.querySelector('.qe-card[data-i="' + errs[0].i + '"]');
          if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return errs;
      },
    };
  }

  window.QuizEditor = { create: create, parse: parse };
})();
