/**
 * KeepLite Storage & .txt Auto-Backup Engine
 * Handles IndexedDB persistence, OPFS silent .txt snapshots,
 * File System Access API (when supported), and Android-friendly .txt download/share/import.
 */

const DB_NAME = 'keeplite_db';
const DB_VERSION = 1;
const STORE_NOTES = 'notes';
const STORE_META = 'meta';
const LS_NOTES_KEY = 'keeplite_notes_v1';
const LS_SETTINGS_KEY = 'keeplite_settings_v1';
const OPFS_FILENAME = 'keep-notes-backup.txt';

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
    // Fallback handled by localStorage for serializable settings
  }
}

export async function loadNotes() {
  try {
    const db = await openDb();
    const notes = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readonly');
      const req = tx.objectStore(STORE_NOTES).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    if (notes.length > 0) return notes;
  } catch {
    // Fallback to localStorage
  }

  try {
    const raw = localStorage.getItem(LS_NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveAllNotes(notes) {
  try {
    localStorage.setItem(LS_NOTES_KEY, JSON.stringify(notes));
  } catch {
    // Ignore quota errors on localStorage fallback
  }

  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NOTES, 'readwrite');
      const store = tx.objectStore(STORE_NOTES);
      store.clear();
      for (const note of notes) {
        store.put(note);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // localStorage already updated
  }
}

export async function loadSettings() {
  const defaults = {
    autoBackup: true,
    filenameMode: 'fixed', // 'fixed' | 'dated'
    theme: 'light',
    viewMode: 'grid',
    lastBackupAt: null,
    lastBackupMethod: null
  };

  try {
    const saved = await idbGetMeta('settings');
    if (saved) return { ...defaults, ...saved };
  } catch {
    // fallback
  }

  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return defaults;
}

export async function saveSettings(settings) {
  try {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
  await idbSetMeta('settings', settings);
}

export function serializeNotesToTxt(notes) {
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
    const color = String(note.color || 'default');
    const pinned = Boolean(note.pinned);
    const updated = note.updatedAt || now.toISOString();
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

export function parseNotesFromTxt(rawText, fallbackTitle = 'ملاحظة مستوردة') {
  const text = rawText.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
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
    if (current.title || current.content) {
      parsed.push(current);
    }
    current = null;
    bodyLines = [];
  };

  for (const line of lines) {
    const match = line.match(NOTE_HEADER_RE);
    if (match) {
      flushCurrent();
      current = {
        id: match[1].trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        color: match[2].trim() || 'default',
        pinned: match[3].trim() === 'true',
        updatedAt: match[4].trim() || new Date().toISOString(),
        createdAt: match[4].trim() || new Date().toISOString(),
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

  // If the file wasn't in KeepLite format, import it as a single plain-text note
  if (parsed.length === 0 && text.trim()) {
    const now = new Date().toISOString();
    parsed.push({
      id: `${Date.now()}-import`,
      title: fallbackTitle.replace(/\.txt$/i, ''),
      content: text.trim(),
      color: 'default',
      pinned: false,
      createdAt: now,
      updatedAt: now
    });
  }

  return parsed;
}

export function getBackupFilename(mode = 'fixed') {
  if (mode === 'dated') {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `keep-notes-${yyyy}-${mm}-${dd}.txt`;
  }
  return 'keep-notes-backup.txt';
}

export async function writeOpfsBackup(txt) {
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

export function supportsFilePicker() {
  return typeof window.showSaveFilePicker === 'function';
}

export async function getLinkedFileHandle() {
  return await idbGetMeta('backupFileHandle');
}

export async function clearLinkedFileHandle() {
  await idbSetMeta('backupFileHandle', null);
}

export async function linkBackupFile(initialTxt) {
  if (!supportsFilePicker()) {
    throw new Error('المتصفح الحالي لا يدعم ربط الملف المباشر');
  }
  const handle = await window.showSaveFilePicker({
    suggestedName: 'keep-notes-backup.txt',
    types: [
      {
        description: 'Text Backup File',
        accept: { 'text/plain': ['.txt'] }
      }
    ]
  });
  await idbSetMeta('backupFileHandle', handle);
  const writable = await handle.createWritable();
  await writable.write(initialTxt);
  await writable.close();
  return handle;
}

export async function writeLinkedBackupFile(txt, allowRequestPermission = false) {
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

export function downloadTxtBackup(txt, filename = 'keep-notes-backup.txt') {
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
}

export function canShareTxtFile() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

export async function shareTxtBackup(txt, filename = 'keep-notes-backup.txt') {
  const file = new File([txt], filename, { type: 'text/plain;charset=utf-8' });
  await navigator.share({
    title: 'نسخة احتياطية لملاحظات KeepLite',
    text: 'ملف النسخ الاحتياطي للملاحظات بصيغة نصية (.txt)',
    files: [file]
  });
}
