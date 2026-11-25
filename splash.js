/* شاشة البداية: أول فتح، أو بعد ساعتين غياب */
(function () {
  var sp = document.getElementById('splash');
  if (!sp) return;
  window.__spTpl = sp.outerHTML;
  var k = 'kl_seen', t = 0;
  try { t = +localStorage.getItem(k) || 0; } catch (e) {}
  if (t && Date.now() - t < 72e5) { sp.remove(); return; }
  sp.classList.add('on');
  setTimeout(function () {
    sp.classList.add('out');
    setTimeout(function () { sp.remove(); }, 520);
  }, 1050);
})();
