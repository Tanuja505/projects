// ===== Garden Cafe: Cart + LocalStorage Auth =====
const CART_KEY   = 'garden_cafe_cart_v1';
const USER_KEY   = 'garden_cafe_user_v1';
const USERS_DB   = 'garden_cafe_users_db';   // all registered users
const ORDERS_KEY = 'garden_cafe_orders_v1';  // order history

// ---------- Element refs ----------
const searchForm     = document.querySelector('.search-form-container');
const cart           = document.querySelector('.shopping-cart-container');
const loginForm      = document.querySelector('.login-form-container');
const navbar         = document.querySelector('.header .navbar');
const loginBtnWrapper = document.getElementById('login-btn');

document.querySelector('#search-btn').onclick = () => {
  searchForm.classList.toggle('active');
  cart.classList.remove('active');
  loginForm.classList.remove('active');
  navbar.classList.remove('active');
};
document.querySelector('#cart-btn').onclick = () => {
  cart.classList.toggle('active');
  searchForm.classList.remove('active');
  loginForm.classList.remove('active');
  navbar.classList.remove('active');
};
document.querySelector('#login-btn').onclick = () => {
  loginForm.classList.toggle('active');
  searchForm.classList.remove('active');
  cart.classList.remove('active');
  navbar.classList.remove('active');
  showLoginForm();
};
document.querySelector('#menu-btn').onclick = () => {
  navbar.classList.toggle('active');
  searchForm.classList.remove('active');
  cart.classList.remove('active');
  loginForm.classList.remove('active');
};
window.addEventListener('scroll', () => { navbar.classList.remove('active'); });

// ---------- Users "database" (localStorage) ----------
const getAllUsers = () => {
  try { return JSON.parse(localStorage.getItem(USERS_DB) || '[]'); } catch { return []; }
};
const saveAllUsers = (users) => localStorage.setItem(USERS_DB, JSON.stringify(users));

const findUserByEmail = (email) =>
  getAllUsers().find(u => u.email === email.toLowerCase().trim());

const createUser = ({ name, email, phone, address, password }) => {
  const users = getAllUsers();
  const newUser = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    address: address.trim(),
    passwordHash: btoa(unescape(encodeURIComponent(password))), // simple obfuscation
    role: 'customer',
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveAllUsers(users);
  return newUser;
};

// ---------- Session helpers ----------
const getSession = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
};
const setSession = (user) => {
  const { passwordHash, ...safe } = user; // never store password in session
  localStorage.setItem(USER_KEY, JSON.stringify(safe));
};
const clearSession = () => localStorage.removeItem(USER_KEY);

// ---------- Orders "database" ----------
const getOrders = () => {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); } catch { return []; }
};
const saveOrder = (order) => {
  const orders = getOrders();
  orders.push(order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  return order;
};

// ---------- Cart ----------
const loadCart = () => {
  try { const raw = localStorage.getItem(CART_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
};
const saveCart = (items) => localStorage.setItem(CART_KEY, JSON.stringify(items));
let cartItems = loadCart();

const cartItemsEl     = document.getElementById('cart-items');
const cartCountEl     = document.querySelector('.cart-count');
const cartSubtotalEl  = document.getElementById('cart-subtotal');
const cartTotalEl     = document.getElementById('cart-total');
const emptyCartEl     = document.getElementById('empty-cart-msg');
const toastEl         = document.getElementById('toast');
const formatPrice     = (n) => `$${Number(n).toFixed(2)}`;

const renderCart = () => {
  cartItemsEl.innerHTML = '';
  if (cartItems.length === 0) emptyCartEl.classList.add('show');
  else emptyCartEl.classList.remove('show');

  cartItems.forEach((item, index) => {
    const box = document.createElement('div');
    box.className = 'box';
    box.innerHTML = `
      <i class="fas fa-times close-icon"></i>
      <img src="${item.image}" alt="${item.name}">
      <div class="content">
        <h3>${item.name}</h3>
        <div class="qty-controls">
          <button class="qty-decrease">-</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-increase">+</button>
        </div>
        <div class="price">${formatPrice(item.price * item.qty)}</div>
      </div>
    `;
    box.querySelector('.close-icon').onclick   = () => removeItem(index);
    box.querySelector('.qty-increase').onclick = () => updateQty(index, 1);
    box.querySelector('.qty-decrease').onclick = () => updateQty(index, -1);
    cartItemsEl.appendChild(box);
  });

  const totalQty = cartItems.reduce((s, i) => s + i.qty, 0);
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  cartCountEl.textContent = totalQty;
  cartCountEl.classList.toggle('hidden', totalQty === 0);
  cartSubtotalEl.textContent = formatPrice(subtotal);
  cartTotalEl.textContent    = formatPrice(subtotal);
};

const showToast = (msg) => {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2500);
};

const addToCart = ({ name, price, image }) => {
  const existing = cartItems.find(i => i.name === name);
  if (existing) existing.qty += 1;
  else cartItems.push({ name, price: parseFloat(price), image, qty: 1 });
  saveCart(cartItems);
  renderCart();
  showToast(`${name} added to cart`);
};
const updateQty = (index, delta) => {
  const item = cartItems[index]; if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cartItems.splice(index, 1);
  saveCart(cartItems); renderCart();
};
const removeItem = (index) => { cartItems.splice(index, 1); saveCart(cartItems); renderCart(); };

document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    addToCart({
      name:  btn.getAttribute('data-name'),
      price: btn.getAttribute('data-price'),
      image: btn.getAttribute('data-image'),
    });
  });
});

// ---------- Checkout → Order Confirmation ----------
document.getElementById('checkout-btn').addEventListener('click', e => {
  e.preventDefault();
  if (cartItems.length === 0) { showToast('Your cart is empty'); return; }
  if (!getSession()) {
    showToast('Please login to place an order');
    loginForm.classList.add('active');
    showLoginForm();
    return;
  }
  openOrderConfirmation();
});

// ---------- Order Confirmation Modal ----------
const orderModal    = document.getElementById('order-modal');
const orderItemsList = document.getElementById('order-items-list');
const orderTotalEl  = document.getElementById('order-modal-total');
const orderUserEl   = document.getElementById('order-user-name');
const orderAddrEl   = document.getElementById('order-delivery-addr');
const orderIdEl     = document.getElementById('order-id');
const orderTimeEl   = document.getElementById('order-time');

const openOrderConfirmation = () => {
  const user     = getSession();
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const orderId  = 'GC-' + Date.now().toString(36).toUpperCase();
  const now      = new Date();

  // Populate modal
  orderIdEl.textContent   = orderId;
  orderTimeEl.textContent = now.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  orderUserEl.textContent = user.name;
  orderAddrEl.textContent = user.address;
  orderTotalEl.textContent = formatPrice(subtotal);

  orderItemsList.innerHTML = cartItems.map(item => `
    <div class="order-item-row">
      <img src="${item.image}" alt="${item.name}">
      <div class="order-item-info">
        <span class="order-item-name">${item.name}</span>
        <span class="order-item-qty">× ${item.qty}</span>
      </div>
      <span class="order-item-price">${formatPrice(item.price * item.qty)}</span>
    </div>
  `).join('');

  // Persist order
  saveOrder({
    id: orderId,
    userId: user.id,
    items: [...cartItems],
    total: subtotal,
    placedAt: now.toISOString(),
    status: 'confirmed',
  });

  orderModal.classList.add('active');
  cart.classList.remove('active');
};

document.getElementById('order-modal-close').addEventListener('click', () => {
  orderModal.classList.remove('active');
  cartItems = [];
  saveCart(cartItems);
  renderCart();
});

document.getElementById('order-modal-ok').addEventListener('click', () => {
  orderModal.classList.remove('active');
  cartItems = [];
  saveCart(cartItems);
  renderCart();
  showToast('🎉 Thank you! Your order is on its way.');
});

// Close modal on backdrop click
orderModal.addEventListener('click', e => {
  if (e.target === orderModal) {
    orderModal.classList.remove('active');
    cartItems = [];
    saveCart(cartItems);
    renderCart();
  }
});

// ---------- Login/Signup UI ----------
const loginFormEl   = document.getElementById('login-form');
const signupFormEl  = document.getElementById('signup-form');
const accountFormEl = document.getElementById('account-form');
const loginErr      = document.getElementById('login-error');
const signupErr     = document.getElementById('signup-error');
const signupOk      = document.getElementById('signup-success');

const showLoginForm = () => {
  if (getSession()) { renderAccount(); return; }
  loginFormEl.classList.add('active');
  signupFormEl.classList.remove('active');
  accountFormEl.classList.remove('active');
  clearFormMessages();
};
const showSignupForm = () => {
  loginFormEl.classList.remove('active');
  signupFormEl.classList.add('active');
  accountFormEl.classList.remove('active');
  clearFormMessages();
};
const clearFormMessages = () => {
  [loginErr, signupErr, signupOk].forEach(el => {
    if (el) { el.textContent = ''; el.classList.remove('show'); }
  });
};

const renderAccount = () => {
  const user = getSession();
  if (!user) {
    loginBtnWrapper.classList.remove('logged-in');
    showLoginForm();
    return;
  }
  loginBtnWrapper.classList.add('logged-in');
  loginFormEl.classList.remove('active');
  signupFormEl.classList.remove('active');
  accountFormEl.classList.add('active');
  document.getElementById('account-name').textContent    = user.name    || '';
  document.getElementById('account-email').textContent   = user.email   || '';
  document.getElementById('account-phone').textContent   = user.phone   || '';
  document.getElementById('account-address').textContent = user.address || '';

  // Show order count if available
  const orders = getOrders().filter(o => o.userId === user.id);
  const orderCountEl = document.getElementById('account-order-count');
  if (orderCountEl) orderCountEl.textContent = orders.length;
};

document.getElementById('show-signup').addEventListener('click', e => { e.preventDefault(); showSignupForm(); });
document.getElementById('show-login').addEventListener('click',  e => { e.preventDefault(); showLoginForm();  });

// ---------- Login submit ----------
loginFormEl.addEventListener('submit', e => {
  e.preventDefault();
  clearFormMessages();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    loginErr.textContent = 'Please enter email and password';
    loginErr.classList.add('show');
    return;
  }

  const user = findUserByEmail(email);
  if (!user) {
    loginErr.textContent = 'No account found with this email. Please sign up first.';
    loginErr.classList.add('show');
    return;
  }

  // Verify password (compare stored obfuscated value)
  const inputHash = btoa(unescape(encodeURIComponent(password)));
  if (user.passwordHash !== inputHash) {
    loginErr.textContent = 'Incorrect password. Please try again.';
    loginErr.classList.add('show');
    return;
  }

  setSession(user);
  showToast(`Welcome back, ${user.name}! 👋`);
  renderAccount();
});

// ---------- Signup submit ----------
signupFormEl.addEventListener('submit', e => {
  e.preventDefault();
  clearFormMessages();

  const payload = {
    name:     document.getElementById('signup-name').value.trim(),
    email:    document.getElementById('signup-email').value.trim(),
    phone:    document.getElementById('signup-phone').value.trim(),
    address:  document.getElementById('signup-address').value.trim(),
    password: document.getElementById('signup-password').value,
  };

  if (!payload.name || !payload.email || !payload.phone || !payload.address || !payload.password) {
    signupErr.textContent = 'All fields are required.';
    signupErr.classList.add('show');
    return;
  }
  if (payload.password.length < 6) {
    signupErr.textContent = 'Password must be at least 6 characters.';
    signupErr.classList.add('show');
    return;
  }
  if (findUserByEmail(payload.email)) {
    signupErr.textContent = 'An account with this email already exists. Please login.';
    signupErr.classList.add('show');
    return;
  }

  const newUser = createUser(payload);
  setSession(newUser);
  showToast(`Account created! Welcome, ${newUser.name}! 🎉`);
  renderAccount();
});

// ---------- Logout ----------
document.getElementById('logout-btn').addEventListener('click', e => {
  e.preventDefault();
  clearSession();
  loginBtnWrapper.classList.remove('logged-in');
  showToast('Logged out successfully');
  loginForm.classList.remove('active');
  showLoginForm();
});

// ---------- On-load ----------
renderCart();
renderAccount();
