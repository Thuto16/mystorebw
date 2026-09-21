// ============================================================
// admin.js — Login, product management, order viewing.
// ============================================================

const API_BASE = '';
const TOKEN_KEY = 'mystorebw_admin_token';

let editingProductId = null;   // null = adding new, number = editing existing
let currentProducts = [];
let currentOrders = [];

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

/**
 * Wrapper around fetch that adds the auth header.
 * If the server responds 401 (token dead), we log the user out.
 */
async function api(path, options = {}) {
  const headers = options.headers || {};
  headers['Authorization'] = `Bearer ${getToken()}`;
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    showLogin();
    throw new Error('Session expired. Please log in again.');
  }
  return res;
}

// ------------------------------------------------------------
// Login / logout
// ------------------------------------------------------------
function showLogin() {
  $('#loginScreen').classList.remove('hidden');
  $('#dashboard').classList.add('hidden');
}

function showDashboard() {
  $('#loginScreen').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const errEl = $('#loginError');
  errEl.textContent = '';
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const fd = new FormData(form);
  try {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fd.get('username'),
        password: fd.get('password'),
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Login failed');

    setToken(data.token);
    form.reset();
    showDashboard();
    loadProducts();
    loadOrders();
  } catch (err) {
    errEl.textContent = err.message || 'Login failed';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

async function handleLogout() {
  try {
    await api('/api/admin/logout', { method: 'POST' });
  } catch (_) {}
  clearToken();
  showLogin();
}

// ------------------------------------------------------------
// Tabs
// ------------------------------------------------------------
function initTabs() {
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tab = btn.dataset.tab;
      $$('.tab-panel').forEach(p => p.classList.add('hidden'));
      $(`#tab-${tab}`)?.classList.remove('hidden');

      if (tab === 'orders') loadOrders();
      if (tab === 'products') loadProducts();
    });
  });
}

// ------------------------------------------------------------
// Products
// ------------------------------------------------------------
async function loadProducts() {
  const wrap = $('#productsList');
  wrap.innerHTML = '<p class="loading-msg">Loading products…</p>';

  try {
    const res = await api('/api/admin/products');
    const data = await res.json();
    currentProducts = data.products || [];

    $('#productsCount').textContent = currentProducts.length === 1
      ? '1 product'
      : `${currentProducts.length} products`;

    renderProducts();
  } catch (err) {
    wrap.innerHTML = `<p class="loading-msg">Could not load products: ${escapeHtml(err.message)}</p>`;
  }
}

function renderProducts() {
  const wrap = $('#productsList');

  if (currentProducts.length === 0) {
    wrap.innerHTML = '<p class="loading-msg">No products yet. Click “Add product” to start.</p>';
    return;
  }

  wrap.innerHTML = currentProducts.map(p => {
    const img = p.image_url
      ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}">`
      : `<div class="placeholder">${escapeHtml(p.name.charAt(0))}</div>`;

    return `
      <div class="product-admin-card">
        <div class="product-admin-image">
          ${img}
          ${!p.is_available ? '<span class="hidden-badge">Hidden</span>' : ''}
        </div>
        <div class="product-admin-body">
          <div class="product-admin-cat">${escapeHtml(p.category || '')}</div>
          <div class="product-admin-name">${escapeHtml(p.name)}</div>
          <div class="product-admin-price">P${Number(p.price).toFixed(2)}</div>
          <div class="product-admin-actions">
            <button data-edit="${p.id}">Edit</button>
            <button class="danger-btn" data-delete="${p.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openProductModal(product = null) {
  const modal = $('#productModal');
  const form = $('#productForm');

  form.reset();
  $('#imagePreview').innerHTML = '';
  $('#uploadStatus').textContent = '';
  $('#saveBtn').disabled = false;
  $('#saveBtn').textContent = 'Save product';

  if (product) {
    editingProductId = product.id;
    $('#productModalTitle').textContent = 'Edit product';
    form.id.value = product.id;
    form.name.value = product.name || '';
    form.description.value = product.description || '';
    form.price.value = product.price;
    form.category.value = product.category || '';
    form.subcategory.value = product.subcategory || '';
    form.image_url.value = product.image_url || '';
    form.is_available.checked = !!product.is_available;

    if (product.image_url) {
      $('#imagePreview').innerHTML = `<img src="${escapeHtml(product.image_url)}" alt="">`;
    }
  } else {
    editingProductId = null;
    $('#productModalTitle').textContent = 'Add product';
    form.is_available.checked = true;
  }

  modal.classList.add('open');
}

function closeProductModal() {
  $('#productModal').classList.remove('open');
  editingProductId = null;
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const saveBtn = $('#saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const payload = {
    name: form.name.value.trim(),
    description: form.description.value.trim(),
    price: parseFloat(form.price.value),
    category: form.category.value,
    subcategory: form.subcategory.value.trim(),
    image_url: form.image_url.value.trim(),
    is_available: form.is_available.checked,
  };

  try {
    let res;
    if (editingProductId) {
      res = await api(`/api/admin/products/${editingProductId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      res = await api('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Save failed');

    closeProductModal();
    loadProducts();
  } catch (err) {
    alert('Could not save: ' + err.message);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save product';
  }
}

async function handleDelete(id) {
  const p = currentProducts.find(x => x.id === id);
  const name = p ? p.name : 'this product';
  if (!confirm(`Delete “${name}”? This cannot be undone.`)) return;

  try {
    const res = await api(`/api/admin/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Delete failed');
    loadProducts();
  } catch (err) {
    alert('Could not delete: ' + err.message);
  }
}

// ------------------------------------------------------------
// Image upload
// ------------------------------------------------------------
async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const status = $('#uploadStatus');
  const preview = $('#imagePreview');
  status.textContent = 'Uploading…';

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/api/admin/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: fd,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');

    $('#productForm').image_url.value = data.url;
    preview.innerHTML = `<img src="${escapeHtml(data.url)}" alt="">`;
    status.textContent = 'Uploaded ✓';
  } catch (err) {
    status.textContent = 'Upload failed: ' + err.message;
  }
}

// ------------------------------------------------------------
// Orders
// ------------------------------------------------------------
async function loadOrders() {
  const wrap = $('#ordersList');
  wrap.innerHTML = '<p class="loading-msg">Loading orders…</p>';

  try {
    const res = await api('/api/admin/orders');
    const data = await res.json();
    currentOrders = data.orders || [];

    $('#ordersCount').textContent = currentOrders.length === 1
      ? '1 order'
      : `${currentOrders.length} orders`;

    renderOrders();
  } catch (err) {
    wrap.innerHTML = `<p class="loading-msg">Could not load orders: ${escapeHtml(err.message)}</p>`;
  }
}

function renderOrders() {
  const wrap = $('#ordersList');

  if (currentOrders.length === 0) {
    wrap.innerHTML = '<p class="loading-msg">No orders yet.</p>';
    return;
  }

  wrap.innerHTML = currentOrders.map(o => {
    const date = new Date(o.created_at).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const itemsHtml = o.items.map(i => `
      <div class="order-item-row">
        <span>${escapeHtml(i.product_name)} × ${i.quantity}</span>
        <span>P${(i.price * i.quantity).toFixed(2)}</span>
      </div>
    `).join('');

    const waText = encodeURIComponent(
      `Hi ${o.customer_name}, about your order #${o.id} from MyStore BW…`
    );
    const waHref = `https://wa.me/${String(o.customer_phone).replace(/\D/g, '')}?text=${waText}`;

    return `
      <div class="order-card">
        <div class="order-head">
          <div>
            <span class="order-id">Order #${o.id}</span>
            <span class="order-date">${date}</span>
          </div>
          <span class="order-status status-${escapeHtml(o.status)}">${escapeHtml(o.status)}</span>
        </div>

        <div class="order-customer">
          <div><strong>Name</strong>${escapeHtml(o.customer_name)}</div>
          <div><strong>Phone</strong>${escapeHtml(o.customer_phone)}</div>
          <div><strong>Location</strong>${escapeHtml(o.location)}</div>
        </div>

        ${o.notes ? `<div class="order-notes">${escapeHtml(o.notes)}</div>` : ''}

        <div class="order-items">
          ${itemsHtml}
          <div class="order-total-row">
            <span>Total</span>
            <span>P${Number(o.total_price).toFixed(2)}</span>
          </div>
        </div>

        <div class="order-actions">
          <select data-status-for="${o.id}">
            ${['new','contacted','completed','cancelled'].map(s =>
              `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <a class="wa-link" href="${waHref}" target="_blank" rel="noopener">Message on WhatsApp</a>
        </div>
      </div>
    `;
  }).join('');
}

async function handleStatusChange(orderId, status) {
  try {
    const res = await api(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Update failed');

    // Update local state + re-render
    const o = currentOrders.find(x => x.id === orderId);
    if (o) o.status = status;
    renderOrders();
  } catch (err) {
    alert('Could not update status: ' + err.message);
  }
}

// ------------------------------------------------------------
// Wiring
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Show the right screen depending on token
  if (getToken()) {
    showDashboard();
    loadProducts();
    loadOrders();
  } else {
    showLogin();
  }

  // Login
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#logoutBtn').addEventListener('click', handleLogout);

  // Tabs
  initTabs();

  // Product modal
  $('#addProductBtn').addEventListener('click', () => openProductModal());
  $('#productForm').addEventListener('submit', handleProductSubmit);
  $('#imageFile').addEventListener('change', handleImageUpload);
  $$('.modal-cancel').forEach(b => b.addEventListener('click', closeProductModal));
  $('.modal-close').addEventListener('click', closeProductModal);
  $('#productModal').addEventListener('click', (e) => {
    if (e.target.id === 'productModal') closeProductModal();
  });

  // Product list — delegated clicks for Edit / Delete
  $('#productsList').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn  = e.target.closest('[data-delete]');

    if (editBtn) {
      const id = parseInt(editBtn.dataset.edit, 10);
      const product = currentProducts.find(p => p.id === id);
      if (product) openProductModal(product);
    }
    if (delBtn) {
      handleDelete(parseInt(delBtn.dataset.delete, 10));
    }
  });

  // Orders — status dropdown
  $('#ordersList').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-status-for]');
    if (!sel) return;
    handleStatusChange(parseInt(sel.dataset.statusFor, 10), sel.value);
  });

  // Orders refresh button
  $('#refreshOrdersBtn').addEventListener('click', loadOrders);
});