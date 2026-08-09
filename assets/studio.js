(() => {
  const root = document.documentElement;
  const themeToggle = document.querySelector('.theme-toggle');
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  const accountButton = document.querySelector('[data-account-button]');
  const accountMenu = document.querySelector('[data-account-menu]');
  const toast = document.querySelector('.toast');
  let toastTimer;

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  };
  const syncTheme = () => {
    const dark = root.dataset.theme === 'dark';
    themeToggle?.setAttribute('aria-pressed', String(dark));
    themeToggle?.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  };
  syncTheme();
  themeToggle?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('studio-theme', root.dataset.theme);
    syncTheme();
  });
  navToggle?.addEventListener('click', () => {
    const open = nav?.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(Boolean(open)));
  });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  }));
  accountButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = accountButton.getAttribute('aria-expanded') === 'true';
    accountButton.setAttribute('aria-expanded', String(!open));
    if (accountMenu) accountMenu.hidden = open;
  });
  document.addEventListener('click', (event) => {
    if (!accountMenu || accountMenu.hidden || accountMenu.contains(event.target)) return;
    accountMenu.hidden = true;
    accountButton?.setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll('[data-demo-action]').forEach((control) => control.addEventListener('click', () => showToast(`${control.dataset.demoAction} will be enabled in a later release.`)));

  const models = {
    image: [
      { id: 'braids-real', name: 'Braids Real', note: 'Lifelike results', price: .12 },
      { id: 'braids-vision', name: 'Braids Vision', note: 'More visual control', price: .18 },
      { id: 'braids-fast', name: 'Braids Fast', note: 'Quick drafts', price: .06 }
    ],
    video: [
      { id: 'braids-motion', name: 'Braids Motion', note: 'Natural 5-second motion', price: 1 },
      { id: 'braids-motion-pro', name: 'Braids Motion Pro', note: 'Detailed movement', price: 1.8 },
      { id: 'braids-fast-video', name: 'Braids Fast', note: 'Fast preview', price: .75 }
    ]
  };
  const modelOptions = document.querySelector('[data-model-options]');
  const modeButtons = [...document.querySelectorAll('[data-mode]')];
  const prompt = document.querySelector('#prompt-input');
  const quantityValue = document.querySelector('[data-quantity-value]');
  const unitPrice = document.querySelector('[data-unit-price]');
  const totalPrice = document.querySelector('[data-total-price]');
  const generatePrice = document.querySelector('[data-generate-price]');
  const generateButton = document.querySelector('[data-generate]');
  let mode = 'image';
  let selectedModel = models.image[0];
  let quantity = 1;
  const money = (number) => `€${number.toFixed(2)}`;
  const syncPrice = () => {
    const total = selectedModel.price * quantity;
    if (unitPrice) unitPrice.textContent = money(selectedModel.price);
    if (totalPrice) totalPrice.textContent = money(total);
    if (generatePrice) generatePrice.textContent = `· ${money(total)}`;
    if (quantityValue) quantityValue.textContent = String(quantity);
  };
  const renderModels = () => {
    if (!modelOptions) return;
    selectedModel = models[mode][0];
    modelOptions.innerHTML = models[mode].map((item, index) => `<label class="model-option"><input type="radio" name="studio-model" value="${item.id}" ${index === 0 ? 'checked' : ''}><span><strong>${item.name}</strong><small>${item.note}</small></span><em>${money(item.price)}<br>${mode === 'video' ? 'per 5 sec' : 'per image'}</em></label>`).join('');
    modelOptions.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => {
      selectedModel = models[mode].find((item) => item.id === input.value) || models[mode][0];
      syncPrice();
    }));
    syncPrice();
  };
  modeButtons.forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    modeButtons.forEach((item) => item.classList.toggle('is-active', item === button));
    if (prompt) prompt.placeholder = mode === 'video' ? 'A slow cinematic camera move through a city after rain…' : 'A cinematic portrait on a quiet beach at golden hour…';
    quantity = 1;
    renderModels();
  }));
  document.querySelectorAll('[data-quantity]').forEach((button) => button.addEventListener('click', () => {
    quantity += button.dataset.quantity === 'plus' ? 1 : -1;
    quantity = Math.max(1, Math.min(mode === 'video' ? 2 : 4, quantity));
    syncPrice();
  }));
  const upload = document.querySelector('#reference-upload');
  const uploadPreview = document.querySelector('.upload-preview');
  const uploadThumb = document.querySelector('.upload-thumb');
  const uploadName = document.querySelector('.upload-name');
  let uploadUrl;
  upload?.addEventListener('change', () => {
    const file = upload.files?.[0];
    if (!file || !uploadPreview || !uploadThumb || !uploadName) return;
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    uploadUrl = URL.createObjectURL(file);
    uploadThumb.style.backgroundImage = `url("${uploadUrl}")`;
    uploadName.textContent = file.name;
    uploadPreview.hidden = false;
  });
  document.querySelector('[data-remove-upload]')?.addEventListener('click', () => {
    if (upload) upload.value = '';
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    if (uploadPreview) uploadPreview.hidden = true;
  });
  document.querySelectorAll('[data-template]').forEach((control) => control.addEventListener('click', () => {
    if (prompt) prompt.value = control.dataset.templatePrompt || '';
    const targetMode = control.dataset.templateMode || 'image';
    modeButtons.find((button) => button.dataset.mode === targetMode)?.click();
    showToast(`${control.dataset.template} selected. Upload one photo to continue.`);
    document.querySelector('.prompt-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  generateButton?.addEventListener('click', () => {
    if (!prompt?.value.trim()) { prompt?.focus(); return showToast('Describe what you want to create first.'); }
    const original = generateButton.innerHTML;
    generateButton.disabled = true;
    generateButton.textContent = 'Preparing preview…';
    setTimeout(() => {
      generateButton.disabled = false;
      generateButton.innerHTML = original;
      showToast('Preview ready. Live model generation will be connected later.');
    }, 700);
  });
  if (modelOptions) renderModels();

  const galleryPieces = [...document.querySelectorAll('[data-gallery-category]')];
  const galleryFilterButtons = [...document.querySelectorAll('[data-gallery-filter]')];
  galleryFilterButtons.forEach((button) => button.addEventListener('click', () => {
    const category = button.dataset.galleryFilter;
    galleryFilterButtons.forEach((item) => item.classList.toggle('is-active', item === button));
    galleryPieces.forEach((piece) => {
      piece.hidden = category !== 'all' && piece.dataset.galleryCategory !== category;
    });
  }));
})();
