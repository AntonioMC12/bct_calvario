(() => {
  const key = 'calvario:tema';
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const system = matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['system','light','dark'].includes(value);

  function read() {
    try {
      const saved = localStorage.getItem(key);
      if (valid(saved)) return saved;
    } catch {
      // El tema funciona durante la sesión aunque el almacenamiento no esté disponible.
    }
    return 'system';
  }

  let preference = read();
  function apply() {
    const dark = preference === 'dark' || (preference === 'system' && system.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.themePreference = preference;
    meta.content = dark ? '#151413' : '#FAF7EF';
    const select = document.querySelector('#theme-choice');
    if (select) select.value = preference;
  }

  apply();
  system.addEventListener('change',apply);
  window.addEventListener('storage',event => {
    if (event.key !== key && event.key !== null) return;
    preference = read();
    apply();
  });
  document.addEventListener('change',event => {
    if (event.target.id !== 'theme-choice' || !valid(event.target.value)) return;
    preference = event.target.value;
    try { localStorage.setItem(key,preference); } catch {}
    apply();
  });
})();
