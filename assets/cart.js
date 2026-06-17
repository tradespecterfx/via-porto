// ===== Via Porto — shared cart logic =====
// Cart is stored in localStorage as an array of:
// { id, name, material, price, size, qty, slug }

(function (window) {
  var STORAGE_KEY = 'viaporto_cart';

  function getCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    updateCartBadge();
  }

  function addToCart(item) {
    var cart = getCart();
    var existing = cart.find(function (i) {
      return i.id === item.id && i.size === item.size;
    });
    if (existing) {
      existing.qty += item.qty || 1;
    } else {
      cart.push({
        id: item.id,
        name: item.name,
        material: item.material,
        price: item.price,
        size: item.size,
        qty: item.qty || 1,
        slug: item.slug
      });
    }
    saveCart(cart);
    return cart;
  }

  function removeFromCart(id, size) {
    var cart = getCart().filter(function (i) {
      return !(i.id === id && i.size === size);
    });
    saveCart(cart);
    return cart;
  }

  function updateQty(id, size, qty) {
    var cart = getCart();
    var item = cart.find(function (i) { return i.id === id && i.size === size; });
    if (item) {
      item.qty = Math.max(1, qty);
      saveCart(cart);
    }
    return cart;
  }

  function clearCart() {
    saveCart([]);
  }

  function cartCount() {
    return getCart().reduce(function (sum, i) { return sum + i.qty; }, 0);
  }

  function cartTotal() {
    return getCart().reduce(function (sum, i) { return sum + i.price * i.qty; }, 0);
  }

  function updateCartBadge() {
    var badges = document.querySelectorAll('[data-cart-count]');
    var count = cartCount();
    badges.forEach(function (b) {
      b.textContent = count > 0 ? count : '';
      b.style.display = count > 0 ? 'inline-flex' : 'none';
    });
  }

  window.ViaPortoCart = {
    getCart: getCart,
    addToCart: addToCart,
    removeFromCart: removeFromCart,
    updateQty: updateQty,
    clearCart: clearCart,
    cartCount: cartCount,
    cartTotal: cartTotal,
    updateCartBadge: updateCartBadge
  };

  document.addEventListener('DOMContentLoaded', updateCartBadge);
})(window);
