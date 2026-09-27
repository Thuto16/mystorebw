// ============================================================
// cart.js — Manages the shopping cart using localStorage.
// Exposes a global `Cart` object other scripts can call.
// ============================================================

const Cart = (function () {
  const STORAGE_KEY = 'mystorebw_cart';

  // ---------- Data helpers ----------
  function getItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Cart: could not read localStorage', err);
      return [];
    }
  }

  function saveItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge();
    renderDrawer();
  }

  // ---------- Public actions ----------
  function add(product) {
    const items = getItems();
    const existing = items.find(i => i.id === product.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image_url: product.image_url,
        quantity: 1,
      });
    }
    saveItems(items);
  }

  function remove(productId) {
    saveItems(getItems().filter(i => i.id !== productId));
  }

  function updateQty(productId, qty) {
    qty = parseInt(qty, 10);
    if (qty < 1) return remove(productId);
    const items = getItems();
    const target = items.find(i => i.id === productId);
    if (!target) return;
    target.quantity = qty;
    saveItems(items);
  }

  function clear() {
    saveItems([]);
  }

  function total() {
    return getItems().reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  function count() {
    return getItems().reduce((sum, i) => sum + i.quantity, 0);
  }

  // ---------- Small helper to prevent HTML injection ----------
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ---------- UI updates ----------
  function updateBadge() {
    const badge = document.getElementById('cartCount');
    if (badge) badge.textContent = count();
  }

  function renderDrawer() {
    const wrap = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (!wrap) return;

    const items = getItems();

    if (items.length === 0) {
      wrap.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
      if (totalEl) totalEl.textContent = '0.00';
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    wrap.innerHTML = items.map(item => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-price">P${item.price.toFixed(2)}</div>
          <div class="qty-controls">
            <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
          </div>
        </div>
        <button class="remove-item" data-action="remove" data-id="${item.id}" aria-label="Remove">✕</button>
      </div>
    `).join('');

    if (totalEl) totalEl.textContent = total().toFixed(2);
    if (checkoutBtn) checkoutBtn.disabled = false;
  }

  // ---------- Drawer open/close ----------
  function openDrawer() {
    document.getElementById('cartDrawer')?.classList.add('open');
    document.getElementById('cartOverlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.getElementById('cartOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ---------- Init: runs after DOM is ready ----------
  function init() {
    document.getElementById('cartBtn')?.addEventListener('click', openDrawer);
    document.getElementById('closeCart')?.addEventListener('click', closeDrawer);
    document.getElementById('cartOverlay')?.addEventListener('click', closeDrawer);

    // Event delegation for +/- / remove inside the drawer
    document.getElementById('cartItems')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      const action = btn.dataset.action;

      if (action === 'inc') {
        const item = getItems().find(i => i.id === id);
        if (item) updateQty(id, item.quantity + 1);
      } else if (action === 'dec') {
        const item = getItems().find(i => i.id === id);
        if (item) updateQty(id, item.quantity - 1);
      } else if (action === 'remove') {
        remove(id);
      }
    });

    updateBadge();
    renderDrawer();
  }

  // Expose the public API
  return {
    getItems, add, remove, updateQty, clear, total, count,
    openDrawer, closeDrawer, init, render: renderDrawer,
  };
})();

// Run init once the page is fully loaded
document.addEventListener('DOMContentLoaded', Cart.init);