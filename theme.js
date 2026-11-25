/* ضبط الثيم (ليل / صباح) قبل أول رسم لمنع أي وميض لوني عند الفتح */
(function () {
  var t = 'iron';
  try { t = localStorage.getItem('kl_th') || 'iron'; } catch (e) {}
  if (t !== 'morning') t = 'iron';
  document.documentElement.setAttribute('data-th', t);
  var m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', t === 'morning' ? '#f3eee5' : '#0e0e0f');
})();
