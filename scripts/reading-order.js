function setupReadingOrder({ getStories, onChange, notify }) {
  const storageKey = 'morningTechReadingOrder';
  const stories = document.querySelector('#stories');
  const filters = document.querySelector('#filters');
  const bottom = document.querySelector('.bottom');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const slideAnimations = new WeakMap();
  let saved = readOrder();
  let mode;
  let hold;
  let drag;
  let settle;
  let ignoreClickUntil = 0;

  function readOrder() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      if (value && typeof value === 'object') return value;
    } catch {}
    return {};
  }

  function orderKey(source) {
    return source === null ? 'sources' : 'articles:' + source;
  }

  function ordered(items, source, key) {
    const value = saved[orderKey(source)];
    const order = Array.isArray(value) ? value : [];
    const positions = new Map(order.map((id, index) => [id, index]));
    return [...items].sort((a, b) => (positions.get(key(a)) ?? order.length) - (positions.get(key(b)) ?? order.length));
  }

  function rows(list) {
    const selector = list.matches('.source-groups') ? '.source-group' : '.story';
    return [...list.children].filter(item => item.matches(selector));
  }

  function sourceOf(list) {
    return list.closest('.source-group')?.dataset.source ?? null;
  }

  function save(list) {
    const source = sourceOf(list);
    const visible = rows(list).map(item => source === null ? item.dataset.source : item.dataset.link);
    const known = getStories().map(item => source === null ? item.source || '其他来源' : item);
    const ids = source === null ? known : known.filter(item => (item.source || '其他来源') === source).map(item => item.link);
    const visibleIds = new Set(visible);
    let index = 0;
    const order = ordered(new Set([...ids, ...visible]), source, id => id)
      .map(id => visibleIds.has(id) ? visible[index++] : id);
    saved = { ...saved, [orderKey(source)]: order };
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
      notify('已保存阅读顺序');
    } catch {
      notify('顺序已调整，浏览器未能保存');
    }
  }

  function enter(list, button, anchor) {
    if (mode?.list === list) return;
    leave();
    const top = anchor?.getBoundingClientRect().top;
    mode = { list, button };
    list.classList.add('is-ordering');
    stories.classList.add('is-reordering');
    if (button) {
      button.dataset.label = button.textContent;
      button.textContent = '完成';
      button.setAttribute('aria-pressed', 'true');
      for (const article of rows(list).filter(item => item.matches('.story'))) article.tabIndex = 0;
    }
    if (anchor) window.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: 'instant' });
  }

  function leave(anchor) {
    if (!mode) return;
    const top = anchor?.getBoundingClientRect().top;
    for (const item of rows(mode.list)) slideAnimations.get(item)?.cancel();
    mode.list.classList.remove('is-ordering');
    stories.classList.remove('is-reordering');
    if (mode.button) {
      mode.button.textContent = mode.button.dataset.label;
      mode.button.setAttribute('aria-pressed', 'false');
      for (const article of rows(mode.list).filter(item => item.matches('.story'))) article.removeAttribute('tabindex');
    }
    mode = null;
    if (anchor?.isConnected) window.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: 'instant' });
  }

  function getItem(target) {
    if (!(target instanceof Element)) return null;
    const article = target.closest('.story');
    if (article) return article;
    return target.closest('summary')?.closest('.source-group') || null;
  }

  function move(item, before) {
    if (item === before || item.nextElementSibling === before) return;
    const list = item.parentElement;
    const siblings = rows(list).filter(row => row !== item);
    const positions = reducedMotion.matches ? [] : siblings.map(row => [row, row.getBoundingClientRect().top]);
    for (const row of siblings) slideAnimations.get(row)?.cancel();
    list.insertBefore(item, before);
    for (const [row, top] of positions) {
      const distance = top - row.getBoundingClientRect().top;
      if (Math.abs(distance) > 1) slideAnimations.set(row, row.animate(
        [{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }],
        { duration: 190, easing: 'cubic-bezier(.2,.75,.25,1)' }
      ));
    }
  }

  function createLift(item, bounds) {
    const lift = item.cloneNode(true);
    if (lift.matches('.source-group')) {
      lift.open = false;
      lift.querySelector('.source-content').remove();
    }
    lift.classList.add('order-lift');
    lift.setAttribute('aria-hidden', 'true');
    lift.inert = true;
    for (const element of lift.querySelectorAll('[id]')) element.removeAttribute('id');
    Object.assign(lift.style, {
      left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px'
    });
    document.body.append(lift);
    return lift;
  }

  function frame() {
    if (!drag) return;
    const top = Math.max(0, filters.getBoundingClientRect().top <= 0 ? filters.getBoundingClientRect().bottom : 0);
    const bottomEdge = Math.min(innerHeight, bottom.getBoundingClientRect().top);
    if (drag.moved) {
      const edge = 54;
      if (drag.y < top + edge) window.scrollBy({ top: -Math.min(19, (top + edge - drag.y) / 3), behavior: 'instant' });
      if (drag.y > bottomEdge - edge) window.scrollBy({ top: Math.min(19, (drag.y - bottomEdge + edge) / 3), behavior: 'instant' });
      const list = drag.item.parentElement;
      const center = drag.y - drag.offset + drag.bounds.height / 2;
      const listTop = list.getBoundingClientRect().top;
      const before = rows(list).find(row => row !== drag.item && center < listTop + row.offsetTop + row.offsetHeight / 2) || null;
      move(drag.item, before);
    }
    drag.yOffset = drag.y - drag.offset - drag.bounds.top;
    drag.lift.style.transform = `translate3d(0,${drag.yOffset}px,0)`;
    drag.frame = requestAnimationFrame(frame);
  }

  function beginDrag(item, id, y) {
    if (!item.isConnected || drag) return;
    const anchor = item.matches('.source-group') ? item.querySelector('summary') : item;
    const offset = y - anchor.getBoundingClientRect().top;
    enter(item.parentElement, null, anchor);
    try {
      stories.setPointerCapture(id);
    } catch {
      if (!mode.button) leave(anchor);
      return;
    }
    const listBounds = item.parentElement.getBoundingClientRect();
    const bounds = {
      left: listBounds.left + item.offsetLeft,
      top: listBounds.top + item.offsetTop,
      width: item.offsetWidth,
      height: item.offsetHeight
    };
    drag = { item, anchor, id, offset, y, startY: y, bounds, next: item.nextElementSibling, lift: createLift(item, bounds), yOffset: 0, moved: false };
    item.classList.add('order-slot');
    frame();
  }

  function finishDrag(commit, animate = true) {
    if (!drag) return;
    const current = drag;
    drag = null;
    cancelAnimationFrame(current.frame);
    if (stories.hasPointerCapture(current.id)) stories.releasePointerCapture(current.id);
    ignoreClickUntil = performance.now() + 360;
    const { item, anchor, lift, bounds } = current;
    const list = item.parentElement;
    if (!commit && list) move(item, current.next);
    const changed = commit && list && item.nextElementSibling !== current.next;
    if (changed) save(list);
    const cleanup = () => {
      settle = null;
      lift.remove();
      item.classList.remove('order-slot');
      if (mode && !mode.button) leave(anchor);
    };
    if (!animate || reducedMotion.matches || !item.isConnected) {
      cleanup();
      return;
    }
    const slot = item.getBoundingClientRect();
    const animation = lift.animate([
      { transform: `translate3d(0,${current.yOffset}px,0)` },
      { transform: `translate3d(0,${slot.top - bounds.top}px,0)` }
    ], { duration: 180, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' });
    settle = () => { animation.cancel(); cleanup(); };
    animation.onfinish = cleanup;
  }

  function cancelHold() {
    if (hold) clearTimeout(hold.timer);
    hold = null;
  }

  function cancel() {
    cancelHold();
    finishDrag(false, false);
    settle?.();
    leave();
  }

  stories.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    ignoreClickUntil = 0;
    settle?.();
    if (event.target.closest('button')) return;
    const item = getItem(event.target);
    if (!item || rows(item.parentElement).length < 2) return;
    cancelHold();
    const { pointerId, clientX, clientY } = event;
    if (mode?.list === item.parentElement) {
      event.preventDefault();
      beginDrag(item, pointerId, clientY);
      return;
    }
    hold = { id: pointerId, x: clientX, y: clientY, timer: setTimeout(() => {
      cancelHold();
      beginDrag(item, pointerId, clientY);
    }, 500) };
  });
  window.addEventListener('pointermove', event => {
    if (hold?.id === event.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10) cancelHold();
    if (drag?.id === event.pointerId) {
      drag.y = event.clientY;
      drag.moved ||= Math.abs(event.clientY - drag.startY) > 4;
    }
  }, { passive: true });
  // A touch that starts in reading mode can still become a drag after the hold timer.
  stories.addEventListener('touchmove', event => {
    if (drag && event.cancelable) event.preventDefault();
  }, { passive: false });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    window.addEventListener(type, event => {
      if (hold?.id === event.pointerId) cancelHold();
      if (drag?.id === event.pointerId) finishDrag(type === 'pointerup');
    });
  }
  window.addEventListener('blur', cancel);
  stories.addEventListener('contextmenu', event => {
    if (getItem(event.target) && (hold || drag || mode || event.pointerType === 'touch')) event.preventDefault();
  });
  stories.addEventListener('click', event => {
    const button = event.target.closest('[data-order]');
    if (button) {
      if (mode?.button === button) cancel();
      else {
        cancel();
        const list = button.dataset.order === 'sources' ? stories.querySelector('.source-groups') : button.closest('.source-content');
        if (rows(list).length > 1) enter(list, button);
      }
      return;
    }
    const item = getItem(event.target);
    if ((event.detail > 0 && performance.now() < ignoreClickUntil) || (item && mode?.list === item.parentElement)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  stories.addEventListener('keydown', event => {
    if (!mode || drag) return;
    if (event.key === 'Escape') { cancel(); return; }
    const item = getItem(event.target);
    if (!item || item.parentElement !== mode.list || event.target.closest('button,a')) return;
    const items = rows(mode.list);
    const index = items.indexOf(item);
    const before = { ArrowUp: items[index - 1], ArrowDown: index < items.length - 1 ? items[index + 2] || null : item, Home: items[0] }[event.key];
    if (before === undefined) return;
    event.preventDefault();
    if (before === item || item.nextElementSibling === before) return;
    move(item, before);
    event.target.focus({ preventScroll: true });
    item.scrollIntoView({ block: 'nearest' });
    save(mode.list);
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    saved = readOrder();
    onChange();
  });
  return { ordered, cancel };
}
