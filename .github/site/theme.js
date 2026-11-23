(() => {
  const key = 'epp-book.theme';
  const root = document.documentElement;
  let select;

  function apply(value) {
    if (value === 'dark' || value === 'light') {
      root.dataset.theme = value;
    } else {
      delete root.dataset.theme;
    }
    if (select) select.value = root.dataset.theme || 'system';
  }

  function restore() {
    try {
      apply(localStorage.getItem(key));
    } catch {
      // The current page can still switch themes when storage is unavailable.
    }
  }

  restore();
  document.addEventListener('DOMContentLoaded', () => {
    select = document.querySelector('.theme-select');
    select.value = root.dataset.theme || 'system';
    select.closest('label').hidden = false;
    select.addEventListener('change', () => {
      apply(select.value);
      try {
        if (select.value === 'system') localStorage.removeItem(key);
        else localStorage.setItem(key, select.value);
      } catch {
        // Keep the chosen appearance for this visit.
      }
    });
  });
  window.addEventListener('pageshow', restore);
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) restore();
  });
})();
