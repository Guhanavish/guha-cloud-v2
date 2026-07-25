const API = '/api';
let currentFolder = 'root';
let currentPage = 1;
let currentSort = '-created_at';
let selectedItems = new Set();

const fileGrid = document.getElementById('fileGrid');
const emptyState = document.getElementById('emptyState');
const folderTree = document.getElementById('folderTree');
const breadcrumb = document.getElementById('breadcrumb');
const storageUsed = document.getElementById('storageUsed');
const storageTotal = document.getElementById('storageTotal');
const storageFill = document.getElementById('storageFill');
const storagePill = document.getElementById('storagePill');
const pagination = document.getElementById('pagination');
const pageInfo = document.getElementById('pageInfo');
const prevPage = document.getElementById('prevPage');
const nextPage = document.getElementById('nextPage');
const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const backendSelect = document.getElementById('backendSelect');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(mimeType) {
  if (mimeType.startsWith('image/')) return 'fa-file-image';
  if (mimeType.startsWith('video/')) return 'fa-file-video';
  if (mimeType.startsWith('audio/')) return 'fa-file-audio';
  if (mimeType === 'application/pdf') return 'fa-file-pdf';
  if (mimeType.includes('word')) return 'fa-file-word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fa-file-powerpoint';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('gzip') || mimeType.includes('7z')) return 'fa-file-archive';
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('xml') || mimeType.includes('html') || mimeType.includes('css')) return 'fa-file-code';
  return 'fa-file';
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

let _statsSeq = 0;
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

async function loadUser() {
  try {
    const { user } = await api('/auth/me');
    await loadStorageStats();
  } catch {
    window.location.href = '/login';
  }
}

async function loadFolders(parentId = null) {
  try {
    const { folders } = await api(`/folders?parentId=${parentId || ''}`);
    renderFolders(folders, parentId);
  } catch {}
}

function renderFolders(folders, parentId, container = folderTree) {
  const parentLi = parentId ? container.querySelector(`[data-folder-id="${parentId}"]`) : null;
  const targetUl = parentLi ? (parentLi.querySelector('.folder-children') || createChildrenUl(parentLi)) : container;

  if (!parentId) {
    const rootItem = targetUl.querySelector('[data-folder-id="root"]');
    targetUl.innerHTML = '';
    if (rootItem) targetUl.appendChild(rootItem);
  } else {
    targetUl.innerHTML = '';
  }

  folders.forEach(f => {
    const li = document.createElement('li');
    li.className = 'folder-item';
    li.dataset.folderId = f.id;
    if (f.id === currentFolder) li.classList.add('active');
    li.innerHTML = `<div class="folder-item-content"><i class="fas fa-folder"></i> <span>${escapeHtml(f.name)}</span></div>`;
    li.addEventListener('click', (e) => { e.stopPropagation(); selectFolder(f.id); });
    li.addEventListener('contextmenu', (e) => showFolderContextMenu(e, f.id, f.name));
    targetUl.appendChild(li);
    loadFolders(f.id);
  });
}

function createChildrenUl(parentLi) {
  const ul = document.createElement('ul');
  ul.className = 'folder-children';
  parentLi.appendChild(ul);
  return ul;
}

async function selectFolder(folderId) {
  currentFolder = folderId;
  currentPage = 1;
  document.querySelectorAll('.folder-item').forEach(el => el.classList.toggle('active', el.dataset.folderId === folderId));
  closeSidebar();
  await loadFiles();
  await updateBreadcrumb();
}

async function updateBreadcrumb() {
  if (currentFolder === 'root') {
    breadcrumb.innerHTML = '<a href="#" data-folder="root">Root</a>';
    return;
  }
  try {
    const { folder } = await api(`/folders/${currentFolder}`);
    const parts = (folder.path || folder.name).split('/').filter(Boolean);
    breadcrumb.innerHTML = '<a href="#" data-folder="root">Root</a>';
    let currentPath = '';
    for (const part of parts) {
      currentPath += '/' + part;
      breadcrumb.innerHTML += ` <i class="fas fa-chevron-right"></i> <a href="#" data-folder="${currentPath}">${escapeHtml(part)}</a>`;
    }
    breadcrumb.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const fid = a.dataset.folder === 'root' ? 'root' : a.dataset.folder;
        if (fid !== 'root') selectFolder(fid);
        else { currentFolder = 'root'; currentPage = 1; loadFiles(); updateBreadcrumb(); }
      });
    });
  } catch {}
}

async function loadFiles() {
  try {
    showLoading();
    const params = new URLSearchParams({ page: currentPage, limit: 50, sort: currentSort });
    if (currentFolder !== 'root') params.append('folderId', currentFolder);
    const { files, pagination: pag } = await api(`/files?${params}`);
    renderFiles(files);
    renderPagination(pag);
  } catch (e) {
    console.error('Failed to load files:', e);
    showError('Failed to load files');
  }
}

function showLoading() {
  fileGrid.innerHTML = '<div class="loading">Loading</div>';
}

function renderFiles(files) {
  if (files.length === 0) {
    fileGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  fileGrid.innerHTML = files.map(f => {
    const statusBadge = f.path === null ? '<span class="status-badge processing">Processing</span>' :
      f.path === 'failed' ? '<span class="status-badge failed">Failed</span>' : '';
    return `
    <div class="file-item${selectedItems.has(f.id) ? ' selected' : ''}${f.path === null || f.path === 'failed' ? ' disabled' : ''}" data-id="${f.id}" data-type="file">
      <input type="checkbox" class="file-checkbox" ${selectedItems.has(f.id) ? 'checked' : ''}>
      <i class="file-icon fas ${getFileIcon(f.mime_type)}"></i>
      <div class="file-name" title="${escapeHtml(f.original_name)}">${escapeHtml(f.original_name)}</div>
      <div class="file-meta">${formatBytes(f.size)} ${statusBadge} <span class="storage-badge ${f.storage_backend || 'supabase'}">${(f.storage_backend || 'supabase') === 'supabase' ? 'Supabase' : 'B2'}</span></div>
    </div>`;
  }).join('');

  fileGrid.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox') return;
      const id = item.dataset.id;
      if (e.ctrlKey || e.metaKey) { toggleSelection(id, item); }
      else if (e.shiftKey && selectedItems.size > 0) { selectRange(id); }
      else { clearSelection(); toggleSelection(id, item); }
    });
    item.querySelector('.file-checkbox').addEventListener('change', (e) => {
      e.stopPropagation();
      toggleSelection(item.dataset.id, item);
    });
    item.addEventListener('dblclick', () => downloadFile(item.dataset.id));
    item.addEventListener('contextmenu', (e) => showContextMenu(e, item.dataset.id, 'file'));
  });
}

function toggleSelection(id, item) {
  if (selectedItems.has(id)) { selectedItems.delete(id); item.classList.remove('selected'); item.querySelector('.file-checkbox').checked = false; }
  else { selectedItems.add(id); item.classList.add('selected'); item.querySelector('.file-checkbox').checked = true; }
  updateSelectionUI();
}

function clearSelection() {
  selectedItems.forEach(id => { const item = fileGrid.querySelector(`[data-id="${id}"]`); if (item) { item.classList.remove('selected'); item.querySelector('.file-checkbox').checked = false; } });
  selectedItems.clear();
  updateSelectionUI();
}

function selectRange(lastId) {
  const items = Array.from(fileGrid.querySelectorAll('.file-item'));
  const firstIdx = items.findIndex(i => selectedItems.has(i.dataset.id));
  const lastIdx = items.findIndex(i => i.dataset.id === lastId);
  if (firstIdx === -1 || lastIdx === -1) return;
  const [start, end] = firstIdx < lastIdx ? [firstIdx, lastIdx] : [lastIdx, firstIdx];
  for (let i = start; i <= end; i++) { selectedItems.add(items[i].dataset.id); items[i].classList.add('selected'); items[i].querySelector('.file-checkbox').checked = true; }
  updateSelectionUI();
}

function updateSelectionUI() {
  downloadSelectedBtn.disabled = selectedItems.size === 0;
  deleteSelectedBtn.disabled = selectedItems.size === 0;
}

async function downloadFile(id) {
  window.location.href = `${API}/files/${id}/download`;
}

async function downloadSelected() {
  for (const id of selectedItems) { downloadFile(id); await new Promise(r => setTimeout(r, 100)); }
}

async function deleteSelected() {
  if (!confirm(`Delete ${selectedItems.size} item(s)?`)) return;
  try {
    for (const id of selectedItems) { await api(`/files/${id}`, { method: 'DELETE' }); }
    clearSelection();
    loadFiles(); loadUser();
  } catch (e) { alert('Delete failed: ' + e.message); }
}

function renderPagination(pag) {
  if (pag.pages <= 1) { pagination.classList.add('hidden'); return; }
  pagination.classList.remove('hidden');
  pageInfo.textContent = `Page ${pag.page} of ${pag.pages}`;
  prevPage.disabled = pag.page <= 1;
  nextPage.disabled = pag.page >= pag.pages;
}

async function uploadFiles(files) {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  if (currentFolder !== 'root') formData.append('folderId', currentFolder);
  formData.append('storageBackend', backendSelect.value);

  const container = document.getElementById('uploadProgress') || createUploadContainer();
  const items = [];

  for (const file of files) {
    const item = createUploadItem(file.name);
    container.appendChild(item);
    items.push({ file, item, progress: item.querySelector('.upload-fill'), status: item.querySelector('.upload-status') });
  }

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/files/upload`);
    xhr.withCredentials = true;

    let uploaded = 0;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 100;
        items.forEach(i => i.progress.style.width = `${pct}%`);
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        items.forEach(i => { i.progress.style.width = '100%'; i.status.textContent = 'Complete'; i.item.classList.add('complete'); });
        setTimeout(() => { items.forEach(i => i.item.remove()); if (!container.children.length) container.remove(); }, 2000);
        loadFiles(); loadUser();
      } else {
        let msg = 'Failed';
        try { const err = JSON.parse(xhr.responseText); msg = err.error || msg; } catch {}
        items.forEach(i => { i.status.textContent = msg; i.item.classList.add('error'); });
        setTimeout(() => { items.forEach(i => i.item.remove()); if (!container.children.length) container.remove(); }, 5000);
      }
    };

    xhr.onerror = () => { items.forEach(i => { i.status.textContent = 'Error'; i.item.classList.add('error'); }); };
    xhr.send(formData);
  } catch (e) {
    items.forEach(i => { i.status.textContent = 'Error'; i.item.classList.add('error'); });
  }
}

function createUploadContainer() {
  const div = document.createElement('div');
  div.id = 'uploadProgress';
  div.className = 'upload-progress';
  document.body.appendChild(div);
  return div;
}

function createUploadItem(name) {
  const div = document.createElement('div');
  div.className = 'upload-item';
  div.innerHTML = `<div class="upload-info"><div class="upload-name">${escapeHtml(name)}</div><div class="upload-bar"><div class="upload-fill"></div></div></div><div class="upload-status">Uploading...</div>`;
  return div;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(msg) { alert(msg); }

function showContextMenu(e, id, type) {
  e.preventDefault();
  document.querySelector('.context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${e.pageX}px`;
  menu.style.top = `${e.pageY}px`;
  menu.innerHTML = `
    <button class="context-menu-item" data-action="download"><i class="fas fa-download"></i> Download</button>
    <button class="context-menu-item" data-action="rename"><i class="fas fa-edit"></i> Rename</button>
    <button class="context-menu-item danger" data-action="delete"><i class="fas fa-trash"></i> Delete</button>`;
  document.body.appendChild(menu);
  menu.querySelectorAll('.context-menu-item').forEach(btn => {
    btn.addEventListener('click', () => { menu.remove(); const a = btn.dataset.action; if (a === 'download') downloadFile(id); else if (a === 'rename') showRenameModal(id, type); else if (a === 'delete') deleteFile(id); });
  });
  document.addEventListener('click', function cm() { menu.remove(); document.removeEventListener('click', cm); }, { once: true });
}

function showFolderContextMenu(e, id, name) {
  e.preventDefault();
  document.querySelector('.context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${e.pageX}px`;
  menu.style.top = `${e.pageY}px`;
  menu.innerHTML = `
    <button class="context-menu-item" data-action="rename"><i class="fas fa-edit"></i> Rename</button>
    <button class="context-menu-item danger" data-action="delete"><i class="fas fa-trash"></i> Delete</button>`;
  document.body.appendChild(menu);
  menu.querySelectorAll('.context-menu-item').forEach(btn => {
    btn.addEventListener('click', () => { menu.remove(); const a = btn.dataset.action; if (a === 'rename') showRenameModal(id, 'folder'); else if (a === 'delete') deleteFolder(id); });
  });
  document.addEventListener('click', function cm() { menu.remove(); document.removeEventListener('click', cm); }, { once: true });
}

// --- Modals ---
const folderModal = document.getElementById('folderModal');
const folderForm = document.getElementById('folderForm');
const folderName = document.getElementById('folderName');
const folderModalTitle = document.getElementById('folderModalTitle');
const newFolderBtn = document.getElementById('newFolderBtn');
const cancelFolderBtn = document.getElementById('cancelFolderBtn');

newFolderBtn.addEventListener('click', () => { folderModalTitle.textContent = 'New Folder'; folderForm.reset(); folderModal.classList.remove('hidden'); });
cancelFolderBtn.addEventListener('click', () => folderModal.classList.add('hidden'));
folderModal.querySelector('.modal-overlay').addEventListener('click', () => folderModal.classList.add('hidden'));

folderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const parentId = currentFolder === 'root' ? null : currentFolder;
    await api('/folders', { method: 'POST', body: JSON.stringify({ name: folderName.value, parentId }) });
    folderModal.classList.add('hidden');
    loadFolders();
  } catch (err) { showError(err.message); }
});

const renameModal = document.getElementById('renameModal');
const renameForm = document.getElementById('renameForm');
const renameName = document.getElementById('renameName');
const renameId = document.getElementById('renameId');
const renameType = document.getElementById('renameType');
const cancelRenameBtn = document.getElementById('cancelRenameBtn');

function showRenameModal(id, type) {
  renameId.value = id;
  renameType.value = type;
  const item = document.querySelector(`[data-id="${id}"]`);
  if (item) { const nameEl = item.querySelector('.file-name, .folder-name'); renameName.value = nameEl ? nameEl.textContent : ''; }
  renameModal.classList.remove('hidden');
  renameName.focus();
}

cancelRenameBtn.addEventListener('click', () => renameModal.classList.add('hidden'));
renameModal.querySelector('.modal-overlay').addEventListener('click', () => renameModal.classList.add('hidden'));

renameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
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
});

async function deleteFile(id) {
  if (!confirm('Delete this file?')) return;
  try { await api(`/files/${id}`, { method: 'DELETE' }); loadFiles(); loadUser(); } catch (err) { showError(err.message); }
}

async function deleteFolder(id) {
  if (!confirm('Delete this folder and all its contents?')) return;
  try {
    await api(`/folders/${id}`, { method: 'DELETE' });
    if (currentFolder === id) { currentFolder = 'root'; }
    currentPage = 1;
    await Promise.all([loadFolders(), loadFiles(), loadUser()]);
    if (currentFolder === 'root') await updateBreadcrumb();
  } catch (err) { showError(err.message); }
}

const usernameModal = document.getElementById('usernameModal');
const usernameForm = document.getElementById('usernameForm');
const newUsername = document.getElementById('newUsername');
const changeUsernameBtn = document.getElementById('changeUsernameBtn');
const cancelUsernameBtn = document.getElementById('cancelUsernameBtn');

changeUsernameBtn.addEventListener('click', () => { usernameForm.reset(); usernameModal.classList.remove('hidden'); });
cancelUsernameBtn.addEventListener('click', () => usernameModal.classList.add('hidden'));
usernameModal.querySelector('.modal-overlay').addEventListener('click', () => usernameModal.classList.add('hidden'));
usernameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/auth/username', { method: 'PUT', body: JSON.stringify({ username: newUsername.value }) }); usernameModal.classList.add('hidden'); loadUser(); showError('Username changed'); } catch (err) { showError(err.message); }
});

const passwordModal = document.getElementById('passwordModal');
const passwordForm = document.getElementById('passwordForm');
const currentPassword = document.getElementById('currentPassword');
const newPassword = document.getElementById('newPassword');
const confirmNewPassword = document.getElementById('confirmNewPassword');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');

changePasswordBtn.addEventListener('click', () => { passwordForm.reset(); passwordModal.classList.remove('hidden'); });
cancelPasswordBtn.addEventListener('click', () => passwordModal.classList.add('hidden'));
passwordModal.querySelector('.modal-overlay').addEventListener('click', () => passwordModal.classList.add('hidden'));
passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (newPassword.value !== confirmNewPassword.value) return showError('Passwords do not match');
  try { await api('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword: currentPassword.value, newPassword: newPassword.value }) }); passwordModal.classList.add('hidden'); showError('Password changed'); } catch (err) { showError(err.message); }
});

// --- Event Listeners ---
document.getElementById('emptyUploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', (e) => { if (e.target.files.length) { uploadFiles(Array.from(e.target.files)); e.target.value = ''; } });
document.getElementById('sortSelect').addEventListener('change', (e) => { currentSort = e.target.value; currentPage = 1; loadFiles(); });
document.getElementById('searchInput').addEventListener('input', debounce(async (e) => {
  const q = e.target.value.trim();
  if (!q) return loadFiles();
  try { const { files } = await api(`/files/search?q=${encodeURIComponent(q)}&folderId=${currentFolder !== 'root' ? currentFolder : ''}`); renderFiles(files); pagination.classList.add('hidden'); } catch {}
}, 300));
prevPage.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadFiles(); } });
nextPage.addEventListener('click', () => { currentPage++; loadFiles(); });
downloadSelectedBtn.addEventListener('click', downloadSelected);
deleteSelectedBtn.addEventListener('click', deleteSelected);

document.getElementById('logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); window.location.href = '/login'; });

document.getElementById('themeToggle').addEventListener('click', () => {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  document.getElementById('themeToggle').innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
});

document.getElementById('userMenuBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('userMenuBtn').classList.toggle('active');
  document.getElementById('userDropdown').classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-menu')) {
    document.getElementById('userMenuBtn').classList.remove('active');
    document.getElementById('userDropdown').classList.add('hidden');
  }
});

document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden')));

// Storage backend switch - update stats
backendSelect?.addEventListener('change', loadStorageStats);

// Root "All Files" click handler
document.querySelector('#folderTree > .folder-item[data-folder-id="root"]')?.addEventListener('click', () => selectFolder('root'));

// Home button
document.getElementById('homeBtn')?.addEventListener('click', () => { selectFolder('root'); document.querySelectorAll('.folder-item').forEach(el => el.classList.toggle('active', el.dataset.folderId === 'root')); });

// Mobile menu
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
if (window.innerWidth <= 768) menuToggle.style.display = 'flex';
menuToggle?.addEventListener('click', () => { sidebar.classList.toggle('open'); sidebarBackdrop.classList.toggle('show'); });
sidebarBackdrop?.addEventListener('click', closeSidebar);
function closeSidebar() { sidebar?.classList.remove('open'); sidebarBackdrop?.classList.remove('show'); }
window.addEventListener('resize', () => { if (window.innerWidth > 768) { closeSidebar(); if (menuToggle) menuToggle.style.display = 'none'; } else { if (menuToggle) menuToggle.style.display = 'flex'; } });

function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

// Init
(async function init() {
  (function() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.getElementById('themeToggle').innerHTML = saved === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
  })();

  try {
    const cfg = await (await fetch('/api/config')).json();
    if (backendSelect && cfg.defaultStorageBackend) backendSelect.value = cfg.defaultStorageBackend;
  } catch {}

  loadUser();
  loadFolders();
  loadFiles();
})();