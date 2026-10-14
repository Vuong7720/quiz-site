// Mã hóa / giải mã bài thi bằng mật khẩu (PBKDF2-SHA256 → AES-256-GCM, Web Crypto API)
(function () {
  var ITERATIONS = 200000;
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function toB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    return Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
  }

  async function deriveKey(password, salt, iterations) {
    var base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encrypt(text, password) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(password, salt, ITERATIONS);
    var data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(text)));
    return { v: 1, iter: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
  }

  // Sai mật khẩu → ném lỗi (AES-GCM tự kiểm tra tính toàn vẹn)
  async function decrypt(payload, password) {
    var key = await deriveKey(password, fromB64(payload.salt), payload.iter || ITERATIONS);
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) }, key, fromB64(payload.data));
    return dec.decode(plain);
  }

  // Đọc dữ liệu mã hóa từ file bài thi (null nếu bài không có mật khẩu)
  function readLocked(html) {
    var el = new DOMParser().parseFromString(html, 'text/html').getElementById('quiz-locked');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  window.QuizCrypto = { encrypt: encrypt, decrypt: decrypt, readLocked: readLocked };
})();
