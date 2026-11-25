/* KeepLite Storage & .txt Auto-Backup Engine */
'use strict';
(function (global) {
  const DB_NAME = 'keeplite_db';
  const DB_VERSION = 1;
  const STORE_NOTES = 'notes';
  const STORE_META = 'meta';
  const LS_NOTES_KEY = 'keeplite_notes_v1';
  const LS_SETTINGS_KEY = 'keeplite_settings_v1';
  const OPFS_FILENAME = 'keep-notes-backup.txt';

  const VALID_COLORS = new Set([
    'default', 'amber', 'ember', 'sand', 'olive',
    'sage', 'slate', 'plum', 'rose', 'stone'
  ]);

  // Legacy color map so older KeepLite .txt backups import cleanly
  const LEGACY_COLOR_MAP = {
    coral: 'ember',
    peach: 'amber',
    mint: 'sage',
    teal: 'sage',
    fog: 'slate',
    lavender: 'plum',
    blossom: 'rose',
    clay: 'stone'
  };

  const NOTE_HEADER_RE =
    /^--- NOTE \[id:\s*([^|\]]+)\s*\|\s*color:\s*([^|\]]+)\s*\|\s*pinned:\s*(true|false)\s*\|\s*updated:\s*([^\]]+)\]\s*---$/;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetMeta(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readonly');
        const req = tx.objectStore(STORE_META).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async function idbSetMeta(key, value) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readwrite');
        tx.objectStore(STORE_META).put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Fallback handled by localStorage
    }
  }

  function sanitizeColor(c) {
    const raw = String(c || 'default').trim().toLowerCase();
    if (VALID_COLORS.has(raw)) return raw;
    if (LEGACY_COLOR_MAP[raw]) return LEGACY_COLOR_MAP[raw];
    return 'default';
  }

  function sanitizeIso(v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  function sanitizeNote(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = typeof raw.title === 'string' ? raw.title.slice(0, 180) : '';
    const content = typeof raw.content === 'string' ? raw.content : '';
    if (!title.trim() && !content.trim()) return null;
    const id = String(raw.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).slice(0, 80);
    const updatedAt = sanitizeIso(raw.updatedAt);
    const createdAt = raw.createdAt ? sanitizeIso(raw.createdAt) : updatedAt;
    return {
      id,
      title,
      content,
      color: sanitizeColor(raw.color),
      pinned: Boolean(raw.pinned),
      createdAt,
      updatedAt
    };
  }

  async function loadNotes() {
    try {
      const db = await openDb();
      const notes = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NOTES, 'readonly');
        const req = tx.objectStore(STORE_NOTES).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      if (notes.length > 0) return notes.map(sanitizeNote).filter(Boolean);
    } catch {
      // Fallback to localStorage
    }

    try {
      const raw = localStorage.getItem(LS_NOTES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(sanitizeNote).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  async function saveAllNotes(notes) {
    try {
      localStorage.setItem(LS_NOTES_KEY, JSON.stringify(notes));
    } catch {
      // Ignore quota errors on localStorage mirror
    }

    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NOTES, 'readwrite');
        const store = tx.objectStore(STORE_NOTES);
        store.clear();
        for (const note of notes) store.put(note);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Mirror already saved
    }
  }

  async function loadSettings() {
    const defaults = {
      autoBackup: true,
      filenameMode: 'fixed',
      theme: 'iron',
      viewMode: 'grid',
      sfx: true,
      lastBackupAt: null,
      lastBackupMethod: null
    };

    try {
      const saved = await idbGetMeta('settings');
      if (saved && typeof saved === 'object') return { ...defaults, ...saved };
    } catch {
      // Fallback
    }

    try {
      const raw = localStorage.getItem(LS_SETTINGS_KEY);
      if (raw) return { ...defaults, ...JSON.parse(raw) };
    } catch {
      // Ignore
    }
    return defaults;
  }

  async function saveSettings(settings) {
    try {
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }
    await idbSetMeta('settings', settings);
  }

  function serializeNotesToTxt(notes) {
    const now = new Date();
    const ordered = [...notes].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const lines = [
      '========================================',
      'KeepLite Notes Backup',
      `Updated: ${now.toLocaleString('en-GB', { hour12: false })}`,
      `Total Notes: ${ordered.length}`,
      '========================================',
      ''
    ];

    for (const note of ordered) {
      const id = String(note.id || Date.now());
      const color = sanitizeColor(note.color);
      const pinned = Boolean(note.pinned);
      const updated = sanitizeIso(note.updatedAt);
      lines.push(
        `--- NOTE [id: ${id} | color: ${color} | pinned: ${pinned} | updated: ${updated}] ---`
      );
      if (note.title && note.title.trim()) {
        lines.push(`Title: ${note.title.trim()}`);
      }
      if (note.content) {
        lines.push(note.content);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  function parseNotesFromTxt(rawText, fallbackTitle = 'ملاحظة مستوردة') {
    const text = String(rawText || '').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
    const lines = text.split('\n');
    const parsed = [];
    let current = null;
    let bodyLines = [];

    const flushCurrent = () => {
      if (!current) return;
      while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '') {
        bodyLines.pop();
      }
      current.content = bodyLines.join('\n');
      const clean = sanitizeNote(current);
      if (clean) parsed.push(clean);
      current = null;
      bodyLines = [];
    };

    for (const line of lines) {
      const match = line.match(NOTE_HEADER_RE);
      if (match) {
        flushCurrent();
        const ts = sanitizeIso(match[4].trim());
        current = {
          id: match[1].trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          color: sanitizeColor(match[2]),
          pinned: match[3].trim() === 'true',
          updatedAt: ts,
          createdAt: ts,
          title: '',
          content: ''
        };
        continue;
      }

      if (current) {
        if (!current.title && bodyLines.length === 0 && line.startsWith('Title: ')) {
          current.title = line.slice(7).trim();
        } else {
          bodyLines.push(line);
        }
      }
    }
    flushCurrent();

    if (parsed.length === 0 && text.trim()) {
      const now = new Date().toISOString();
      const single = sanitizeNote({
        id: `${Date.now()}-import`,
        title: String(fallbackTitle).replace(/\.txt$/i, ''),
        content: text.trim(),
        color: 'default',
        pinned: false,
        createdAt: now,
        updatedAt: now
      });
      if (single) parsed.push(single);
    }

    return parsed;
  }

  function getBackupFilename(mode = 'fixed') {
    if (mode === 'dated') {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `keep-notes-${yyyy}-${mm}-${dd}.txt`;
    }
    return 'keep-notes-backup.txt';
  }

  async function writeOpfsBackup(txt) {
    try {
      if (!navigator.storage || !navigator.storage.getDirectory) return false;
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(OPFS_FILENAME, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(txt);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  }

  function hasAndroidBridge() {
    return Boolean(window.Android && typeof window.Android.linkFile === 'function');
  }

  function androidLinkedName() {
    try {
      if (window.Android && typeof window.Android.linkedName === 'function') {
        return window.Android.linkedName() || '';
      }
    } catch {
      // ignore
    }
    return '';
  }

  function supportsFilePicker() {
    return typeof window.showSaveFilePicker === 'function';
  }

  async function getLinkedFileHandle() {
    return await idbGetMeta('backupFileHandle');
  }

  async function clearLinkedFileHandle() {
    await idbSetMeta('backupFileHandle', null);
  }

  async function linkBackupFile(initialTxt) {
    if (!supportsFilePicker()) {
      throw new Error('File System Access API not supported');
    }
    const handle = await window.showSaveFilePicker({
      suggestedName: 'keep-notes-backup.txt',
      types: [{ description: 'Text Backup File', accept: { 'text/plain': ['.txt'] } }]
    });
    await idbSetMeta('backupFileHandle', handle);
    const writable = await handle.createWritable();
    await writable.write(initialTxt);
    await writable.close();
    return handle;
  }

  async function writeLinkedBackupFile(txt, allowRequestPermission = false) {
    const handle = await getLinkedFileHandle();
    if (!handle) return { ok: false, reason: 'no-handle' };

    try {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted' && allowRequestPermission) {
        perm = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (perm !== 'granted') {
        return { ok: false, reason: 'permission-needed', name: handle.name };
      }
      const writable = await handle.createWritable();
      await writable.write(txt);
      await writable.close();
      return { ok: true, name: handle.name };
    } catch {
      return { ok: false, reason: 'write-failed', name: handle.name };
    }
  }

  function downloadTxtBackup(txt, filename = 'keep-notes-backup.txt') {
    if (window.Android && typeof window.Android.saveFile === 'function') {
      try {
        window.Android.saveFile(filename, 'text/plain', txt);
        return 'android-saf';
      } catch {
        // Fallback below
      }
    }
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
    return 'download';
  }

  function canShareTxtFile() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
      return navigator.canShare({ files: [testFile] });
    } catch {
      return false;
    }
  }

  async function shareTxtBackup(txt, filename = 'keep-notes-backup.txt') {
    const file = new File([txt], filename, { type: 'text/plain;charset=utf-8' });
    await navigator.share({
      title: 'نسخة احتياطية لمفكرة KeepLite',
      text: 'ملف النسخ الاحتياطي للملاحظات بصيغة نصية (.txt)',
      files: [file]
    });
  }

  global.KeepBackup = {
    VALID_COLORS,
    loadNotes,
    saveAllNotes,
    loadSettings,
    saveSettings,
    serializeNotesToTxt,
    parseNotesFromTxt,
    getBackupFilename,
    writeOpfsBackup,
    hasAndroidBridge,
    androidLinkedName,
    supportsFilePicker,
    getLinkedFileHandle,
    clearLinkedFileHandle,
    linkBackupFile,
    writeLinkedBackupFile,
    downloadTxtBackup,
    canShareTxtFile,
    shareTxtBackup
  };
})(window);
