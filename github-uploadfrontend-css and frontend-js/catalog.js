// ============================================================
// catalog.js — Fetches products from the API, renders the grid,
// handles search, filters and the checkout flow.
// ============================================================

// During local dev, the API lives at the same origin. Later we
// swap this to the Render URL when we deploy.
const API_BASE = '';

// All the state we track on the page
const state = {
  products: [],
  filters: {
    category: '',
    search: '',
    maxPrice: 35000,
  },
};

// ---------- Fetch ----------
async function fetchProducts() {
  try {
    const res = await fetch(`${API_BASE}/api/products`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load');
    state.products = data.products;
    renderProducts();
  } catch (err) {
    console.error('Failed to fetch products:', err);
    document.getElementById('productGrid').innerHTML = `
      <div class="empty">
        <strong>Couldn't load products</strong>
        <p>Make sure the backend is running, then refresh the page.</p>
      </div>`;
  }
}

// ---------- Filter (client side — we already have all products) ----------
function getFilteredProducts() {
  return state.products.filter(p => {
    if (state.filters.category && p.category !== state.filters.category) return false;
    if (state.filters.maxPrice && p.price > state.filters.maxPrice) return false;

    if (state.filters.search) {
      const needle = state.filters.search.toLowerCase();
      const haystack = `${p.name} ${p.description || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

// ---------- Render ----------
function renderProducts() {
  const grid = document.getElementById('productGrid');
  const countLabel = document.getElementById('productCountLabel');
  if (!grid) return;

  const products = getFilteredProducts();

  if (countLabel) {
    countLabel.textContent = products.length === 1
      ? '1 product'
      : `${products.length} products`;
  }

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <strong>No products match</strong>
        <p>Try a different filter or search term.</p>
      </div>`;
    return;
  }

  grid.innerHTML = products.map(renderCard).join('');
}

function renderCard(p) {
  const imageHtml = p.image_url
    ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy">`
    : `<div class="placeholder">${escapeHtml(p.name.charAt(0))}</div>`;

  return `
    <div class="card">
      <div class="card-image">
        ${imageHtml}
        ${p.category ? `<span class="card-badge">${escapeHtml(p.category)}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(p.name)}</div>
        <div class="card-desc">${escapeHtml(p.description || '')}</div>
        <div class="card-foot">
          <div class="card-price">P${p.price.toFixed(2)}</div>
          <button class="add-btn" data-add="${p.id}" aria-label="Add to cart">+</button>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------- Wire up inputs ----------
function initSearch() {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  if (!input) return;

  let timer;

  // Live filtering as the user types (debounced)
  input.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.filters.search = e.target.value.trim();
      renderProducts();
    }, 200);
  });

  // Explicit submit (Enter key or tapping the Search button)
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    state.filters.search = input.value.trim();
    renderProducts();
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
  });
}

function initChips() {
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filters.category = chip.dataset.category || '';
      renderProducts();
    });
  });
}

function initPriceFilter() {
  const range = document.getElementById('priceRange');
  const valueEl = document.getElementById('priceValue');
  if (!range || !valueEl) return;

  valueEl.textContent = parseInt(range.value, 10).toLocaleString();

  range.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    state.filters.maxPrice = v;
    valueEl.textContent = v.toLocaleString();
    renderProducts();
  });
}

function initCategoryCards() {
  document.querySelectorAll('.cat-card').forEach(card => {
    card.addEventListener('click', () => {
      const cat = card.dataset.cat || '';
      document.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.category === cat);
      });
      state.filters.category = cat;
      renderProducts();
      document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function initNavCategoryLinks() {
  document.querySelectorAll('[data-nav-cat]').forEach(link => {
    link.addEventListener('click', () => {
      const cat = link.dataset.navCat || '';
      document.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.category === cat);
      });
      state.filters.category = cat;
      renderProducts();
    });
  });
}

// Delegated click handler — works for cards rendered later
function initAddButtons() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;

    const id = parseInt(btn.dataset.add, 10);
    const product = state.products.find(p => p.id === id);
    if (!product) return;

    Cart.add(product);

    // Visual feedback
    btn.classList.add('added');
    btn.textContent = '✓';
    setTimeout(() => {
      btn.classList.remove('added');
      btn.textContent = '+';
    }, 1200);
  });
}

// ---------- Checkout ----------
function initCheckout() {
  const btn = document.getElementById('checkoutBtn');
  const modal = document.getElementById('checkoutModal');
  const closeBtn = modal?.querySelector('.modal-close');
  const form = document.getElementById('checkoutForm');
  if (!btn || !modal || !form) return;

  btn.addEventListener('click', () => {
    if (Cart.count() === 0) return;
    Cart.closeDrawer();
    renderCheckoutSummary();
    modal.classList.add('open');
  });

  closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    const fd = new FormData(form);
    const payload = {
      customer_name: fd.get('customer_name'),
      customer_phone: fd.get('customer_phone'),
      location: fd.get('location'),
      notes: fd.get('notes'),
      items: Cart.getItems().map(i => ({ product_id: i.id, quantity: i.quantity })),
    };

    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Order failed');

      Cart.clear();
      window.location.href = data.whatsapp_link;
    } catch (err) {
      console.error('Order failed:', err);
      alert('Sorry, could not place the order. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send order on WhatsApp';
    }
  });
}

function renderCheckoutSummary() {
  const wrap = document.querySelector('.checkout-summary');
  if (!wrap) return;

  const items = Cart.getItems();
  wrap.innerHTML = items.map(i => `
    <div class="summary-row">
      <span>${escapeHtml(i.name)} × ${i.quantity}</span>
      <span>P${(i.price * i.quantity).toFixed(2)}</span>
    </div>
  `).join('') + `
    <div class="summary-row summary-total">
      <span>Total</span>
      <strong>P${Cart.total().toFixed(2)}</strong>
    </div>
  `;
}

// ---------- Kick off on page load ----------
document.addEventListener('DOMContentLoaded', () => {
  fetchProducts();
  initSearch();
  initChips();
  initPriceFilter();
  initCategoryCards();
  initNavCategoryLinks();
  initAddButtons();
  initCheckout();
});