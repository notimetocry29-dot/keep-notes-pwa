import {
  loadNotes,
  saveAllNotes,
  loadSettings,
  saveSettings,
  serializeNotesToTxt,
  parseNotesFromTxt,
  getBackupFilename,
  writeOpfsBackup,
  supportsFilePicker,
  getLinkedFileHandle,
  clearLinkedFileHandle,
  linkBackupFile,
  writeLinkedBackupFile,
  downloadTxtBackup,
  canShareTxtFile,
  shareTxtBackup
} from './backup.js';

const COLORS = [
  { id: 'default', label: 'افتراضي' },
  { id: 'coral', label: 'مرجاني' },
  { id: 'peach', label: 'خوخي' },
  { id: 'sand', label: 'أصفر' },
  { id: 'mint', label: 'أخضر' },
  { id: 'teal', label: 'تركواز' },
  { id: 'fog', label: 'أزرق' },
  { id: 'lavender', label: 'بنفسجي' },
  { id: 'blossom', label: 'وردي' },
  { id: 'clay', label: 'رمادي' }
];

// App State
let notes = [];
let settings = {};
let searchQuery = '';
let colorFilter = 'all';
let activeNoteId = null;
let editorDirty = false;
let typingDebounceTimer = null;
let toastTimer = null;
let lastDeletedNote = null;
let deferredInstallPrompt = null;

// DOM Refs
const el = {
  searchInput: document.getElementById('searchInput'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  btnToggleView: document.getElementById('btnToggleView'),
  iconViewGrid: document.getElementById('iconViewGrid'),
  iconViewList: document.getElementById('iconViewList'),
  btnToggleTheme: document.getElementById('btnToggleTheme'),
  iconMoon: document.getElementById('iconMoon'),
  iconSun: document.getElementById('iconSun'),
  colorFilterBar: document.getElementById('colorFilterBar'),

  installBanner: document.getElementById('installBanner'),
  btnInstallPwa: document.getElementById('btnInstallPwa'),
  btnDismissInstall: document.getElementById('btnDismissInstall'),

  pinnedSection: document.getElementById('pinnedSection'),
  pinnedGrid: document.getElementById('pinnedGrid'),
  othersSection: document.getElementById('othersSection'),
  othersLabel: document.getElementById('othersLabel'),
  othersGrid: document.getElementById('othersGrid'),
  emptyState: document.getElementById('emptyState'),
  emptyTitle: document.getElementById('emptyTitle'),
  emptySub: document.getElementById('emptySub'),

  btnQuickNote: document.getElementById('btnQuickNote'),
  fabAddNote: document.getElementById('fabAddNote'),
  btnOpenBackup: document.getElementById('btnOpenBackup'),
  btnBackupChip: document.getElementById('btnBackupChip'),
  backupChipLabel: document.getElementById('backupChipLabel'),
  autoBackupDot: document.getElementById('autoBackupDot'),

  editorModal: document.getElementById('editorModal'),
  editorBackdrop: document.getElementById('editorBackdrop'),
  editorSheet: document.getElementById('editorSheet'),
  btnSaveClose: document.getElementById('btnSaveClose'),
  btnTogglePin: document.getElementById('btnTogglePin'),
  btnCopyNote: document.getElementById('btnCopyNote'),
  btnDeleteNote: document.getElementById('btnDeleteNote'),
  noteTitleInput: document.getElementById('noteTitleInput'),
  noteContentInput: document.getElementById('noteContentInput'),
  editorColorPicker: document.getElementById('editorColorPicker'),
  editorTimestamp: document.getElementById('editorTimestamp'),
  editorSyncStatus: document.getElementById('editorSyncStatus'),

  backupModal: document.getElementById('backupModal'),
  backupBackdrop: document.getElementById('backupBackdrop'),
  btnCloseBackup: document.getElementById('btnCloseBackup'),
  chkAutoBackup: document.getElementById('chkAutoBackup'),
  selectFilenameMode: document.getElementById('selectFilenameMode'),
  backupMethodInfo: document.getElementById('backupMethodInfo'),
  directLinkCard: document.getElementById('directLinkCard'),
  linkedFileLabel: document.getElementById('linkedFileLabel'),
  btnLinkFile: document.getElementById('btnLinkFile'),
  btnUnlinkFile: document.getElementById('btnUnlinkFile'),
  btnDownloadTxt: document.getElementById('btnDownloadTxt'),
  btnShareTxt: document.getElementById('btnShareTxt'),
  btnImportTxt: document.getElementById('btnImportTxt'),
  fileImportInput: document.getElementById('fileImportInput'),
  txtPreview: document.getElementById('txtPreview'),
  btnCopyTxtPreview: document.getElementById('btnCopyTxtPreview'),
  lastBackupLabel: document.getElementById('lastBackupLabel'),

  toast: document.getElementById('toast'),
  toastText: document.getElementById('toastText'),
  toastUndoBtn: document.getElementById('toastUndoBtn')
};

async function init() {
  settings = await loadSettings();
  notes = await loadNotes();

  applyTheme(settings.theme);
  applyViewMode(settings.viewMode);
  renderColorFilterBar();
  renderEditorColorPicker();
  updateBackupIndicators();
  renderNotes();

  // Keep OPFS snapshot fresh on startup
  await writeOpfsBackup(serializeNotesToTxt(notes));

  bindEvents();
  registerServiceWorker();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  el.iconMoon.classList.toggle('hidden', isDark);
  el.iconSun.classList.toggle('hidden', !isDark);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', isDark ? '#202124' : '#fbbc04');
}

function applyViewMode(mode) {
  const isList = mode === 'list';
  el.pinnedGrid.classList.toggle('list-view', isList);
  el.othersGrid.classList.toggle('list-view', isList);
  el.iconViewGrid.classList.toggle('hidden', !isList);
  el.iconViewList.classList.toggle('hidden', isList);
}

function updateBackupIndicators() {
  const on = Boolean(settings.autoBackup);
  el.autoBackupDot.classList.toggle('active', on);
  el.btnBackupChip.classList.toggle('off', !on);
  el.backupChipLabel.textContent = on ? '.txt تلقائي' : '.txt يدوي';
}

function renderColorFilterBar() {
  el.colorFilterBar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `filter-chip ${colorFilter === 'all' ? 'selected' : ''}`;
  allBtn.textContent = 'الكل';
  allBtn.addEventListener('click', () => {
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
      if (colorFilter !== 'all' && (note.color || 'default') !== colorFilter) {
        return false;
      }
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
    return new Date(iso).toLocaleString('ar-EG', {
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
      pin.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>`;
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

  for (const note of pinned) {
    el.pinnedGrid.appendChild(createNoteCard(note));
  }
  for (const note of others) {
    el.othersGrid.appendChild(createNoteCard(note));
  }

  el.pinnedSection.classList.toggle('hidden', pinned.length === 0);
  el.othersSection.classList.toggle('hidden', others.length === 0);
  el.othersLabel.classList.toggle('hidden', pinned.length === 0 || others.length === 0);

  const isEmpty = filtered.length === 0;
  el.emptyState.classList.toggle('hidden', !isEmpty);
  if (isEmpty) {
    if (searchQuery.trim() || colorFilter !== 'all') {
      el.emptyTitle.textContent = 'لا توجد ملاحظات مطابقة';
      el.emptySub.textContent = 'جرّب كلمات بحث أخرى أو ألغِ تصفية اللون.';
    } else {
      el.emptyTitle.textContent = 'ملاحظاتك تظهر هنا';
      el.emptySub.textContent = 'اضغط على + لتدوين أول ملاحظة — ويتم نسخها احتياطياً لملف .txt';
    }
  }
}

function openNewNote() {
  const now = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newNote = {
    id,
    title: '',
    content: '',
    color: colorFilter !== 'all' ? colorFilter : 'default',
    pinned: false,
    createdAt: now,
    updatedAt: now
  };
  notes.unshift(newNote);
  openEditor(id, true);
}

function openEditor(noteId, isNew = false) {
  const note = notes.find((n) => n.id === noteId);
  if (!note) return;

  activeNoteId = note.id;
  editorDirty = false;
  el.editorSheet.dataset.color = note.color || 'default';
  el.noteTitleInput.value = note.title || '';
  el.noteContentInput.value = note.content || '';
  el.btnTogglePin.classList.toggle('active', Boolean(note.pinned));
  el.editorTimestamp.textContent = isNew ? 'ملاحظة جديدة' : `آخر تعديل: ${formatShortDate(note.updatedAt)}`;
  el.editorSyncStatus.textContent = 'محفوظ محلياً';
  updateEditorColorSelection(note.color || 'default');

  el.editorModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (history.state?.modal !== 'editor') {
    history.pushState({ modal: 'editor' }, '');
  }

  setTimeout(() => {
    if (isNew) {
      el.noteContentInput.focus();
    }
  }, 50);
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
  await saveAllNotes(cleaned);
  const txt = serializeNotesToTxt(cleaned);
  await writeOpfsBackup(txt);
  return txt;
}

async function runAutoTxtBackup(fromUserGesture = false) {
  const txt = await persistNotesLocally();
  if (!settings.autoBackup) return;

  // 1) Try linked direct file handle first (works silently when supported & granted)
  const linkedResult = await writeLinkedBackupFile(txt, fromUserGesture);
  if (linkedResult.ok) {
    settings.lastBackupAt = new Date().toISOString();
    settings.lastBackupMethod = `ملف مربوط (${linkedResult.name})`;
    await saveSettings(settings);
    showToast(`تم الحفظ وتحديث ${linkedResult.name}`);
    return;
  }

  // 2) On Android Chrome / standard browsers, download updated .txt on explicit save/commit gesture
  if (fromUserGesture) {
    const filename = getBackupFilename(settings.filenameMode);
    downloadTxtBackup(txt, filename);
    settings.lastBackupAt = new Date().toISOString();
    settings.lastBackupMethod = `تنزيل تلقائي (${filename})`;
    await saveSettings(settings);
    showToast(`تم الحفظ + تحديث ملف ${filename}`);
  }
}

async function closeEditor(fromUserGesture = true) {
  if (el.editorModal.classList.contains('hidden')) return;

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
  el.editorModal.classList.add('hidden');
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

  const removed = notes[idx];
  const hadContent = Boolean((removed.title && removed.title.trim()) || (removed.content && removed.content.trim()));
  notes.splice(idx, 1);
  activeNoteId = null;
  clearTimeout(typingDebounceTimer);
  el.editorModal.classList.add('hidden');
  document.body.style.overflow = '';
  renderNotes();

  if (hadContent) {
    lastDeletedNote = removed;
    await runAutoTxtBackup(true);
    showToast('تم حذف الملاحظة', true);
  } else {
    await persistNotesLocally();
  }
}

async function undoDelete() {
  if (!lastDeletedNote) return;
  notes.unshift(lastDeletedNote);
  lastDeletedNote = null;
  renderNotes();
  await runAutoTxtBackup(true);
  showToast('تمت استعادة الملاحظة');
}

async function openBackupModal() {
  el.chkAutoBackup.checked = Boolean(settings.autoBackup);
  el.selectFilenameMode.value = settings.filenameMode || 'fixed';

  const txt = serializeNotesToTxt(notes);
  el.txtPreview.textContent = txt;

  const pickerSupported = supportsFilePicker();
  el.directLinkCard.classList.toggle('hidden', !pickerSupported);

  if (pickerSupported) {
    const handle = await getLinkedFileHandle();
    if (handle) {
      el.linkedFileLabel.textContent = `مربوط حالياً بـ: ${handle.name}`;
      el.btnUnlinkFile.classList.remove('hidden');
    } else {
      el.linkedFileLabel.textContent = 'لم يتم ربط ملف بعد';
      el.btnUnlinkFile.classList.add('hidden');
    }
    el.backupMethodInfo.textContent =
      'متصفحك يدعم ربط ملف .txt مباشر للكتابة الصامتة، أو التنزيل التلقائي عند الحفظ.';
  } else {
    el.backupMethodInfo.textContent =
      'على متصفح الموبايل (أندرويد): يتم حفظ نسخة فورية داخل التطبيق، وعند الضغط على "حفظ" بعد أي تعديل يتم تنزيل وتحديث ملف .txt تلقائياً في مجلد التنزيلات (Downloads).';
  }

  el.btnShareTxt.classList.toggle('hidden', !canShareTxtFile());

  if (settings.lastBackupAt) {
    el.lastBackupLabel.textContent = `آخر نسخة احتياطية: ${formatShortDate(settings.lastBackupAt)} — ${settings.lastBackupMethod || ''}`;
  } else {
    el.lastBackupLabel.textContent = 'لم يتم إنشاء ملف نسخ احتياطي خارجي بعد';
  }

  el.backupModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (history.state?.modal !== 'backup') {
    history.pushState({ modal: 'backup' }, '');
  }
}

function closeBackupModal() {
  if (el.backupModal.classList.contains('hidden')) return;
  el.backupModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function showToast(message, withUndo = false) {
  clearTimeout(toastTimer);
  el.toastText.textContent = message;
  el.toastUndoBtn.classList.toggle('hidden', !withUndo);
  el.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    el.toast.classList.add('hidden');
  }, withUndo ? 5000 : 2800);
}

function bindEvents() {
  // Search & Filters
  el.searchInput.addEventListener('input', () => {
    searchQuery = el.searchInput.value;
    el.btnClearSearch.classList.toggle('hidden', !searchQuery);
    renderNotes();
  });

  el.btnClearSearch.addEventListener('click', () => {
    searchQuery = '';
    el.searchInput.value = '';
    el.btnClearSearch.classList.add('hidden');
    renderNotes();
  });

  // View & Theme
  el.btnToggleView.addEventListener('click', async () => {
    settings.viewMode = settings.viewMode === 'list' ? 'grid' : 'list';
    applyViewMode(settings.viewMode);
    await saveSettings(settings);
  });

  el.btnToggleTheme.addEventListener('click', async () => {
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(settings.theme);
    await saveSettings(settings);
  });

  // New Note Triggers
  el.fabAddNote.addEventListener('click', openNewNote);
  el.btnQuickNote.addEventListener('click', openNewNote);

  // Editor Inputs
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

  el.btnTogglePin.addEventListener('click', async () => {
    if (!activeNoteId) return;
    const note = notes.find((n) => n.id === activeNoteId);
    if (!note) return;
    note.pinned = !note.pinned;
    note.updatedAt = new Date().toISOString();
    editorDirty = true;
    el.btnTogglePin.classList.toggle('active', note.pinned);
    scheduleLocalSave();
    showToast(note.pinned ? 'تم تثبيت الملاحظة' : 'تم إلغاء التثبيت');
  });

  el.btnCopyNote.addEventListener('click', async () => {
    const text = [el.noteTitleInput.value.trim(), el.noteContentInput.value.trim()]
      .filter(Boolean)
      .join('\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast('تم نسخ الملاحظة');
    } catch {
      showToast('تعذر النسخ تلقائياً');
    }
  });

  el.btnDeleteNote.addEventListener('click', deleteActiveNote);
  el.btnSaveClose.addEventListener('click', () => closeEditor(true));
  el.editorBackdrop.addEventListener('click', () => closeEditor(true));

  // Backup Modal
  el.btnOpenBackup.addEventListener('click', openBackupModal);
  el.btnBackupChip.addEventListener('click', openBackupModal);
  el.btnCloseBackup.addEventListener('click', closeBackupModal);
  el.backupBackdrop.addEventListener('click', closeBackupModal);

  el.chkAutoBackup.addEventListener('change', async () => {
    settings.autoBackup = el.chkAutoBackup.checked;
    await saveSettings(settings);
    updateBackupIndicators();
    showToast(settings.autoBackup ? 'تم تفعيل النسخ الاحتياطي التلقائي' : 'تم إيقاف النسخ التلقائي');
  });

  el.selectFilenameMode.addEventListener('change', async () => {
    settings.filenameMode = el.selectFilenameMode.value;
    await saveSettings(settings);
  });

  el.btnLinkFile.addEventListener('click', async () => {
    try {
      const txt = serializeNotesToTxt(notes);
      const handle = await linkBackupFile(txt);
      el.linkedFileLabel.textContent = `مربوط حالياً بـ: ${handle.name}`;
      el.btnUnlinkFile.classList.remove('hidden');
      settings.lastBackupAt = new Date().toISOString();
      settings.lastBackupMethod = `ملف مربوط (${handle.name})`;
      await saveSettings(settings);
      el.lastBackupLabel.textContent = `آخر نسخة احتياطية: ${formatShortDate(settings.lastBackupAt)} — ${settings.lastBackupMethod}`;
      showToast(`تم ربط الملف ${handle.name}`);
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        showToast('تعذر ربط الملف');
      }
    }
  });

  el.btnUnlinkFile.addEventListener('click', async () => {
    await clearLinkedFileHandle();
    el.linkedFileLabel.textContent = 'لم يتم ربط ملف بعد';
    el.btnUnlinkFile.classList.add('hidden');
    showToast('تم فك ربط الملف');
  });

  el.btnDownloadTxt.addEventListener('click', async () => {
    const txt = serializeNotesToTxt(notes);
    const filename = getBackupFilename(settings.filenameMode);
    downloadTxtBackup(txt, filename);
    settings.lastBackupAt = new Date().toISOString();
    settings.lastBackupMethod = `تنزيل يدوي (${filename})`;
    await saveSettings(settings);
    el.lastBackupLabel.textContent = `آخر نسخة احتياطية: ${formatShortDate(settings.lastBackupAt)} — ${settings.lastBackupMethod}`;
    showToast(`تم تنزيل ${filename}`);
  });

  el.btnShareTxt.addEventListener('click', async () => {
    try {
      const txt = serializeNotesToTxt(notes);
      const filename = getBackupFilename(settings.filenameMode);
      await shareTxtBackup(txt, filename);
      settings.lastBackupAt = new Date().toISOString();
      settings.lastBackupMethod = `مشاركة (${filename})`;
      await saveSettings(settings);
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        showToast('تعذرت المشاركة');
      }
    }
  });

  el.btnImportTxt.addEventListener('click', () => {
    el.fileImportInput.value = '';
    el.fileImportInput.click();
  });

  el.fileImportInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const imported = parseNotesFromTxt(content, file.name);
      if (imported.length === 0) {
        showToast('الملف فارغ ولا يحتوي على ملاحظات');
        return;
      }

      const byId = new Map(notes.map((n) => [n.id, n]));
      let addedCount = 0;
      let updatedCount = 0;

      for (const item of imported) {
        const existing = byId.get(item.id);
        if (!existing) {
          notes.push(item);
          addedCount++;
        } else if (new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
          Object.assign(existing, item);
          updatedCount++;
        }
      }

      await persistNotesLocally();
      renderNotes();
      el.txtPreview.textContent = serializeNotesToTxt(notes);
      showToast(`تم الاستيراد: ${addedCount} جديدة، ${updatedCount} محدثة`);
    } catch {
      showToast('تعذر قراءة الملف');
    }
  });

  el.btnCopyTxtPreview.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el.txtPreview.textContent || '');
      showToast('تم نسخ نص النسخة الاحتياطية');
    } catch {
      showToast('تعذر النسخ');
    }
  });

  // Undo Toast
  el.toastUndoBtn.addEventListener('click', undoDelete);

  // Android Back Button / Browser History
  window.addEventListener('popstate', () => {
    if (!el.editorModal.classList.contains('hidden')) {
      closeEditor(false);
    } else if (!el.backupModal.classList.contains('hidden')) {
      closeBackupModal();
    }
  });

  // Escape key on desktop
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.editorModal.classList.contains('hidden')) closeEditor(true);
      if (!el.backupModal.classList.contains('hidden')) closeBackupModal();
    }
  });

  // Save OPFS when app goes to background on mobile
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persistNotesLocally();
    }
  });

  // PWA Install Banner
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    el.installBanner.classList.remove('hidden');
  });

  el.btnInstallPwa.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    el.installBanner.classList.add('hidden');
  });

  el.btnDismissInstall.addEventListener('click', () => {
    el.installBanner.classList.add('hidden');
  });
}

init();
