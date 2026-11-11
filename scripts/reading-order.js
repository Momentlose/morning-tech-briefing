function setupReadingOrder({ getStories, onChange, notify }) {
  const storageKey = 'morningTechReadingOrder';
  const stories = document.querySelector('#stories');
  const dialog = document.querySelector('#readingOrderDialog');
  const list = dialog.querySelector('ol');
  let saved = readOrder();
  let scope = null;
  let hold;
  let drag;
  let ignoreClickUntil = 0;

  function readOrder() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (stored && typeof stored === 'object') return stored;
    } catch {}
    return {};
  }

  function ordered(items, source, key) {
    const name = source === null ? 'sources' : 'articles:' + source;
    const order = Object.hasOwn(saved, name) && Array.isArray(saved[name]) ? saved[name] : [];
    const positions = new Map(order.map((id, index) => [id, index]));
    return [...items].sort((a, b) => (positions.get(key(a)) ?? order.length) - (positions.get(key(b)) ?? order.length));
  }

  function open(source, selected) {
    if (dialog.open) return;
    scope = source;
    const entries = new Map();
    for (const story of getStories()) {
      const name = story.source || '其他来源';
      if (source === null) entries.set(name, name);
      else if (name === source && !entries.has(story.link)) entries.set(story.link, story.titleZh || story.title);
    }
    if (!entries.size) return;
    dialog.querySelector('h2').textContent = source === null ? '调整来源顺序' : '调整「' + source + '」的新闻顺序';
    list.replaceChildren();
    let selectedRow;
    for (const [id, title] of ordered(entries, source, entry => entry[0])) {
      const row = document.createElement('li');
      row.dataset.key = id;
      const handle = document.createElement('span');
      handle.className = 'order-handle';
      handle.textContent = '⠿';
      handle.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'order-label';
      label.textContent = title;
      row.append(handle, label);
      for (const [action, text, accessibleLabel] of [['top', '置顶', '置顶'], ['up', '↑', '上移'], ['down', '↓', '下移']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.move = action;
        button.textContent = text;
        button.setAttribute('aria-label', accessibleLabel + '：' + title);
        row.append(button);
      }
      if (id === selected) {
        row.classList.add('order-selected');
        selectedRow = row;
      }
      list.append(row);
    }
    dialog.showModal();
    list.scrollTop = 0;
    selectedRow?.scrollIntoView({ block: 'nearest' });
  }

  function targetFor(element) {
    const group = element.closest('.source-group');
    if (!group) return null;
    const article = element.closest('.story');
    if (article) return { source: group.dataset.source, key: article.dataset.link };
    if (element.closest('summary')) return { source: null, key: group.dataset.source };
    return null;
  }

  function cancelHold() {
    if (hold) clearTimeout(hold.timer);
    hold = null;
  }

  stories.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
    const target = targetFor(event.target);
    if (!target) return;
    cancelHold();
    hold = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      timer: setTimeout(() => {
        ignoreClickUntil = performance.now() + 800;
        cancelHold();
        open(target.source, target.key);
      }, 520)
    };
  });
  window.addEventListener('pointermove', event => {
    if (hold?.id === event.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10) cancelHold();
  }, { passive: true });
  window.addEventListener('pointerup', cancelHold);
  window.addEventListener('pointercancel', cancelHold);
  stories.addEventListener('contextmenu', event => {
    if (targetFor(event.target) && (hold || dialog.open || event.pointerType === 'touch')) event.preventDefault();
  });
  stories.addEventListener('click', event => {
    if (performance.now() < ignoreClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const button = event.target.closest('[data-order]');
    if (!button) return;
    open(button.dataset.order === 'sources' ? null : button.closest('.source-group').dataset.source);
  }, true);

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-move]');
    if (!button) return;
    const row = button.closest('li');
    if (button.dataset.move === 'top') list.prepend(row);
    if (button.dataset.move === 'up' && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
    if (button.dataset.move === 'down' && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
    button.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  });

  function moveDraggedRow() {
    if (!drag) return;
    const bounds = list.getBoundingClientRect();
    if (drag.y < bounds.top + 32) list.scrollTop -= 9;
    if (drag.y > bounds.bottom - 32) list.scrollTop += 9;
    const before = [...list.children].find(row => {
      if (row === drag.row) return false;
      const rect = row.getBoundingClientRect();
      return drag.y < rect.top + rect.height / 2;
    }) || null;
    if (drag.row.nextElementSibling !== before) list.insertBefore(drag.row, before);
    drag.frame = requestAnimationFrame(moveDraggedRow);
  }

  list.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.order-handle');
    if (!handle || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const row = handle.closest('li');
    list.setPointerCapture(event.pointerId);
    row.classList.add('order-dragging');
    drag = { id: event.pointerId, row, next: row.nextElementSibling, y: event.clientY };
    moveDraggedRow();
  });
  list.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) drag.y = event.clientY;
  });

  function endDrag(event) {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
    cancelAnimationFrame(drag.frame);
    drag.row.classList.remove('order-dragging');
    if (event.type === 'pointercancel') list.insertBefore(drag.row, drag.next);
    drag = null;
  }

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) list.addEventListener(type, endDrag);
  dialog.addEventListener('close', endDrag);
  dialog.querySelector('[data-save-order]').addEventListener('click', () => {
    const name = scope === null ? 'sources' : 'articles:' + scope;
    const next = { ...saved, [name]: [...list.children].map(row => row.dataset.key) };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      notify('无法保存顺序，请检查浏览器存储设置。');
      return;
    }
    saved = next;
    dialog.close();
    onChange();
    notify('已保存阅读顺序');
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    saved = readOrder();
    onChange();
  });
  return { ordered };
}
