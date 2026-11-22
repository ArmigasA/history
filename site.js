'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const secureContext = location.protocol === 'https:';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Only the consent choice and optional functional preferences are stored as cookies.
  function readCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const entry = document.cookie.split('; ').find(value => value.startsWith(prefix));
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
  }
  function writeCookie(name, value, maxAge = 31536000) {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secureContext ? '; Secure' : ''}`;
  }
  function removeCookie(name) { writeCookie(name, '', 0); }

  const cookieBanner = $('#cookie-banner');
  const cookieDialog = $('#cookie-dialog');
  const cookiePreferences = $('#cookie-preferences');
  const cookieStatus = $('#cookie-status');
  const cookieChoice = readCookie('armigas_cookie_choice');
  let preferencesAccepted = readCookie('armigas_cookie_preferences') === 'yes';
  cookieBanner.hidden = Boolean(cookieChoice);
  cookiePreferences.checked = preferencesAccepted;

  // Glossary popovers are positioned inside the visible viewport.
  const glossaryTriggers = $$('.glossary-trigger');
  function placeGlossaryTooltip(trigger) {
    const tooltip = document.getElementById(trigger.getAttribute('aria-describedby'));
    if (!tooltip) return;
    const anchor = trigger.getBoundingClientRect();
    const width = Math.min(290, window.innerWidth - 24);
    tooltip.style.width = `${width}px`;
    const tooltipHeight = tooltip.getBoundingClientRect().height;
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    let top = anchor.bottom + 9;
    if (top + tooltipHeight > window.innerHeight - 12) top = anchor.top - tooltipHeight - 9;
    top = Math.max(12, Math.min(top, window.innerHeight - tooltipHeight - 12));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  glossaryTriggers.forEach(trigger => {
    trigger.addEventListener('pointerenter', () => placeGlossaryTooltip(trigger));
    trigger.addEventListener('focus', () => placeGlossaryTooltip(trigger));
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
      glossaryTriggers.forEach(item => item.setAttribute('aria-expanded', 'false'));
      trigger.setAttribute('aria-expanded', String(!wasOpen));
      if (!wasOpen) placeGlossaryTooltip(trigger);
    });
  });
  document.addEventListener('click', () => glossaryTriggers.forEach(item => item.setAttribute('aria-expanded', 'false')));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') glossaryTriggers.forEach(item => item.setAttribute('aria-expanded', 'false'));
  });

  // Editor state is page-specific and stored as text values, never HTML.
  const pageKey = encodeURIComponent(location.pathname);
  const storageKey = `armiguense-editor-page-v3:${pageKey}`;
  const imageStorageKey = `armiguense-editor-images-v1:${pageKey}`;
  const effectsStorageKey = 'armiguense-effects-enabled-v1';
  const editorDialog = $('#editor-dialog');
  const editorStatus = $('#editor-status');
  const editorPassword = $('#editor-password');
  const editorPasswordError = $('#password-error');
  const editorWelcome = $('#editor-welcome');
  const editorPasswordStep = $('#editor-password-step');
  const editorToolbar = $('#edit-toolbar');
  const editorColor = $('#editor-color');
  const editorFontSize = $('#editor-font-size');
  const fontSizeOutput = $('#font-size-output');
  const imageFileInput = $('#editor-image-file');
  const imageAlignment = $('#image-alignment');
  const editorToast = $('#editor-toast');
  const textElements = $$('#contenido *')
    .filter(element => element.children.length === 0 && !element.closest('svg') && element.textContent.trim());
  const originalTextState = textElements.map(element => ({ text: element.textContent, color: '', size: '' }));
  let selectedText = null;
  let selectedImage = null;
  let userImages = [];
  let toastTimer;

  function setTextState(element, state) {
    if (!element || !state || typeof state.text !== 'string') return;
    element.textContent = state.text;
    const color = typeof state.color === 'string' && /^#[0-9a-f]{6}$/i.test(state.color) ? state.color : '';
    const size = Number(state.size);
    element.style.color = color;
    element.style.fontSize = Number.isFinite(size) && size >= 12 && size <= 36 ? `${size}px` : '';
  }
  function readSavedText() {
    if (!preferencesAccepted) return;
    try {
      const states = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(states)) states.forEach((state, index) => {
        if (typeof state === 'string') setTextState(textElements[index], { text: state });
        else setTextState(textElements[index], state);
      });
    } catch { localStorage.removeItem(storageKey); }
  }
  function makeUserImage(entry) {
    if (!entry || typeof entry.src !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/i.test(entry.src)) return null;
    const figure = document.createElement('figure');
    figure.className = 'user-added-illustration';
    figure.dataset.align = ['left', 'center', 'right'].includes(entry.align) ? entry.align : 'center';
    figure.dataset.imageId = entry.id;
    figure.tabIndex = 0;
    const image = document.createElement('img');
    image.src = entry.src;
    image.alt = typeof entry.alt === 'string' ? entry.alt.slice(0, 180) : 'Ilustración añadida al archivo';
    image.loading = 'lazy';
    const caption = document.createElement('figcaption');
    caption.textContent = typeof entry.caption === 'string' ? entry.caption.slice(0, 180) : 'Ilustración del Imperio Armiguense';
    figure.append(image, caption);
    figure.addEventListener('click', () => selectImage(figure));
    figure.addEventListener('focus', () => selectImage(figure));
    return figure;
  }
  function restoreSavedImages() {
    $$('.user-added-illustration').forEach(image => image.remove());
    userImages = [];
    if (!preferencesAccepted) return;
    try {
      const stored = JSON.parse(localStorage.getItem(imageStorageKey) || '[]');
      if (!Array.isArray(stored)) return;
      stored.forEach(entry => {
        const figure = makeUserImage(entry);
        if (!figure) return;
        const anchor = Number.isInteger(entry.anchorIndex) ? textElements[entry.anchorIndex] : null;
        const container = document.getElementById(entry.containerId) || $('#contenido');
        if (anchor && container.contains(anchor)) anchor.insertAdjacentElement('afterend', figure);
        else container.append(figure);
        userImages.push(entry);
      });
    } catch { localStorage.removeItem(imageStorageKey); }
  }
  readSavedText();
  restoreSavedImages();

  function showToast(message, error = false) {
    editorToast.textContent = message;
    editorToast.classList.toggle('is-error', error);
    editorToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { editorToast.hidden = true; }, 6000);
  }
  function setEditMode(enabled) {
    textElements.forEach(element => {
      if (enabled) element.setAttribute('contenteditable', 'plaintext-only');
      else element.removeAttribute('contenteditable');
    });
    document.body.classList.toggle('is-editing', enabled);
    editorToolbar.hidden = !enabled;
    if (!enabled) {
      selectedText?.classList.remove('editor-text-selected');
      selectedText = null;
      selectedImage?.classList.remove('editor-image-selected');
      selectedImage = null;
      editorColor.disabled = true;
      editorFontSize.disabled = true;
      imageAlignment.disabled = true;
    }
  }
  function selectText(element) {
    if (!document.body.classList.contains('is-editing')) return;
    selectedImage?.classList.remove('editor-image-selected');
    selectedImage = null;
    imageAlignment.disabled = true;
    selectedText?.classList.remove('editor-text-selected');
    selectedText = element;
    selectedText.classList.add('editor-text-selected');
    editorColor.disabled = false;
    editorFontSize.disabled = false;
    const rgb = getComputedStyle(element).color.match(/\d+/g)?.slice(0, 3).map(Number) || [238, 238, 238];
    editorColor.value = `#${rgb.map(part => part.toString(16).padStart(2, '0')).join('')}`;
    const size = Math.round(parseFloat(getComputedStyle(element).fontSize) || 16);
    editorFontSize.value = String(Math.max(12, Math.min(36, size)));
    fontSizeOutput.value = `${editorFontSize.value} px`;
  }
  function selectImage(figure) {
    if (!document.body.classList.contains('is-editing')) return;
    selectedText?.classList.remove('editor-text-selected');
    selectedText = null;
    editorColor.disabled = true;
    editorFontSize.disabled = true;
    selectedImage?.classList.remove('editor-image-selected');
    selectedImage = figure;
    selectedImage.classList.add('editor-image-selected');
    imageAlignment.disabled = false;
    imageAlignment.value = selectedImage.dataset.align || 'center';
  }
  textElements.forEach(element => {
    element.addEventListener('focus', () => selectText(element));
    element.addEventListener('click', () => selectText(element));
  });
  editorColor.addEventListener('input', () => { if (selectedText) selectedText.style.color = editorColor.value; });
  editorFontSize.addEventListener('input', () => {
    fontSizeOutput.value = `${editorFontSize.value} px`;
    if (selectedText) selectedText.style.fontSize = `${editorFontSize.value}px`;
  });
  imageAlignment.addEventListener('change', () => {
    if (!selectedImage) return;
    selectedImage.dataset.align = imageAlignment.value;
    const entry = userImages.find(item => item.id === selectedImage.dataset.imageId);
    if (entry) entry.align = imageAlignment.value;
  });
  imageFileInput.addEventListener('change', () => {
    const file = imageFileInput.files?.[0];
    imageFileInput.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1572864) {
      showToast('Elige PNG, JPEG o WebP de hasta 1,5 MB.', true);
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/i.test(reader.result)) {
        showToast('No se pudo leer esa imagen.', true);
        return;
      }
      const anchorIndex = selectedText ? textElements.indexOf(selectedText) : -1;
      const container = selectedText?.closest('.chapter-entry, .archive-section, .home-hero') || $('#contenido');
      const entry = { id: `editor-image-${Date.now()}-${userImages.length}`, src: reader.result, alt: file.name.replace(/[<>"']/g, '').slice(0, 120) || 'Ilustración añadida', caption: 'Ilustración del archivo', align: imageAlignment.value || 'center', anchorIndex, containerId: container.id || 'contenido' };
      const figure = makeUserImage(entry);
      if (selectedText) selectedText.insertAdjacentElement('afterend', figure);
      else container.append(figure);
      userImages.push(entry);
      selectImage(figure);
    });
    reader.addEventListener('error', () => showToast('No se pudo leer esa imagen.', true));
    reader.readAsDataURL(file);
  });

  $('#edit-text-button').addEventListener('click', () => {
    editorStatus.textContent = '';
    editorWelcome.hidden = false;
    editorPasswordStep.hidden = true;
    editorPassword.value = '';
    editorPasswordError.textContent = '';
    editorDialog.showModal();
  });
  $('#start-editing').addEventListener('click', () => {
    editorWelcome.hidden = true;
    editorPasswordStep.hidden = false;
    editorPassword.value = '';
    editorPasswordError.textContent = '';
    editorPassword.focus();
  });
  $('#password-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!editorPassword.value) { editorPasswordError.textContent = 'Escribe la contraseña para continuar.'; editorPassword.focus(); return; }
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(editorPassword.value));
      const enteredHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (enteredHash !== '292904cb78450683b381e1711743405809f4fb7a38544dbe5d73088556063130') {
        editorPassword.value = '';
        editorPasswordError.textContent = 'La contraseña no es correcta. Inténtalo de nuevo.';
        editorPassword.focus();
        return;
      }
      editorPasswordError.textContent = '';
      editorPasswordStep.hidden = true;
      editorWelcome.hidden = false;
      editorDialog.close();
      setEditMode(true);
      textElements[0]?.focus();
    } catch { editorPasswordError.textContent = 'No se pudo verificar el acceso en este navegador. Abre el sitio mediante HTTPS.'; }
  });
  $('#give-up').addEventListener('click', () => {
    editorPassword.value = '';
    editorPasswordStep.hidden = true;
    editorWelcome.hidden = false;
    editorDialog.close();
  });
  editorDialog.addEventListener('cancel', event => { if (!editorPasswordStep.hidden) event.preventDefault(); });

  // Cookie banner and settings.
  function saveCookieChoice(allowPreferences) {
    preferencesAccepted = allowPreferences;
    writeCookie('armigas_cookie_choice', 'saved');
    if (allowPreferences) writeCookie('armigas_cookie_preferences', 'yes');
    else {
      removeCookie('armigas_cookie_preferences');
      removeCookie('armiguense_effects');
      localStorage.removeItem(effectsStorageKey);
      for (const key of Object.keys(localStorage)) if (key.startsWith('armiguense-editor-page-v3:') || key.startsWith('armiguense-editor-images-v1:')) localStorage.removeItem(key);
      textElements.forEach((element, index) => setTextState(element, originalTextState[index]));
      userImages = [];
      restoreSavedImages();
      effectsEnabled = false;
      effectsEnabledForMotion = false;
      updateEffectsButton();
    }
    cookieBanner.hidden = true;
    cookieDialog.close();
    cookieStatus.textContent = '';
  }
  $('#accept-cookies').addEventListener('click', () => saveCookieChoice(true));
  $('#configure-cookies').addEventListener('click', () => {
    cookiePreferences.checked = preferencesAccepted;
    cookieStatus.textContent = '';
    cookieDialog.showModal();
  });
  $('#privacy-settings').addEventListener('click', () => {
    cookiePreferences.checked = preferencesAccepted;
    cookieStatus.textContent = '';
    cookieDialog.showModal();
  });
  $('#save-cookie-settings').addEventListener('click', () => saveCookieChoice(cookiePreferences.checked));
  $('#cancel-cookie-settings').addEventListener('click', () => cookieDialog.close());
  cookieDialog.addEventListener('cancel', event => event.preventDefault());

  // Effects can be remembered only after functional-preference consent.
  const effectsToggle = $('#effects-toggle');
  let effectsEnabled = preferencesAccepted && readCookie('armiguense_effects') === 'on';
  function updateEffectsButton() {
    effectsToggle.setAttribute('aria-pressed', String(effectsEnabled));
    effectsToggle.setAttribute('aria-label', effectsEnabled ? 'Efectos activados' : 'Efectos desactivados');
    effectsToggle.classList.toggle('is-active', effectsEnabled);
    document.body.classList.toggle('effects-on', effectsEnabled);
  }
  updateEffectsButton();
  effectsToggle.addEventListener('click', () => {
    effectsEnabled = !effectsEnabled;
    if (preferencesAccepted) {
      if (effectsEnabled) writeCookie('armiguense_effects', 'on');
      else removeCookie('armiguense_effects');
    }
    updateEffectsButton();
  });

  // Confirmed saves are local to this browser; the site has no server-side write API.
  const saveConfirmation = $('#save-confirmation');
  $('#save-edits').addEventListener('click', () => saveConfirmation.showModal());
  $('#reject-save').addEventListener('click', () => saveConfirmation.close());
  function colorToHex(color) {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    const channels = color.match(/\d+/g)?.slice(0, 3).map(Number);
    return channels?.length === 3 ? `#${channels.map(part => Math.max(0, Math.min(255, part)).toString(16).padStart(2, '0')).join('')}` : '';
  }
  function captureTextState() {
    return textElements.map(element => ({ text: element.textContent, color: colorToHex(element.style.color), size: Number.parseInt(element.style.fontSize, 10) || '' }));
  }
  $('#confirm-save').addEventListener('click', () => {
    if (!preferencesAccepted) {
      saveConfirmation.close();
      cookiePreferences.checked = true;
      cookieStatus.textContent = 'Activa las preferencias funcionales para guardar los cambios en este dispositivo.';
      cookieDialog.showModal();
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(captureTextState()));
      localStorage.setItem(imageStorageKey, JSON.stringify(userImages));
      saveConfirmation.close();
      setEditMode(false);
      showToast('Cambios guardados en este navegador.');
    } catch { showToast('No se pudieron guardar los cambios. Reduce el tamaño o la cantidad de imágenes.', true); }
  });
  $('#discard-edits').addEventListener('click', () => {
    textElements.forEach((element, index) => setTextState(element, originalTextState[index]));
    readSavedText();
    restoreSavedImages();
    setEditMode(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('is-editing')) {
      textElements.forEach((element, index) => setTextState(element, originalTextState[index]));
      readSavedText();
      restoreSavedImages();
      setEditMode(false);
    }
  });

  // Interactive visual effects.
  let effectsEnabledForMotion = effectsEnabled;
  function burstParticles(x, y, amount = 24, hue = 'red') {
    if (reduceMotion.matches) return;
    for (let index = 0; index < amount; index++) {
      const particle = document.createElement('i');
      const angle = Math.random() * Math.PI * 2;
      const distance = 30 + Math.random() * 78;
      particle.className = `interaction-particle ${hue}`;
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      particle.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
      particle.style.setProperty('--particle-size', `${5 + Math.random() * 5}px`);
      particle.style.setProperty('--duration', `${650 + Math.random() * 550}ms`);
      document.body.appendChild(particle);
      particle.addEventListener('animationend', () => particle.remove(), { once: true });
    }
  }
  const rainbowTimers = new WeakMap();
  function animateRainbow(element, initialLetter = false) {
    if (!element || reduceMotion.matches) return;
    const className = initialLetter ? 'is-rainbow-initial' : 'is-rainbow';
    clearTimeout(rainbowTimers.get(element));
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    rainbowTimers.set(element, setTimeout(() => element.classList.remove(className), 15000));
  }
  function sendNavigationStar(origin, destination, onArrive) {
    if (reduceMotion.matches) { onArrive?.(); return; }
    const star = document.createElement('i');
    star.className = 'navigation-star';
    star.setAttribute('aria-hidden', 'true');
    document.body.appendChild(star);
    const started = performance.now();
    let lastTrail = 0;
    function travel(now) {
      const progress = Math.min(1, (now - started) / 1900);
      const eased = 1 - Math.pow(1 - progress, 3);
      const bounds = destination?.getBoundingClientRect();
      const endX = bounds ? Math.max(22, Math.min(window.innerWidth - 22, bounds.left + bounds.width / 2)) : window.innerWidth / 2;
      const endY = bounds ? Math.max(22, Math.min(window.innerHeight - 22, bounds.top + Math.min(bounds.height / 2, 54))) : window.innerHeight / 2;
      const x = origin.x + (endX - origin.x) * eased;
      const y = origin.y + (endY - origin.y) * eased;
      star.style.left = `${x - 19}px`;
      star.style.top = `${y - 19}px`;
      star.style.transform = `rotate(${progress * 405}deg) scale(${.86 + Math.sin(progress * Math.PI) * .5})`;
      if (now - lastTrail > 36) { burstParticles(x, y, 4, 'violet'); lastTrail = now; }
      if (progress < 1) requestAnimationFrame(travel);
      else { burstParticles(x, y, 24, 'violet'); star.remove(); onArrive?.(); }
    }
    requestAnimationFrame(travel);
  }
  document.addEventListener('click', event => {
    if (document.body.classList.contains('is-editing')) {
      const contentLink = event.target.closest('#contenido a[href]');
      if (contentLink) event.preventDefault();
    }
    if (!effectsEnabledForMotion || event.target.closest('#effects-toggle')) return;
    const textTarget = event.target.closest('.dropcap, .home-hero h1');
    if (textTarget) animateRainbow(textTarget, textTarget.matches('.dropcap'));
    const control = event.target.closest('button, a[href], input, select, .toolbar-image-button');
    if (!control) return;
    const bounds = control.getBoundingClientRect();
    const origin = event.detail && (event.clientX || event.clientY)
      ? { x: event.clientX, y: event.clientY }
      : { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    burstParticles(origin.x, origin.y, 26, 'red');
    animateRainbow($('.home-hero h1'));
    if (control.matches('a[href]')) {
      let url;
      try { url = new URL(control.href, location.href); } catch { return; }
      const sameSite = url.origin === location.origin;
      const samePage = sameSite && url.pathname === location.pathname;
      if (samePage && url.hash) {
        const destination = document.getElementById(decodeURIComponent(url.hash.slice(1)));
        if (!destination) return;
        event.preventDefault();
        try { history.pushState(null, '', url.hash); } catch { location.hash = url.hash; }
        sendNavigationStar(origin, destination);
        destination.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      } else if (sameSite && url.pathname !== location.pathname) {
        event.preventDefault();
        sendNavigationStar(origin, null, () => location.assign(url.href));
      }
    }
  }, true);
  effectsToggle.addEventListener('click', () => { effectsEnabledForMotion = effectsEnabled; });
})();
