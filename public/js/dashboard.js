const API = '/api';
let currentFolder = 'root';
let currentPage = 1;
let currentSort = '-created_at';
let selectedItems = new Set();
let _busy = false;
let _recycleView = false;
let _statsSeq = 0;

const $ = id => document.getElementById(id);
const fileGrid = $('fileGrid');
const emptyState = $('emptyState');
const folderTree = $('folderTree');
const breadcrumb = $('breadcrumb');
const storageUsed = $('storageUsed');
const storageTotal = $('storageTotal');
const storageFill = $('storageFill');
const pagination = $('pagination');
const pageInfo = $('pageInfo');
const prevPage = $('prevPage');
const nextPage = $('nextPage');
const backendSelect = $('backendSelect');
const moveSelectedBtn = $('moveSelectedBtn');
const downloadSelectedBtn = $('downloadSelectedBtn');
const deleteSelectedBtn = $('deleteSelectedBtn');
const toolbar = $('toolbar');
const selectionCount = $('selectionCount');
const selectedCount = $('selectedCount');
const recycleBinBtn = $('recycleBinBtn');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
}

function getFileIcon(m) {
  if (m.startsWith('image/')) return 'fa-file-image';
  if (m.startsWith('video/')) return 'fa-file-video';
  if (m.startsWith('audio/')) return 'fa-file-audio';
  if (m === 'application/pdf') return 'fa-file-pdf';
  if (m.includes('word')) return 'fa-file-word';
  if (m.includes('excel') || m.includes('spreadsheet')) return 'fa-file-excel';
  if (m.includes('powerpoint') || m.includes('presentation')) return 'fa-file-powerpoint';
  if (m.includes('zip') || m.includes('rar') || m.includes('tar') || m.includes('gzip') || m.includes('7z')) return 'fa-file-archive';
  if (m.includes('json') || m.includes('javascript') || m.includes('typescript') || m.includes('xml') || m.includes('html') || m.includes('css')) return 'fa-file-code';
  return 'fa-file';
}

function timeRemaining(deletedAt) {
  const ms = new Date(deletedAt).getTime() + 2 * 24 * 60 * 60 * 1000 - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m remaining`;
}

async function api(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.errors?.[0]?.msg || 'Request failed');
  return data;
}

async function loadStorageStats() {
  const seq = ++_statsSeq;
  try {
    const { stats } = await api('/files/stats');
    if (seq !== _statsSeq) return;
    const backend = backendSelect?.value || 'supabase';
    const info = stats[backend];
    if (info) {
      const pct = (info.used / info.limit) * 100;
      storageUsed.textContent = formatBytes(info.used);
      storageTotal.textContent = formatBytes(info.limit);
      storageFill.style.width = `${Math.min(pct, 100)}%`;
      storageFill.className = `fill ${backend}`;
      if (pct > 90) storageFill.style.background = 'var(--danger)';
      else if (pct > 70) storageFill.style.background = 'var(--warning)';
    }
  } catch {}
}

async function reloadAll() {
  await Promise.all([loadFiles(), loadFolders(), loadUser()]);
  if (currentFolder !== 'root') await updateBreadcrumb();
  else breadcrumb.innerHTML = '';
}

async function loadUser() {
  try {
    const { user } = await api('/auth/me');
    await loadStorageStats();
  } catch { window.location.href = '/login'; }
}

async function loadFolders() {
  try {
    const { folders } = await api('/folders');
    renderFolders(folders);
  } catch {}
}

function renderFolders(folders) {
  const rootItem = folderTree.querySelector('[data-folder-id="root"]');
  folderTree.innerHTML = '';
  if (rootItem) folderTree.appendChild(rootItem);
  folders.forEach(f => {
    const li = document.createElement('li');
    li.className = 'folder-item';
    li.dataset.folderId = f.id;
    if (f.id === currentFolder) li.classList.add('active');
    li.innerHTML = `<div class="folder-item-content"><i class="fas fa-folder"></i> <span>${esc(f.name)}</span></div>`;
    li.addEventListener('click', e => { e.stopPropagation(); selectFolder(f.id); });
    li.addEventListener('contextmenu', e => showFolderContextMenu(e, f.id, f.name));
    folderTree.appendChild(li);
  });
}

async function selectFolder(folderId) {
  _recycleView = false;
  currentFolder = folderId;
  currentPage = 1;
  document.querySelectorAll('.folder-item').forEach(el => el.classList.toggle('active', el.dataset.folderId === folderId));
  recycleBinBtn?.classList.remove('active');
  closeSidebar();
  emptyState.querySelector('h3').textContent = 'This folder is empty';
  emptyState.querySelector('p').textContent = 'Drop files here or click Upload';
  $('emptyUploadBtn').classList.remove('hidden');
  await reloadAll();
}

async function updateBreadcrumb() {
  if (currentFolder === 'root') { breadcrumb.innerHTML = ''; return; }
  try {
    const { folder } = await api(`/folders/${currentFolder}`);
    breadcrumb.innerHTML = `<a href="#" data-folder="${folder.id}">${esc(folder.name)}</a>`;
    breadcrumb.querySelector('a')?.addEventListener('click', e => { e.preventDefault(); selectFolder(folder.id); });
  } catch { breadcrumb.innerHTML = ''; }
}

async function loadFiles() {
  try {
    showLoading();
    const params = new URLSearchParams({ page: currentPage, limit: 50, sort: currentSort });
    if (currentFolder !== 'root') params.append('folderId', currentFolder);
    const { files, pagination: pag } = await api(`/files?${params}`);
    renderFiles(files);
    renderPagination(pag);
  } catch { showError('Failed to load files'); }
}

function showLoading() { fileGrid.innerHTML = '<div class="loading">Loading</div>'; }

function renderFiles(files) {
  if (files.length === 0) { fileGrid.innerHTML = ''; emptyState.classList.remove('hidden'); return; }
  emptyState.classList.add('hidden');
  fileGrid.innerHTML = files.map(f => {
    const sb = f.path === null ? '<span class="status-badge processing">Processing</span>' : f.path === 'failed' ? '<span class="status-badge failed">Failed</span>' : '';
    if (_recycleView) {
      const expires = timeRemaining(f.deleted_at);
      return `<div class="file-item recycle-item${selectedItems.has(f.id)?' selected':''}" data-id="${f.id}" data-type="file">
        <input type="checkbox" class="file-checkbox" ${selectedItems.has(f.id)?'checked':''}>
        <i class="file-icon fas ${getFileIcon(f.mime_type)}"></i>
        <div class="file-name" title="${esc(f.original_name)}">${esc(f.original_name)}</div>
        <div class="file-meta"><span class="expiry-badge ${expires==='Expired'?'expired':''}">${expires}</span></div>
      </div>`;
    }
    return `<div class="file-item${selectedItems.has(f.id)?' selected':''}${!f.path||f.path==='failed'?' disabled':''}" data-id="${f.id}" data-type="file">
      <input type="checkbox" class="file-checkbox" ${selectedItems.has(f.id)?'checked':''}>
      <i class="file-icon fas ${getFileIcon(f.mime_type)}"></i>
      <div class="file-name" title="${esc(f.original_name)}">${esc(f.original_name)}</div>
      <div class="file-meta">${formatBytes(f.size)} ${sb} <span class="storage-badge ${f.storage_backend||'supabase'}">${(f.storage_backend||'supabase')==='supabase'?'Supabase':'B2'}</span></div>
    </div>`;
  }).join('');
  fileGrid.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.type === 'checkbox') return;
      const id = item.dataset.id;
      if (e.ctrlKey || e.metaKey) { toggleSelection(id, item); }
      else if (e.shiftKey && selectedItems.size > 0) { selectRange(id); }
      else { clearSelection(); toggleSelection(id, item); }
    });
    item.querySelector('.file-checkbox').addEventListener('change', e => { e.stopPropagation(); toggleSelection(item.dataset.id, item); });
    if (_recycleView) {
      item.addEventListener('contextmenu', e => showRecycleContextMenu(e, item.dataset.id));
    } else {
      item.addEventListener('dblclick', () => downloadFile(item.dataset.id));
      item.addEventListener('contextmenu', e => showContextMenu(e, item.dataset.id));
    }
  });
}

function toggleSelection(id, item) {
  if (selectedItems.has(id)) { selectedItems.delete(id); item.classList.remove('selected'); item.querySelector('.file-checkbox').checked = false; }
  else { selectedItems.add(id); item.classList.add('selected'); item.querySelector('.file-checkbox').checked = true; }
  updateSelectionUI();
}

function clearSelection() {
  selectedItems.forEach(id => { const el = fileGrid.querySelector(`[data-id="${id}"]`); if (el) { el.classList.remove('selected'); el.querySelector('.file-checkbox').checked = false; } });
  selectedItems.clear();
  updateSelectionUI();
}

function selectRange(lastId) {
  const items = Array.from(fileGrid.querySelectorAll('.file-item'));
  const firstIdx = items.findIndex(i => selectedItems.has(i.dataset.id));
  const lastIdx = items.findIndex(i => i.dataset.id === lastId);
  if (firstIdx === -1 || lastIdx === -1) return;
  const [s, e] = firstIdx < lastIdx ? [firstIdx, lastIdx] : [lastIdx, firstIdx];
  for (let i = s; i <= e; i++) { selectedItems.add(items[i].dataset.id); items[i].classList.add('selected'); items[i].querySelector('.file-checkbox').checked = true; }
  updateSelectionUI();
}

function updateSelectionUI() {
  const n = selectedItems.size;
  if (_recycleView) {
    downloadSelectedBtn.disabled = true;
    deleteSelectedBtn.textContent = 'Delete Forever';
    deleteSelectedBtn.disabled = n === 0;
    moveSelectedBtn.textContent = 'Restore';
    moveSelectedBtn.disabled = n === 0;
  } else {
    downloadSelectedBtn.disabled = n === 0;
    deleteSelectedBtn.textContent = 'Delete';
    deleteSelectedBtn.disabled = n === 0;
    moveSelectedBtn.textContent = 'Move';
    moveSelectedBtn.disabled = n === 0;
  }
}

function downloadFile(id) { window.location.href = `${API}/files/${id}/download`; }

async function downloadSelected() {
  if (_busy) return;
  if (_recycleView) return;
  _busy = true;
  downloadSelectedBtn.disabled = true;
  for (const id of selectedItems) { window.open(`${API}/files/${id}/download`); await new Promise(r => setTimeout(r, 100)); }
  _busy = false;
}

async function deleteSelected() {
  if (_busy) return;
  if (_recycleView) {
    if (!confirm(`Permanently delete ${selectedItems.size} item(s)?`)) return;
    _busy = true;
    deleteSelectedBtn.disabled = true;
    try {
      await Promise.all(Array.from(selectedItems).map(id => api(`/files/${id}/forever`, { method: 'DELETE' })));
      clearSelection();
      showRecycleBin();
    } catch (e) { alert('Delete failed: ' + e.message); }
    _busy = false;
    return;
  }
  if (!confirm(`Delete ${selectedItems.size} item(s)? They will go to Recycle Bin.`)) return;
  _busy = true;
  deleteSelectedBtn.disabled = true;
  try {
    await Promise.all(Array.from(selectedItems).map(id => api(`/files/${id}`, { method: 'DELETE' })));
    clearSelection();
    reloadAll();
  } catch (e) { alert('Delete failed: ' + e.message); }
  _busy = false;
}

async function restoreSelected() {
  if (_busy || !_recycleView) return;
  _busy = true;
  moveSelectedBtn.disabled = true;
  try {
    await Promise.all(Array.from(selectedItems).map(id => api(`/files/${id}/restore`, { method: 'POST' })));
    clearSelection();
    showRecycleBin();
  } catch (e) { alert('Restore failed: ' + e.message); }
  _busy = false;
}

function renderPagination(pag) {
  if (pag.pages <= 1) { pagination.classList.add('hidden'); return; }
  pagination.classList.remove('hidden');
  pageInfo.textContent = `Page ${pag.page} of ${pag.pages}`;
  prevPage.disabled = pag.page <= 1;
  nextPage.disabled = pag.page >= pag.pages;
}

// --- Recycle Bin ---
async function showRecycleBin() {
  if (_busy) return;
  _recycleView = true;
  currentFolder = 'root';
  currentPage = 1;
  clearSelection();
  document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active'));
  recycleBinBtn?.classList.add('active');
  closeSidebar();
  breadcrumb.innerHTML = '';
  pagination.classList.add('hidden');
  try {
    showLoading();
    const { files } = await api('/files/recycle');
    emptyState.querySelector('h3').textContent = 'Recycle Bin is empty';
    emptyState.querySelector('p').textContent = 'Deleted files appear here for 2 days';
    $('emptyUploadBtn').classList.add('hidden');
    renderFiles(files);
  } catch { showError('Failed to load recycle bin'); }
}

recycleBinBtn?.addEventListener('click', showRecycleBin);

function showRecycleContextMenu(e, id) {
  e.preventDefault();
  document.querySelector('.context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${e.pageX}px`; menu.style.top = `${e.pageY}px`;
  menu.innerHTML = `<button class="context-menu-item" data-action="restore"><i class="fas fa-undo"></i> Restore</button>
    <button class="context-menu-item danger" data-action="delete"><i class="fas fa-trash"></i> Delete Forever</button>`;
  document.body.appendChild(menu);
  menu.querySelectorAll('.context-menu-item').forEach(btn => {
    btn.addEventListener('click', () => { menu.remove(); const a = btn.dataset.action; if (a === 'restore') restoreFile(id); else if (a === 'delete') permanentDeleteFile(id); });
  });
  document.addEventListener('click', function cm() { menu.remove(); document.removeEventListener('click', cm); }, { once: true });
}

async function restoreFile(id) {
  if (_busy) return;
  _busy = true;
  try { await api(`/files/${id}/restore`, { method: 'POST' }); showRecycleBin(); } catch (e) { showError(e.message); }
  _busy = false;
}

async function permanentDeleteFile(id) {
  if (_busy) return;
  if (!confirm('Permanently delete this file?')) return;
  _busy = true;
  try { await api(`/files/${id}/forever`, { method: 'DELETE' }); showRecycleBin(); } catch (e) { showError(e.message); }
  _busy = false;
}

// --- Upload ---
async function uploadFiles(files) {
  const container = $('uploadProgress') || createUploadContainer();
  for (const file of files) {
    const isB2 = backendSelect.value === 'b2';
    if (isB2 && file.size > 50 * 1024 * 1024) await uploadChunked(file, container);
    else await uploadSingle(file, container);
  }
}

async function uploadSingle(file, container) {
  const fd = new FormData();
  fd.append('files', file);
  if (currentFolder !== 'root') fd.append('folderId', currentFolder);
  fd.append('storageBackend', backendSelect.value);
  const item = createUploadItem(file.name);
  container.appendChild(item);
  const prog = item.querySelector('.upload-fill');
  const st = item.querySelector('.upload-status');
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/files/upload`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = e => { if (e.lengthComputable) prog.style.width = `${(e.loaded / e.total) * 100}%`; };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        prog.style.width = '100%'; st.textContent = 'Complete'; item.classList.add('complete');
        setTimeout(() => { item.remove(); if (!container.children.length) container.remove(); }, 2000);
        reloadAll();
      } else {
        let msg = 'Failed';
        try { const err = JSON.parse(xhr.responseText); msg = err.error || msg; } catch {}
        st.textContent = msg; item.classList.add('error');
        setTimeout(() => { item.remove(); if (!container.children.length) container.remove(); }, 5000);
      }
    };
    xhr.onerror = () => { st.textContent = 'Error'; item.classList.add('error'); };
    xhr.send(fd);
  } catch { st.textContent = 'Error'; item.classList.add('error'); }
}

async function uploadChunked(file, container) {
  const CHUNK_SIZE = 10 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const item = createUploadItem(file.name);
  container.appendChild(item);
  const prog = item.querySelector('.upload-fill');
  const st = item.querySelector('.upload-status');
  try {
    st.textContent = 'Initializing...';
    const initRes = await fetch(`${API}/chunk/init`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, totalChunks, folderId: currentFolder === 'root' ? null : currentFolder, storageBackend: 'b2' }) });
    const initData = await initRes.json();
    if (!initRes.ok) throw new Error(initData.error || 'Init failed');
    const { uploadId } = initData;
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
      st.textContent = `Uploading chunk ${i + 1}/${totalChunks}`;
      const fd = new FormData(); fd.append('chunk', chunk);
      const r = await fetch(`${API}/chunk/upload/${uploadId}/${i}`, { method: 'POST', credentials: 'include', body: fd });
      if (!r.ok) { const ed = await r.json().catch(() => ({})); throw new Error(ed.error || `Chunk ${i+1} failed`); }
      prog.style.width = `${((i + 1) / totalChunks) * 90}%`;
    }
    st.textContent = 'Finalizing...';
    const finRes = await fetch(`${API}/chunk/finalize/${uploadId}`, { method: 'POST', credentials: 'include' });
    if (!finRes.ok) { const ed = await finRes.json().catch(() => ({})); throw new Error(ed.error || 'Finalize failed'); }
    prog.style.width = '100%'; st.textContent = 'Complete'; item.classList.add('complete');
    setTimeout(() => { item.remove(); if (!container.children.length) container.remove(); }, 2000);
    reloadAll();
  } catch (e) {
    st.textContent = e.message; item.classList.add('error');
    setTimeout(() => { item.remove(); if (!container.children.length) container.remove(); }, 8000);
  }
}

function createUploadContainer() {
  const div = document.createElement('div');
  div.id = 'uploadProgress'; div.className = 'upload-progress';
  document.body.appendChild(div);
  return div;
}

function createUploadItem(name) {
  const div = document.createElement('div');
  div.className = 'upload-item';
  div.innerHTML = `<div class="upload-info"><div class="upload-name">${esc(name)}</div><div class="upload-bar"><div class="upload-fill"></div></div></div><div class="upload-status">Uploading...</div>`;
  return div;
}

function esc(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function showError(msg) { alert(msg); }

// --- Context Menus ---
function showContextMenu(e, id) {
  e.preventDefault();
  document.querySelector('.context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${e.pageX}px`; menu.style.top = `${e.pageY}px`;
  menu.innerHTML = `<button class="context-menu-item" data-action="download"><i class="fas fa-download"></i> Download</button>
    <button class="context-menu-item" data-action="rename"><i class="fas fa-edit"></i> Rename</button>
    <button class="context-menu-item" data-action="move"><i class="fas fa-folder-open"></i> Move to Folder</button>
    <button class="context-menu-item danger" data-action="delete"><i class="fas fa-trash"></i> Delete</button>`;
  document.body.appendChild(menu);
  menu.querySelectorAll('.context-menu-item').forEach(btn => {
    btn.addEventListener('click', () => { menu.remove(); const a = btn.dataset.action; if (a === 'download') downloadFile(id); else if (a === 'rename') showRenameModal(id, 'file'); else if (a === 'move') showMoveModal([id]); else if (a === 'delete') deleteFile(id); });
  });
  document.addEventListener('click', function cm() { menu.remove(); document.removeEventListener('click', cm); }, { once: true });
}

function showFolderContextMenu(e, id, name) {
  e.preventDefault();
  document.querySelector('.context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${e.pageX}px`; menu.style.top = `${e.pageY}px`;
  menu.innerHTML = `<button class="context-menu-item" data-action="rename"><i class="fas fa-edit"></i> Rename</button>
    <button class="context-menu-item danger" data-action="delete"><i class="fas fa-trash"></i> Delete</button>`;
  document.body.appendChild(menu);
  menu.querySelectorAll('.context-menu-item').forEach(btn => {
    btn.addEventListener('click', () => { menu.remove(); const a = btn.dataset.action; if (a === 'rename') showRenameModal(id, 'folder'); else if (a === 'delete') showDeleteFolderModal(id, name); });
  });
  document.addEventListener('click', function cm() { menu.remove(); document.removeEventListener('click', cm); }, { once: true });
}

// --- Move to Folder ---
const moveModal = $('moveModal');
const moveModalDesc = $('moveModalDesc');
const moveFolderList = $('moveFolderList');
const cancelMoveBtn = $('cancelMoveBtn');
const moveToRootBtn = $('moveToRootBtn');
const confirmMoveBtn = $('confirmMoveBtn');
let moveTargetIds = [];
let moveSelectedFolderId = null;

async function showMoveModal(fileIds) {
  moveTargetIds = fileIds;
  moveSelectedFolderId = null;
  confirmMoveBtn.disabled = true;
  const label = fileIds.length === 1 ? '1 file' : `${fileIds.length} files`;
  moveModalDesc.textContent = `Move ${label} to:`;
  moveFolderList.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:13px;">Loading...</div>';
  moveModal.classList.remove('hidden');
  try {
    const { folders } = await api('/folders');
    moveFolderList.innerHTML = '';
    if (folders.length === 0) { moveFolderList.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:13px;">No folders yet</div>'; return; }
    folders.forEach(f => {
      const div = document.createElement('div');
      div.className = 'context-menu-item';
      div.textContent = f.name;
      div.dataset.folderId = f.id;
      div.addEventListener('click', () => {
        moveFolderList.querySelectorAll('.context-menu-item').forEach(el => el.style.background = '');
        div.style.background = 'var(--primary-glow)';
        moveSelectedFolderId = f.id;
        confirmMoveBtn.disabled = false;
      });
      moveFolderList.appendChild(div);
    });
  } catch { moveFolderList.innerHTML = '<div style="padding:8px;color:var(--danger);font-size:13px;">Failed to load folders</div>'; }
}

async function executeMove(folderId) {
  if (_busy) return;
  _busy = true;
  confirmMoveBtn.disabled = true; moveToRootBtn.disabled = true;
  try {
    await Promise.all(moveTargetIds.map(id => api(`/files/${id}/move`, { method: 'PUT', body: JSON.stringify({ folderId }) })));
    moveModal.classList.add('hidden');
    clearSelection();
    reloadAll();
  } catch (e) { showError(e.message); }
  _busy = false;
  confirmMoveBtn.disabled = false; moveToRootBtn.disabled = false;
}

cancelMoveBtn.addEventListener('click', () => moveModal.classList.add('hidden'));
moveModal.querySelector('.modal-overlay')?.addEventListener('click', () => moveModal.classList.add('hidden'));
moveToRootBtn.addEventListener('click', () => executeMove(null));
confirmMoveBtn.addEventListener('click', () => { if (moveSelectedFolderId) executeMove(moveSelectedFolderId); });

moveSelectedBtn.addEventListener('click', () => {
  if (_recycleView) { restoreSelected(); return; }
  if (selectedItems.size === 0) return;
  showMoveModal(Array.from(selectedItems));
});

// --- Delete Folder Modal ---
const deleteFolderModal = $('deleteFolderModal');
const deleteFolderName = $('deleteFolderName');
const deleteFolderId = $('deleteFolderId');
const deleteFolderMoveBtn = $('deleteFolderMoveBtn');
const deleteFolderDeleteBtn = $('deleteFolderDeleteBtn');
const cancelDeleteFolderBtn = $('cancelDeleteFolderBtn');

function showDeleteFolderModal(id, name) {
  deleteFolderId.value = id;
  deleteFolderName.textContent = name;
  deleteFolderModal.classList.remove('hidden');
}

cancelDeleteFolderBtn.addEventListener('click', () => deleteFolderModal.classList.add('hidden'));
deleteFolderModal.querySelector('.modal-overlay')?.addEventListener('click', () => deleteFolderModal.classList.add('hidden'));

async function deleteFolderAction(mode) {
  if (_busy) return;
  const id = deleteFolderId.value;
  if (!id) return;
  _busy = true;
  deleteFolderMoveBtn.disabled = true; deleteFolderDeleteBtn.disabled = true;
  try {
    await api(`/folders/${id}`, { method: 'DELETE', body: JSON.stringify({ mode }) });
    deleteFolderModal.classList.add('hidden');
    if (currentFolder === id) currentFolder = 'root';
    currentPage = 1;
    await reloadAll();
  } catch (err) { showError(err.message); }
  _busy = false;
  deleteFolderMoveBtn.disabled = false; deleteFolderDeleteBtn.disabled = false;
}

deleteFolderMoveBtn.addEventListener('click', () => deleteFolderAction('move'));
deleteFolderDeleteBtn.addEventListener('click', () => deleteFolderAction('delete'));

// --- Modals ---
const folderModal = $('folderModal');
const folderForm = $('folderForm');
const folderName = $('folderName');
const newFolderBtn = $('newFolderBtn');
const cancelFolderBtn = $('cancelFolderBtn');

newFolderBtn.addEventListener('click', () => { folderForm.reset(); folderModal.classList.remove('hidden'); });
cancelFolderBtn.addEventListener('click', () => folderModal.classList.add('hidden'));
folderModal.querySelector('.modal-overlay')?.addEventListener('click', () => folderModal.classList.add('hidden'));

folderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (_busy) return;
  _busy = true;
  folderForm.querySelector('button[type="submit"]').disabled = true;
  try {
    await api('/folders', { method: 'POST', body: JSON.stringify({ name: folderName.value }) });
    folderModal.classList.add('hidden');
    loadFolders();
  } catch (err) { showError(err.message); }
  _busy = false;
  folderForm.querySelector('button[type="submit"]').disabled = false;
});

const renameModal = $('renameModal');
const renameForm = $('renameForm');
const renameName = $('renameName');
const renameId = $('renameId');
const renameType = $('renameType');
const cancelRenameBtn = $('cancelRenameBtn');

function showRenameModal(id, type) {
  renameId.value = id;
  renameType.value = type;
  const item = document.querySelector(`[data-id="${id}"]`);
  if (item) { const ne = item.querySelector('.file-name'); renameName.value = ne ? ne.textContent : ''; }
  renameModal.classList.remove('hidden');
  renameName.focus();
}

cancelRenameBtn.addEventListener('click', () => renameModal.classList.add('hidden'));
renameModal.querySelector('.modal-overlay')?.addEventListener('click', () => renameModal.classList.add('hidden'));

renameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (_busy) return;
  _busy = true;
  renameForm.querySelector('button[type="submit"]').disabled = true;
  try {
    if (renameType.value === 'file') {
      await api(`/files/${renameId.value}`, { method: 'PUT', body: JSON.stringify({ originalName: renameName.value }) });
    } else {
      await api(`/folders/${renameId.value}`, { method: 'PUT', body: JSON.stringify({ name: renameName.value }) });
      loadFolders();
    }
    renameModal.classList.add('hidden');
    loadFiles();
  } catch (err) { showError(err.message); }
  _busy = false;
  renameForm.querySelector('button[type="submit"]').disabled = false;
});

async function deleteFile(id) {
  if (_busy) return;
  if (!confirm('Delete this file? It will go to Recycle Bin.')) return;
  _busy = true;
  try { await api(`/files/${id}`, { method: 'DELETE' }); reloadAll(); } catch (err) { showError(err.message); }
  _busy = false;
}

// --- User modals ---
const usernameModal = $('usernameModal');
const usernameForm = $('usernameForm');
const newUsername = $('newUsername');
const changeUsernameBtn = $('changeUsernameBtn');
const cancelUsernameBtn = $('cancelUsernameBtn');

changeUsernameBtn.addEventListener('click', () => { usernameForm.reset(); usernameModal.classList.remove('hidden'); });
cancelUsernameBtn.addEventListener('click', () => usernameModal.classList.add('hidden'));
usernameModal.querySelector('.modal-overlay')?.addEventListener('click', () => usernameModal.classList.add('hidden'));
usernameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (_busy) return;
  _busy = true;
  usernameForm.querySelector('button[type="submit"]').disabled = true;
  try { await api('/auth/username', { method: 'PUT', body: JSON.stringify({ username: newUsername.value }) }); usernameModal.classList.add('hidden'); loadUser(); showError('Username changed'); } catch (err) { showError(err.message); }
  _busy = false;
  usernameForm.querySelector('button[type="submit"]').disabled = false;
});

const passwordModal = $('passwordModal');
const passwordForm = $('passwordForm');
const cp = $('currentPassword');
const np = $('newPassword');
const cnp = $('confirmNewPassword');
const changePasswordBtn = $('changePasswordBtn');
const cancelPasswordBtn = $('cancelPasswordBtn');

changePasswordBtn.addEventListener('click', () => { passwordForm.reset(); passwordModal.classList.remove('hidden'); });
cancelPasswordBtn.addEventListener('click', () => passwordModal.classList.add('hidden'));
passwordModal.querySelector('.modal-overlay')?.addEventListener('click', () => passwordModal.classList.add('hidden'));
passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (_busy) return;
  if (np.value !== cnp.value) return showError('Passwords do not match');
  _busy = true;
  passwordForm.querySelector('button[type="submit"]').disabled = true;
  try { await api('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword: cp.value, newPassword: np.value }) }); passwordModal.classList.add('hidden'); showError('Password changed'); } catch (err) { showError(err.message); }
  _busy = false;
  passwordForm.querySelector('button[type="submit"]').disabled = false;
});

// --- Event Listeners ---
$('emptyUploadBtn').addEventListener('click', () => $('fileInput').click());
$('uploadBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', e => { if (e.target.files.length) { uploadFiles(Array.from(e.target.files)); e.target.value = ''; } });
$('sortSelect').addEventListener('change', e => { currentSort = e.target.value; currentPage = 1; loadFiles(); });
$('searchInput').addEventListener('input', debounce(async (e) => {
  const q = e.target.value.trim();
  if (!q) return loadFiles();
  try { const params = new URLSearchParams({ q: encodeURIComponent(q) }); if (currentFolder !== 'root') params.append('folderId', currentFolder); const { files } = await api(`/files/search?${params}`); renderFiles(files); pagination.classList.add('hidden'); } catch {}
}, 300));
prevPage.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadFiles(); } });
nextPage.addEventListener('click', () => { currentPage++; loadFiles(); });
downloadSelectedBtn.addEventListener('click', downloadSelected);
deleteSelectedBtn.addEventListener('click', deleteSelected);

$('logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); window.location.href = '/login'; });

$('themeToggle').addEventListener('click', () => {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  $('themeToggle').innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
});

$('userMenuBtn').addEventListener('click', e => {
  e.stopPropagation();
  $('userMenuBtn').classList.toggle('active');
  $('userDropdown').classList.toggle('hidden');
});
document.addEventListener('click', e => { if (!e.target.closest('.user-menu')) { $('userMenuBtn').classList.remove('active'); $('userDropdown').classList.add('hidden'); } });

document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden')));

backendSelect?.addEventListener('change', loadStorageStats);

document.querySelector('#folderTree > .folder-item[data-folder-id="root"]')?.addEventListener('click', () => selectFolder('root'));

$('homeBtn')?.addEventListener('click', () => { selectFolder('root'); document.querySelectorAll('.folder-item').forEach(el => el.classList.toggle('active', el.dataset.folderId === 'root')); });

const menuToggle = $('menuToggle');
const sidebar = $('sidebar');
const sidebarBackdrop = $('sidebarBackdrop');
if (window.innerWidth <= 768) menuToggle.style.display = 'flex';
menuToggle?.addEventListener('click', () => { sidebar.classList.toggle('open'); sidebarBackdrop.classList.toggle('show'); });
sidebarBackdrop?.addEventListener('click', closeSidebar);
function closeSidebar() { sidebar?.classList.remove('open'); sidebarBackdrop?.classList.remove('show'); }
window.addEventListener('resize', () => { if (window.innerWidth > 768) { closeSidebar(); if (menuToggle) menuToggle.style.display = 'none'; } else { if (menuToggle) menuToggle.style.display = 'flex'; } });

function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

(async function init() {
  (() => {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    $('themeToggle').innerHTML = saved === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
  })();
  try { const cfg = await (await fetch('/api/config')).json(); if (backendSelect && cfg.defaultStorageBackend) backendSelect.value = cfg.defaultStorageBackend; } catch {}
  loadUser(); loadFolders(); loadFiles();
})();
