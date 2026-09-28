const Templates = (function() {
  let templates = {};
  let activeTemplate = null;
  let styleEl = null;

  function register(name, css, render) {
    templates[name] = { name, css, render };
  }

  function activate(name) {
    const tpl = templates[name];
    if (!tpl) return;

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tpl-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = tpl.css || '';

    activeTemplate = name;

    if (tpl.render) {
      const preview = document.getElementById('resumePreview');
      if (preview) preview.className = 'resume-page';
      window.updatePreview = tpl.render;
      updatePreview();
    }
  }

  function getActive() { return activeTemplate; }
  function getAll() { return Object.keys(templates); }

  return { register, activate, getActive, getAll };
})();
