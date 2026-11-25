/* KeepLite (مفكرة) — منطق التطبيق. الإصدار في const VER، ولازم يتغير مع BUILD في sw.js */
'use strict';
const VER = '2';

(function () {
  const B = window.KeepBackup;

  const COLORS = [
    { id: 'default', label: 'افتراضي' },
    { id: 'amber', label: 'عنبري' },
    { id: 'ember', label: 'جمري' },
    { id: 'sand', label: 'رملي' },
    { id: 'olive', label: 'زيتوني' },
    { id: 'sage', label: 'أخضر' },
    { id: 'slate', label: 'أزرق' },
    { id: 'plum', label: 'برقوقي' },
    { id: 'rose', label: 'وردي' },
    { id: 'stone', label: 'حجري' }
  ];

  // App State
  let notes = [];
  let settings = {};
  let searchQuery = '';
  let colorFilter = 'all';
  let activeNoteId = null;
  let editorDirty = false;
  let typingDebounceTimer = null;
  let lastDeletedNote = null;
  let deferredInstallPrompt = null;
  let updatingSw = false;
  let swReloaded = false;

  // DOM Refs
  const $ = (s) => document.querySelector(s);
  const el = {
    brandLogo: $('#brandLogo'),
    updBtn: $('#updBtn'),
    btnToggleView: $('#btnToggleView'),
    iconViewGrid: $('#iconViewGrid'),
    iconViewList: $('#iconViewList'),
    btnOpenBackup: $('#btnOpenBackup'),
    autoBackupDot: $('#autoBackupDot'),

    searchInput: $('#searchInput'),
    btnClearSearch: $('#btnClearSearch'),
    colorFilterBar: $('#colorFilterBar'),

    installBanner: $('#installBanner'),
    btnInstallPwa: $('#btnInstallPwa'),
    btnDismissInstall: $('#btnDismissInstall'),

    view: $('#view'),
    pinnedSection: $('#pinnedSection'),
    pinnedGrid: $('#pinnedGrid'),
    othersSection: $('#othersSection'),
    othersLabel: $('#othersLabel'),
    othersGrid: $('#othersGrid'),
    emptyState: $('#emptyState'),
    emptyTitle: $('#emptyTitle'),
    emptySub: $('#emptySub'),

    btnQuickNote: $('#btnQuickNote'),
    fabAddNote: $('#fabAddNote'),
    btnBackupChip: $('#btnBackupChip'),
    backupChipLabel: $('#backupChipLabel'),

    editorModal: $('#editorModal'),
    editorBackdrop: $('#editorBackdrop'),
    editorSheet: $('#editorSheet'),
    btnSaveClose: $('#btnSaveClose'),
    btnTogglePin: $('#btnTogglePin'),
    btnCopyNote: $('#btnCopyNote'),
    btnDeleteNote: $('#btnDeleteNote'),
    noteTitleInput: $('#noteTitleInput'),
    noteContentInput: $('#noteContentInput'),
    editorColorPicker: $('#editorColorPicker'),
    editorTimestamp: $('#editorTimestamp'),
    editorSyncStatus: $('#editorSyncStatus'),

    backupModal: $('#backupModal'),
    backupBackdrop: $('#backupBackdrop'),
    btnCloseBackup: $('#btnCloseBackup'),
    btnThemeIron: $('#btnThemeIron'),
    btnThemeMorning: $('#btnThemeMorning'),
    btnToggleAutoBackup: $('#btnToggleAutoBackup'),
    swAutoBackup: $('#swAutoBackup'),
    btnPickFilenameMode: $('#btnPickFilenameMode'),
    filenameModeLabel: $('#filenameModeLabel'),
    btnToggleSfx: $('#btnToggleSfx'),
    swSfx: $('#swSfx'),
    backupMethodInfo: $('#backupMethodInfo'),
    directLinkCard: $('#directLinkCard'),
    linkedFileLabel: $('#linkedFileLabel'),
    btnLinkFile: $('#btnLinkFile'),
    btnUnlinkFile: $('#btnUnlinkFile'),
    btnDownloadTxt: $('#btnDownloadTxt'),
    btnShareTxt: $('#btnShareTxt'),
    btnImportTxt: $('#btnImportTxt'),
    fileImportInput: $('#fileImportInput'),
    txtPreview: $('#txtPreview'),
    btnCopyTxtPreview: $('#btnCopyTxtPreview'),
    lastBackupLabel: $('#lastBackupLabel'),

    ask: $('#ask'),
    askText: $('#askText'),
    askNo: $('#askNo'),
    askYes: $('#askYes'),

    xp: $('#xp'),
    xpTitle: $('#xpTitle'),
    xpList: $('#xpList'),

    toast: $('#toast'),
    undo: $('#undo'),
    undoText: $('#undoText'),
    undoBtn: $('#undoBtn')
  };

  /* ================= Tactile SFX & Haptics ================= */
  const sfxPool = {};
  function snd(name) {
    if (!settings || settings.sfx === false) return;
    try {
      let a = sfxPool[name];
      if (!a) {
        a = new Audio(`sfx/${name}.mp3`);
        a.volume = 0.42;
        sfxPool[name] = a;
      }
      a.currentTime = 0;
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // Ignore audio errors
    }
  }

  function vibe(ms = 8) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {
      // Ignore
    }
  }

  /* ================= 2-Hour Background Splash Return ================= */
  (function initSplashReturn() {
    const k = 'kl_seen';
    const GAP = 72e5;
    const get = () => {
      try { return +localStorage.getItem(k) || 0; } catch { return 0; }
    };
    const mark = () => {
      try { localStorage.setItem(k, String(Date.now())); } catch {}
    };
    let lastTick = Date.now();
    const showSplash = () => {
      const tpl = window.__spTpl;
      if (!tpl || document.getElementById('splash')) return;
      const d = document.createElement('div');
      d.innerHTML = tpl;
      const sp = d.firstElementChild;
      document.body.appendChild(sp);
      sp.classList.add('on');
      setTimeout(() => {
        sp.classList.add('out');
        setTimeout(() => sp.remove(), 520);
      }, 1050);
    };
    const checkBack = () => {
      const l = get();
      const now = Date.now();
      if (l && now - l >= GAP) showSplash();
      lastTick = now;
      mark();
    };
    mark();
    setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastTick >= GAP) checkBack();
      else { lastTick = now; mark(); }
    }, 30000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) mark();
      else checkBack();
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) checkBack(); });
    window.addEventListener('focus', () => { if (!document.hidden && Date.now() - lastTick >= GAP) checkBack(); });
    window.addEventListener('pagehide', mark);
  })();

  /* ================= Swipeable Toast & Undo Snackbar ================= */
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(toast.t);
    el.toast.style.transform = '';
    el.toast.style.opacity = '';
    toast.t = setTimeout(() => el.toast.classList.remove('on'), msg.length > 42 ? 3200 : 1800);
  }

  (function attachSwipeToast() {
    let x0 = null;
    document.addEventListener('touchstart', (e) => {
      if (e.target.closest && e.target.closest('#toast')) {
        x0 = e.touches[0].clientX;
        clearTimeout(toast.t);
      }
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      const dx = e.touches[0].clientX - x0;
      el.toast.style.transform = `translate(calc(-50% + ${dx}px), 0)`;
      el.toast.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 160));
    }, { passive: true });
    const end = (e) => {
      if (x0 == null) return;
      const dx = e && e.changedTouches ? e.changedTouches[0].clientX - x0 : 0;
      x0 = null;
      if (Math.abs(dx) > 50) {
        el.toast.classList.remove('on');
        setTimeout(() => { el.toast.style.transform = ''; el.toast.style.opacity = ''; }, 250);
      } else {
        el.toast.style.transform = '';
        el.toast.style.opacity = '';
        toast.t = setTimeout(() => el.toast.classList.remove('on'), 1400);
      }
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', () => end(null), { passive: true });
  })();

  let undoTimer = null;
  function showUndo(msg) {
    clearTimeout(undoTimer);
    el.undoText.textContent = msg;
    el.undo.style.transform = '';
    el.undo.style.opacity = '';
    el.undo.classList.add('on');
    undoTimer = setTimeout(() => {
      el.undo.classList.remove('on');
      lastDeletedNote = null;
    }, 5000);
  }

  (function attachSwipeUndo() {
    let x0 = null;
    document.addEventListener('touchstart', (e) => {
      const u = e.target.closest && e.target.closest('#undo');
      if (u && u.classList.contains('on') && !e.target.closest('button')) {
        x0 = e.touches[0].clientX;
      }
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      const dx = e.touches[0].clientX - x0;
      el.undo.style.transform = `translateX(calc(-50% + ${dx}px))`;
      el.undo.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 160));
    }, { passive: true });
    const end = (e) => {
      if (x0 == null) return;
      const dx = e && e.changedTouches ? e.changedTouches[0].clientX - x0 : 0;
      x0 = null;
      if (Math.abs(dx) > 50) {
        el.undo.classList.remove('on');
        lastDeletedNote = null;
        setTimeout(() => { el.undo.style.transform = ''; el.undo.style.opacity = ''; }, 250);
      } else {
        el.undo.style.transform = '';
        el.undo.style.opacity = '';
      }
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', () => end(null), { passive: true });
  })();

  /* ================= Custom Confirm Dialog (#ask) ================= */
  let askResolver = null;
  function ask(message, opts = {}) {
    return new Promise((resolve) => {
      askResolver = resolve;
      el.askText.textContent = message;
      el.askYes.textContent = opts.okLabel || 'تأكيد';
      el.askNo.textContent = opts.cancelLabel || 'إلغاء';
      el.askYes.classList.toggle('dg', Boolean(opts.danger));
      el.ask.hidden = false;
      requestAnimationFrame(() => el.ask.classList.add('on'));
      snd('open');
    });
  }

  function closeAsk(result) {
    if (el.ask.hidden) return;
    el.ask.classList.remove('on');
    setTimeout(() => { el.ask.hidden = true; }, 180);
    if (askResolver) {
      const fn = askResolver;
      askResolver = null;
      fn(result);
    }
  }

  /* ================= Custom Bottom Picker Sheet (#xp) ================= */
  let xpResolver = null;
  function pickOption(title, options, currentValue) {
    return new Promise((resolve) => {
      xpResolver = resolve;
      el.xpTitle.textContent = title;
      el.xpList.innerHTML = '';
      for (const opt of options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `xpo ${opt.value === currentValue ? 'on' : ''}`;
        const span = document.createElement('span');
        span.textContent = opt.label;
        const mark = document.createElement('i');
        mark.textContent = '✓';
        btn.appendChild(span);
        btn.appendChild(mark);
        btn.addEventListener('click', () => {
          snd('pick');
          closeXp(opt.value);
        });
        el.xpList.appendChild(btn);
      }
      el.xp.hidden = false;
      requestAnimationFrame(() => el.xp.classList.add('on'));
      snd('open');
    });
  }

  function closeXp(value = null) {
    if (el.xp.hidden) return;
    el.xp.classList.remove('on');
    setTimeout(() => { el.xp.hidden = true; }, 220);
    if (xpResolver) {
      const fn = xpResolver;
      xpResolver = null;
      fn(value);
    }
  }

  /* ================= Theme & View ================= */
  function applyTheme(theme) {
    const t = theme === 'morning' ? 'morning' : 'iron';
    settings.theme = t;
    document.documentElement.setAttribute('data-th', t);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', t === 'morning' ? '#f3eee5' : '#0e0e0f');
    try { localStorage.setItem('kl_th', t); } catch {}
    try { window.Android && window.Android.setBarsTheme && window.Android.setBarsTheme(t !== 'morning'); } catch {}

    el.btnThemeIron.classList.toggle('on', t === 'iron');
    el.btnThemeMorning.classList.toggle('on', t === 'morning');
  }

  function applyViewMode(mode) {
    const isList = mode === 'list';
    el.pinnedGrid.classList.toggle('list-view', isList);
    el.othersGrid.classList.toggle('list-view', isList);
    el.iconViewGrid.hidden = !isList;
    el.iconViewList.hidden = isList;
  }

  function updateBackupIndicators() {
    const on = Boolean(settings.autoBackup);
    el.autoBackupDot.classList.toggle('active', on);
    el.btnBackupChip.classList.toggle('off', !on);
    el.backupChipLabel.textContent = on ? '.txt تلقائي' : '.txt يدوي';
    el.swAutoBackup.classList.toggle('on', on);
    el.btnToggleAutoBackup.setAttribute('aria-checked', String(on));

    const sfxOn = settings.sfx !== false;
    el.swSfx.classList.toggle('on', sfxOn);
    el.btnToggleSfx.setAttribute('aria-checked', String(sfxOn));

    el.filenameModeLabel.textContent =
      settings.filenameMode === 'dated'
        ? 'keep-notes-YYYY-MM-DD.txt (بالتاريخ)'
        : 'keep-notes-backup.txt (ثابت)';
  }

  /* ================= Rendering ================= */
  function renderColorFilterBar() {
    el.colorFilterBar.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `filter-chip ${colorFilter === 'all' ? 'selected' : ''}`;
    allBtn.textContent = 'الكل';
    allBtn.addEventListener('click', () => {
      snd('pick');
      colorFilter = 'all';
      renderColorFilterBar();
      renderNotes();
    });
    el.colorFilterBar.appendChild(allBtn);

    for (const c of COLORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `filter-chip color-dot-btn ${colorFilter === c.id ? 'selected' : ''}`;
      btn.dataset.color = c.id;
      btn.style.background = `var(--note-${c.id})`;
      btn.title = c.label;
      btn.setAttribute('aria-label', c.label);
      btn.addEventListener('click', () => {
        snd('pick');
        colorFilter = colorFilter === c.id ? 'all' : c.id;
        renderColorFilterBar();
        renderNotes();
      });
      el.colorFilterBar.appendChild(btn);
    }
  }

  function renderEditorColorPicker() {
    el.editorColorPicker.innerHTML = '';
    for (const c of COLORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch-btn';
      btn.dataset.color = c.id;
      btn.style.background = `var(--note-${c.id})`;
      btn.title = c.label;
      btn.setAttribute('aria-label', c.label);
      btn.addEventListener('click', () => {
        if (!activeNoteId) return;
        const note = notes.find((n) => n.id === activeNoteId);
        if (!note) return;
        snd('pick');
        note.color = c.id;
        note.updatedAt = new Date().toISOString();
        editorDirty = true;
        el.editorSheet.dataset.color = c.id;
        updateEditorColorSelection(c.id);
        scheduleLocalSave();
      });
      el.editorColorPicker.appendChild(btn);
    }
  }

  function updateEditorColorSelection(colorId) {
    const buttons = el.editorColorPicker.querySelectorAll('.swatch-btn');
    for (const btn of buttons) {
      btn.classList.toggle('selected', btn.dataset.color === colorId);
    }
  }

  function getFilteredNotes() {
    const q = searchQuery.trim().toLowerCase();
    return notes
      .filter((note) => {
        if (colorFilter !== 'all' && (note.color || 'default') !== colorFilter) return false;
        if (!q) return true;
        const titleMatch = (note.title || '').toLowerCase().includes(q);
        const contentMatch = (note.content || '').toLowerCase().includes(q);
        return titleMatch || contentMatch;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  function formatShortDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('ar-EG-u-nu-latn', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  function createNoteCard(note) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'note-card';
    card.dataset.color = note.color || 'default';
    card.addEventListener('click', () => openEditor(note.id));

    if (note.title || note.pinned) {
      const header = document.createElement('div');
      header.className = 'note-card-header';

      const title = document.createElement('h3');
      title.className = 'note-card-title';
      title.dir = 'auto';
      title.textContent = note.title || '';
      header.appendChild(title);

      if (note.pinned) {
        const pin = document.createElement('span');
        pin.className = 'note-pin-badge';
        pin.innerHTML =
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>';
        header.appendChild(pin);
      }
      card.appendChild(header);
    }

    if (note.content) {
      const body = document.createElement('div');
      body.className = 'note-card-body';
      body.dir = 'auto';
      body.textContent = note.content;
      card.appendChild(body);
    }

    const meta = document.createElement('div');
    meta.className = 'note-card-meta';
    meta.textContent = formatShortDate(note.updatedAt);
    card.appendChild(meta);

    return card;
  }

  function renderNotes() {
    const filtered = getFilteredNotes();
    const pinned = filtered.filter((n) => n.pinned);
    const others = filtered.filter((n) => !n.pinned);

    el.pinnedGrid.innerHTML = '';
    el.othersGrid.innerHTML = '';

    for (const note of pinned) el.pinnedGrid.appendChild(createNoteCard(note));
    for (const note of others) el.othersGrid.appendChild(createNoteCard(note));

    el.pinnedSection.hidden = pinned.length === 0;
    el.othersSection.hidden = others.length === 0;
    el.othersLabel.hidden = pinned.length === 0 || others.length === 0;

    const isEmpty = filtered.length === 0;
    el.emptyState.hidden = !isEmpty;
    if (isEmpty) {
      if (searchQuery.trim() || colorFilter !== 'all') {
        el.emptyTitle.textContent = 'لا توجد ملاحظات مطابقة';
        el.emptySub.textContent = 'جرّب كلمات بحث أخرى أو ألغِ تصفية اللون.';
      } else {
        el.emptyTitle.textContent = 'ملاحظاتك تظهر هنا';
        el.emptySub.textContent = 'اضغط + لتدوين أول ملاحظة — مع حفظ فوري ونسخ احتياطي .txt';
      }
    }
  }

  /* ================= Editor Lifecycle ================= */
  function openNewNote() {
    const now = new Date().toISOString();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    notes.unshift({
      id,
      title: '',
      content: '',
      color: colorFilter !== 'all' ? colorFilter : 'default',
      pinned: false,
      createdAt: now,
      updatedAt: now
    });
    openEditor(id, true);
  }

  function openEditor(noteId, isNew = false) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    snd('open');
    activeNoteId = note.id;
    editorDirty = false;
    el.editorSheet.dataset.color = note.color || 'default';
    el.noteTitleInput.value = note.title || '';
    el.noteContentInput.value = note.content || '';
    el.btnTogglePin.classList.toggle('on', Boolean(note.pinned));
    el.editorTimestamp.textContent = isNew ? 'ملاحظة جديدة' : `آخر تعديل: ${formatShortDate(note.updatedAt)}`;
    el.editorSyncStatus.textContent = 'محفوظ محلياً';
    updateEditorColorSelection(note.color || 'default');

    el.editorModal.hidden = false;
    document.body.style.overflow = 'hidden';

    if (history.state?.modal !== 'editor') {
      history.pushState({ modal: 'editor' }, '');
    }

    setTimeout(() => {
      if (isNew) el.noteContentInput.focus();
    }, 60);
  }

  function scheduleLocalSave() {
    if (!activeNoteId) return;
    el.editorSyncStatus.textContent = 'جاري الحفظ...';
    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = setTimeout(async () => {
      await persistNotesLocally();
      el.editorSyncStatus.textContent = 'محفوظ محلياً';
    }, 300);
  }

  async function persistNotesLocally() {
    const cleaned = notes.filter((n) => (n.title && n.title.trim()) || (n.content && n.content.trim()));
    await B.saveAllNotes(cleaned);
    const txt = B.serializeNotesToTxt(cleaned);
    await B.writeOpfsBackup(txt);
    return txt;
  }

  async function runAutoTxtBackup(fromUserGesture = false) {
    const txt = await persistNotesLocally();
    if (!settings.autoBackup) return;

    // 1) Android WebView Native Bridge silent SAF file sync
    if (B.hasAndroidBridge() && B.androidLinkedName()) {
      try {
        if (window.Android.writeLinkedAsync && window.Android.writeLinkedAsync(txt)) {
          return;
        }
      } catch {
        // Fallback below
      }
    }

    // 2) Desktop/Chromium File System Access API silent file sync
    const linkedResult = await B.writeLinkedBackupFile(txt, fromUserGesture);
    if (linkedResult.ok) {
      settings.lastBackupAt = new Date().toISOString();
      settings.lastBackupMethod = `ملف مربوط (${linkedResult.name})`;
      await B.saveSettings(settings);
      toast(`تم الحفظ وتحديث ${linkedResult.name}`);
      return;
    }

    // 3) Standard Android Chrome / Mobile PWA automatic .txt download on explicit save/commit gesture
    if (fromUserGesture) {
      const filename = B.getBackupFilename(settings.filenameMode);
      const mode = B.downloadTxtBackup(txt, filename);
      if (mode === 'download') {
        settings.lastBackupAt = new Date().toISOString();
        settings.lastBackupMethod = `تنزيل تلقائي (${filename})`;
        await B.saveSettings(settings);
        toast(`تم الحفظ + تحديث ${filename}`);
      }
    }
  }

  async function closeEditor(fromUserGesture = true) {
    if (el.editorModal.hidden) return;
    snd('close');

    clearTimeout(typingDebounceTimer);
    const idx = notes.findIndex((n) => n.id === activeNoteId);
    let shouldBackup = editorDirty;

    if (idx !== -1) {
      const note = notes[idx];
      const hasText = Boolean((note.title && note.title.trim()) || (note.content && note.content.trim()));
      if (!hasText) {
        notes.splice(idx, 1);
        shouldBackup = false;
      }
    }

    activeNoteId = null;
    el.editorModal.hidden = true;
    document.body.style.overflow = '';
    renderNotes();

    if (shouldBackup) {
      await runAutoTxtBackup(fromUserGesture);
    } else {
      await persistNotesLocally();
    }
  }

  async function deleteActiveNote() {
    if (!activeNoteId) return;
    const idx = notes.findIndex((n) => n.id === activeNoteId);
    if (idx === -1) return;

    const note = notes[idx];
    const hadContent = Boolean((note.title && note.title.trim()) || (note.content && note.content.trim()));
    if (hadContent) {
      const confirmed = await ask('حذف هذه الملاحظة؟\nيمكنك التراجع فوراً بعد الحذف.', {
        okLabel: 'حذف',
        danger: true
      });
      if (!confirmed) return;
    }

    const removed = notes.splice(idx, 1)[0];
    activeNoteId = null;
    clearTimeout(typingDebounceTimer);
    el.editorModal.hidden = true;
    document.body.style.overflow = '';
    renderNotes();
    snd('off');
    vibe(12);

    if (hadContent) {
      lastDeletedNote = removed;
      await runAutoTxtBackup(true);
      showUndo('تم حذف الملاحظة');
    } else {
      await persistNotesLocally();
    }
  }

  async function undoDelete() {
    if (!lastDeletedNote) return;
    notes.unshift(lastDeletedNote);
    lastDeletedNote = null;
    el.undo.classList.remove('on');
    clearTimeout(undoTimer);
    snd('on');
    renderNotes();
    await runAutoTxtBackup(true);
    toast('تمت استعادة الملاحظة');
  }

  /* ================= Backup & Settings Modal ================= */
  async function refreshBackupModalState() {
    updateBackupIndicators();
    const txt = B.serializeNotesToTxt(notes);
    el.txtPreview.textContent = txt;

    const androidBridge = B.hasAndroidBridge();
    const pickerSupported = B.supportsFilePicker();
    el.directLinkCard.hidden = !androidBridge && !pickerSupported;

    if (androidBridge) {
      const name = B.androidLinkedName();
      if (name) {
        el.linkedFileLabel.textContent = `مربوط حالياً بـ: ${name}`;
        el.btnUnlinkFile.hidden = true; // Managed by Android SAF link replacement
      } else {
        el.linkedFileLabel.textContent = 'اختر ملفاً لحفظ النسخة فيه تلقائياً وبصمت (أو على Drive)';
        el.btnUnlinkFile.hidden = true;
      }
      el.backupMethodInfo.textContent = name
        ? `مفعل: الحفظ الصامت المباشر في (${name}) عند كل تعديل.`
        : 'اضغط «اختيار ملف» لربط ملف .txt دائم تُحفظ فيه ملاحظاتك تلقائياً وبصمت.';
    } else if (pickerSupported) {
      const handle = await B.getLinkedFileHandle();
      if (handle) {
        el.linkedFileLabel.textContent = `مربوط حالياً بـ: ${handle.name}`;
        el.btnUnlinkFile.hidden = false;
      } else {
        el.linkedFileLabel.textContent = 'لم يتم ربط ملف بعد';
        el.btnUnlinkFile.hidden = true;
      }
      el.backupMethodInfo.textContent =
        'متصفحك يدعم ربط ملف .txt مباشر للكتابة الصامتة، أو التنزيل التلقائي عند الحفظ.';
    } else {
      el.backupMethodInfo.textContent =
        'على متصفح الموبايل: يتم حفظ نسخة فورية داخل التطبيق، وعند الضغط على «حفظ» بعد أي تعديل يتم تحديث وتنزيل ملف .txt تلقائياً في التنزيلات (Downloads).';
    }

    el.btnShareTxt.hidden = !B.canShareTxtFile();
    el.lastBackupLabel.textContent = settings.lastBackupAt
      ? `آخر نسخة احتياطية: ${formatShortDate(settings.lastBackupAt)} — ${settings.lastBackupMethod || ''}`
      : 'لم يتم إنشاء ملف نسخ احتياطي خارجي بعد';
  }

  async function openBackupModal() {
    snd('open');
    await refreshBackupModalState();
    el.backupModal.hidden = false;
    document.body.style.overflow = 'hidden';

    if (history.state?.modal !== 'backup') {
      history.pushState({ modal: 'backup' }, '');
    }
  }

  function closeBackupModal() {
    if (el.backupModal.hidden) return;
    snd('close');
    el.backupModal.hidden = true;
    document.body.style.overflow = '';
  }

  /* ================= Import / Restore (.txt) ================= */
  async function applyRestoreFromTxt(rawText, filename = 'backup.txt') {
    const imported = B.parseNotesFromTxt(rawText, filename);
    if (imported.length === 0) {
      toast('الملف فارغ ولا يحتوي على ملاحظات');
      return { added: 0, updated: 0 };
    }

    const byId = new Map(notes.map((n) => [n.id, n]));
    let added = 0;
    let updated = 0;

    for (const item of imported) {
      const existing = byId.get(item.id);
      if (!existing) {
        notes.push(item);
        added++;
      } else if (new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        Object.assign(existing, item);
        updated++;
      }
    }

    await persistNotesLocally();
    renderNotes();
    el.txtPreview.textContent = B.serializeNotesToTxt(notes);
    snd('on');
    toast(`تم الاستيراد: ${added} جديدة، ${updated} محدثة`);
    return { added, updated };
  }

  /* ================= Android Native Bridge Hooks ================= */
  window.__glSaved = async (ok) => {
    if (ok) {
      const filename = B.getBackupFilename(settings.filenameMode);
      settings.lastBackupAt = new Date().toISOString();
      settings.lastBackupMethod = `حفظ أندرويد (${filename})`;
      await B.saveSettings(settings);
      toast('تم حفظ الملف بنجاح');
    } else {
      toast('تعذر حفظ الملف');
    }
  };

  window.__glLinked = async (ok, name) => {
    if (ok) {
      settings.lastBackupAt = new Date().toISOString();
      settings.lastBackupMethod = `ملف مربوط (${name || 'keep-notes-backup.txt'})`;
      await B.saveSettings(settings);
      toast(`تم ربط الملف ${name || ''}`);
    } else {
      toast('تعذر ربط الملف');
    }
    if (!el.backupModal.hidden) await refreshBackupModalState();
  };

  window.__glWrote = async (ok) => {
    if (ok) {
      const name = B.androidLinkedName() || 'الملف المربوط';
      settings.lastBackupAt = new Date().toISOString();
      settings.lastBackupMethod = `حفظ صامت (${name})`;
      await B.saveSettings(settings);
      toast(`تم الحفظ وتحديث ${name}`);
    }
  };

  window.__glOpen = async (text) => {
    if (text == null) return;
    await applyRestoreFromTxt(text, 'keep-notes-backup.txt');
  };

  window.glBack = function () {
    if (!el.ask.hidden) {
      closeAsk(false);
      return true;
    }
    if (!el.xp.hidden) {
      closeXp(null);
      return true;
    }
    if (!el.editorModal.hidden) {
      closeEditor(false);
      return true;
    }
    if (!el.backupModal.hidden) {
      closeBackupModal();
      return true;
    }
    if (searchQuery || colorFilter !== 'all') {
      searchQuery = '';
      colorFilter = 'all';
      el.searchInput.value = '';
      el.btnClearSearch.hidden = true;
      renderColorFilterBar();
      renderNotes();
      return true;
    }
    ask('هل تريد الخروج من مفكرة؟', { okLabel: 'خروج' }).then((yes) => {
      if (yes && window.Android && window.Android.exitApp) {
        try { window.Android.exitApp(); } catch {}
      }
    });
    return true;
  };

  /* ================= Service Worker + Manual Update Flow ================= */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });

      const showUpdate = () => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          el.updBtn.hidden = false;
          el.updBtn.onclick = () => {
            snd('ui');
            updatingSw = true;
            reg.waiting && reg.waiting.postMessage('skip');
          };
        }
      };

      showUpdate();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) {
          w.addEventListener('statechange', () => {
            if (w.state === 'installed') showUpdate();
          });
        }
      });
    }).catch(() => {});

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updatingSw && !swReloaded) {
        swReloaded = true;
        location.reload();
      }
    });
  }

  /* ================= Event Bindings ================= */
  function bindEvents() {
    el.brandLogo.addEventListener('click', () => {
      el.brandLogo.classList.remove('spin');
      void el.brandLogo.offsetWidth;
      el.brandLogo.classList.add('spin');
      snd('ui');
    });

    el.searchInput.addEventListener('input', () => {
      searchQuery = el.searchInput.value;
      el.btnClearSearch.hidden = !searchQuery;
      renderNotes();
    });

    el.btnClearSearch.addEventListener('click', () => {
      snd('ui');
      searchQuery = '';
      el.searchInput.value = '';
      el.btnClearSearch.hidden = true;
      renderNotes();
    });

    el.btnToggleView.addEventListener('click', async () => {
      snd('ui');
      settings.viewMode = settings.viewMode === 'list' ? 'grid' : 'list';
      applyViewMode(settings.viewMode);
      await B.saveSettings(settings);
    });

    el.fabAddNote.addEventListener('click', () => { vibe(8); openNewNote(); });
    el.btnQuickNote.addEventListener('click', () => { vibe(8); openNewNote(); });

    const handleNoteInput = () => {
      if (!activeNoteId) return;
      const note = notes.find((n) => n.id === activeNoteId);
      if (!note) return;
      note.title = el.noteTitleInput.value;
      note.content = el.noteContentInput.value;
      note.updatedAt = new Date().toISOString();
      editorDirty = true;
      el.editorTimestamp.textContent = `آخر تعديل: ${formatShortDate(note.updatedAt)}`;
      scheduleLocalSave();
    };

    el.noteTitleInput.addEventListener('input', handleNoteInput);
    el.noteContentInput.addEventListener('input', handleNoteInput);

    el.btnTogglePin.addEventListener('click', () => {
      if (!activeNoteId) return;
      const note = notes.find((n) => n.id === activeNoteId);
      if (!note) return;
      note.pinned = !note.pinned;
      note.updatedAt = new Date().toISOString();
      editorDirty = true;
      el.btnTogglePin.classList.toggle('on', note.pinned);
      snd(note.pinned ? 'on' : 'off');
      scheduleLocalSave();
      toast(note.pinned ? 'تم تثبيت الملاحظة' : 'تم إلغاء التثبيت');
    });

    el.btnCopyNote.addEventListener('click', async () => {
      const text = [el.noteTitleInput.value.trim(), el.noteContentInput.value.trim()]
        .filter(Boolean)
        .join('\n\n');
      if (!text) return;
      if (window.Android && window.Android.copyText) {
        try {
          if (window.Android.copyText(text)) {
            snd('ui');
            toast('تم نسخ الملاحظة');
            return;
          }
        } catch {}
      }
      try {
        await navigator.clipboard.writeText(text);
        snd('ui');
        toast('تم نسخ الملاحظة');
      } catch {
        toast('تعذر النسخ تلقائياً');
      }
    });

    el.btnDeleteNote.addEventListener('click', deleteActiveNote);
    el.btnSaveClose.addEventListener('click', () => closeEditor(true));
    el.editorBackdrop.addEventListener('click', () => closeEditor(true));

    // Backup & Settings Modal
    el.btnOpenBackup.addEventListener('click', openBackupModal);
    el.btnBackupChip.addEventListener('click', openBackupModal);
    el.btnCloseBackup.addEventListener('click', closeBackupModal);
    el.backupBackdrop.addEventListener('click', closeBackupModal);

    el.btnThemeIron.addEventListener('click', async () => {
      snd('pick');
      applyTheme('iron');
      await B.saveSettings(settings);
    });

    el.btnThemeMorning.addEventListener('click', async () => {
      snd('pick');
      applyTheme('morning');
      await B.saveSettings(settings);
    });

    el.btnToggleAutoBackup.addEventListener('click', async () => {
      settings.autoBackup = !settings.autoBackup;
      snd(settings.autoBackup ? 'on' : 'off');
      await B.saveSettings(settings);
      updateBackupIndicators();
      toast(settings.autoBackup ? 'تم تفعيل النسخ التلقائي' : 'تم إيقاف النسخ التلقائي');
    });

    el.btnToggleSfx.addEventListener('click', async () => {
      settings.sfx = settings.sfx === false;
      if (settings.sfx) snd('on');
      await B.saveSettings(settings);
      updateBackupIndicators();
    });

    el.btnPickFilenameMode.addEventListener('click', async () => {
      const chosen = await pickOption(
        'اختر اسم ملف النسخ الاحتياطي التلقائي',
        [
          { value: 'fixed', label: 'keep-notes-backup.txt (اسم ثابت)' },
          { value: 'dated', label: 'keep-notes-YYYY-MM-DD.txt (بتاريخ اليوم)' }
        ],
        settings.filenameMode || 'fixed'
      );
      if (!chosen) return;
      settings.filenameMode = chosen;
      await B.saveSettings(settings);
      updateBackupIndicators();
    });

    el.btnLinkFile.addEventListener('click', async () => {
      const txt = B.serializeNotesToTxt(notes);
      if (B.hasAndroidBridge()) {
        try {
          window.Android.linkFile('keep-notes-backup.txt', txt);
        } catch {
          toast('تعذر فتح اختيار الملف');
        }
        return;
      }
      try {
        const handle = await B.linkBackupFile(txt);
        settings.lastBackupAt = new Date().toISOString();
        settings.lastBackupMethod = `ملف مربوط (${handle.name})`;
        await B.saveSettings(settings);
        snd('on');
        await refreshBackupModalState();
        toast(`تم ربط الملف ${handle.name}`);
      } catch (err) {
        if (err && err.name !== 'AbortError') toast('تعذر ربط الملف');
      }
    });

    el.btnUnlinkFile.addEventListener('click', async () => {
      const yes = await ask('فك ربط ملف النسخ الاحتياطي المباشر؟', { okLabel: 'فك الربط' });
      if (!yes) return;
      await B.clearLinkedFileHandle();
      snd('off');
      await refreshBackupModalState();
      toast('تم فك ربط الملف');
    });

    el.btnDownloadTxt.addEventListener('click', async () => {
      snd('ui');
      const txt = B.serializeNotesToTxt(notes);
      const filename = B.getBackupFilename(settings.filenameMode);
      const mode = B.downloadTxtBackup(txt, filename);
      if (mode === 'download') {
        settings.lastBackupAt = new Date().toISOString();
        settings.lastBackupMethod = `تنزيل يدوي (${filename})`;
        await B.saveSettings(settings);
        await refreshBackupModalState();
        toast(`تم تنزيل ${filename}`);
      }
    });

    el.btnShareTxt.addEventListener('click', async () => {
      try {
        const txt = B.serializeNotesToTxt(notes);
        const filename = B.getBackupFilename(settings.filenameMode);
        await B.shareTxtBackup(txt, filename);
        settings.lastBackupAt = new Date().toISOString();
        settings.lastBackupMethod = `مشاركة (${filename})`;
        await B.saveSettings(settings);
        await refreshBackupModalState();
      } catch (err) {
        if (err && err.name !== 'AbortError') toast('تعذرت المشاركة');
      }
    });

    el.btnImportTxt.addEventListener('click', () => {
      snd('ui');
      el.fileImportInput.value = '';
      el.fileImportInput.click();
    });

    el.fileImportInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const content = await file.text();
        await applyRestoreFromTxt(content, file.name);
      } catch {
        toast('تعذر قراءة الملف');
      }
    });

    el.btnCopyTxtPreview.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(el.txtPreview.textContent || '');
        snd('ui');
        toast('تم نسخ نص النسخة الاحتياطية');
      } catch {
        toast('تعذر النسخ');
      }
    });

    el.undoBtn.addEventListener('click', undoDelete);
    el.askNo.addEventListener('click', () => closeAsk(false));
    el.askYes.addEventListener('click', () => closeAsk(true));
    el.ask.addEventListener('click', (e) => { if (e.target === el.ask) closeAsk(false); });
    el.xp.addEventListener('click', (e) => { if (e.target === el.xp) closeXp(null); });

    window.addEventListener('popstate', () => {
      if (!el.ask.hidden) closeAsk(false);
      else if (!el.xp.hidden) closeXp(null);
      else if (!el.editorModal.hidden) closeEditor(false);
      else if (!el.backupModal.hidden) closeBackupModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!el.ask.hidden) closeAsk(false);
        else if (!el.xp.hidden) closeXp(null);
        else if (!el.editorModal.hidden) closeEditor(true);
        else if (!el.backupModal.hidden) closeBackupModal();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistNotesLocally();
    });

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      el.installBanner.hidden = false;
    });

    el.btnInstallPwa.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      el.installBanner.hidden = true;
    });

    el.btnDismissInstall.addEventListener('click', () => {
      el.installBanner.hidden = true;
    });
  }

  async function init() {
    settings = await B.loadSettings();
    notes = await B.loadNotes();

    applyTheme(settings.theme);
    applyViewMode(settings.viewMode);
    renderColorFilterBar();
    renderEditorColorPicker();
    updateBackupIndicators();
    renderNotes();
    await B.writeOpfsBackup(B.serializeNotesToTxt(notes));

    bindEvents();
    registerServiceWorker();
  }

  // Expose testable surface cleanly
  window.VER = VER;
  window.applyRestoreFromTxt = applyRestoreFromTxt;
  window.__klState = () => ({ notes, settings });

  init();
})();
