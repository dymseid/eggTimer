// custom.js - Complete, robust dial implementation
// Features:
// - Drag-to-change on the big center element (pointer/touch/mouse)
// - Single-click +/- increments by exactly 1
// - Press-and-hold to accelerate repeating increments (long-press)
// - Keyboard support (ArrowUp/Down, PageUp/PageDown, Home/End)
// - Start button navigates to timer with selected minutes
// - Back button returns to home
// - Small haptic feedback on change if supported
// - Uses your uploaded background image for the dial if present
// NOTE: If you changed element IDs/classes in HTML, adjust the selectors accordingly.

(function () {
  const centerEl = document.getElementById('dialCenter')
  const increaseBtn = document.getElementById('increase')
  const decreaseBtn = document.getElementById('decrease')
  const startBtn = document.getElementById('startCustom')
  const backBtn = document.getElementById('backCustom')
  const dialBg = document.querySelector('.dial-bg') // optional background element

  // If you uploaded a background image and want to use it, set its path here.
  // The developer-supplied local path (already in your project) is:
  const UPLOADED_BG_PATH = '/mnt/data/43d56428-9c97-434b-9734-f932de1a651d.png'
  if (dialBg) {
    dialBg.style.backgroundImage = `url("${UPLOADED_BG_PATH}")`
    dialBg.style.backgroundSize = 'cover'
    dialBg.style.backgroundPosition = 'center'
    dialBg.style.opacity = '0.06'
  }

  // Config
  const MIN = 0
  const MAX = 60
  const DEFAULT_VALUE = 0
  const SENSITIVITY = 10 // pixels per minute for drag (10px => 1 minute). Tweak to taste.
  const LONG_PRESS_DELAY = 420 // ms before long-press starts repeating
  const REPEAT_INTERVAL_INITIAL = 150 // ms repeating interval once long-press starts
  // You can tune acceleration by decreasing REPEAT_INTERVAL_INITIAL.

  // State
  let value = DEFAULT_VALUE
  let pointerActive = false
  let lastY = 0
  let velocityAccumulator = 0
  let longPressTimer = null
  let repeatInterval = null

  // Utility - clamp and set
  function clamp(v) {
    return Math.max(MIN, Math.min(MAX, v))
  }

  function formatValue(v) {
    return String(clamp(Math.round(v))).padStart(2, '0')
  }

  // Update display & aria; announce via vibration if announce=true
  function setValue(v, { announce = true } = {}) {
    const nv = clamp(Math.round(v))
    if (nv === value) return
    value = nv
    centerEl.textContent = formatValue(value)
    centerEl.setAttribute('aria-valuenow', String(value))
    if (announce && navigator.vibrate) {
      try { navigator.vibrate(8) } catch (e) { /* ignore */ }
    }
  }

  // Initialize display
  if (!centerEl) {
    console.error('custom.js: #dialCenter not found in DOM')
    // nothing else to do
    return
  }
  setValue(value, { announce: false })

  /* ---------------- Drag (pointer) handling ---------------- */
  function onPointerDown(e) {
    // only respond to primary pointer
    if (e.pointerType && e.button && e.button !== 0) return
    pointerActive = true
    lastY = (e.touches ? e.touches[0].clientY : (e.clientY !== undefined ? e.clientY : e.pageY))
    velocityAccumulator = 0
    // prevent text selection / default gestures
    if (e.preventDefault) e.preventDefault()
    // ensure focus for keyboard after pointer interactions
    centerEl.focus({ preventScroll: true })
  }

  function onPointerMove(e) {
    if (!pointerActive) return
    const y = (e.touches ? e.touches[0].clientY : (e.clientY !== undefined ? e.clientY : e.pageY))
    const dy = lastY - y // drag up => positive => increase minutes
    // Use a lightweight smoothing for velocity / sensitivity
    const delta = dy / SENSITIVITY
    // Apply change only when enough movement (avoid super tiny jitter)
    if (Math.abs(delta) >= 0.15) {
      setValue(value + delta)
      // update lastY to avoid huge jumps
      lastY = y
      // accumulate small velocity to allow a nudge on release
      velocityAccumulator = (velocityAccumulator * 0.6) + delta * 0.4
    }
  }

  function onPointerUp() {
    if (!pointerActive) return
    pointerActive = false
    // apply a small nudge based on accumulated velocity so quick flicks feel natural
    const nudge = Math.round(velocityAccumulator * 0.5)
    if (nudge !== 0) setValue(value + nudge)
    velocityAccumulator = 0
  }

  // Support both pointer events and touch fallback
  centerEl.addEventListener('pointerdown', onPointerDown, { passive: false })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp)

  // For older touch-only devices (defensive)
  centerEl.addEventListener('touchstart', (e) => onPointerDown(e), { passive: false })
  window.addEventListener('touchmove', (e) => onPointerMove(e), { passive: true })
  window.addEventListener('touchend', () => onPointerUp())

  /* ---------------- Plus / Minus with long-press accelerate (fixed) ---------------- */
  function clearLongPressState() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
    if (repeatInterval) {
      clearInterval(repeatInterval)
      repeatInterval = null
    }
  }

  function startLongPress(delta) {
    // Do not change value immediately here. A single click will call setValue via click handler.
    // After LONG_PRESS_DELAY, start repeating.
    clearLongPressState()
    longPressTimer = setTimeout(() => {
      // first immediate change at activation
      setValue(value + delta)
      // then start repeating quickly
      repeatInterval = setInterval(() => setValue(value + delta), REPEAT_INTERVAL_INITIAL)
    }, LONG_PRESS_DELAY)
  }

  // increase button handlers
  increaseBtn.addEventListener('pointerdown', (e) => {
    startLongPress(+1)
    if (e.preventDefault) e.preventDefault()
  }, { passive: false })
  increaseBtn.addEventListener('pointerup', () => clearLongPressState())
  increaseBtn.addEventListener('pointercancel', () => clearLongPressState())
  increaseBtn.addEventListener('pointerleave', () => clearLongPressState())
  // single click increments exactly by 1
  increaseBtn.addEventListener('click', (e) => {
    // stop any lingering long-press state first (defensive)
    clearLongPressState()
    setValue(value + 1)
  })

  // decrease button handlers
  decreaseBtn.addEventListener('pointerdown', (e) => {
    startLongPress(-1)
    if (e.preventDefault) e.preventDefault()
  }, { passive: false })
  decreaseBtn.addEventListener('pointerup', () => clearLongPressState())
  decreaseBtn.addEventListener('pointercancel', () => clearLongPressState())
  decreaseBtn.addEventListener('pointerleave', () => clearLongPressState())
  decreaseBtn.addEventListener('click', (e) => {
    clearLongPressState()
    setValue(value - 1)
  })

  /* ---------------- Keyboard support ---------------- */
  centerEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); setValue(value + 1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setValue(value - 1) }
    else if (e.key === 'PageUp') { e.preventDefault(); setValue(value + 10) }
    else if (e.key === 'PageDown') { e.preventDefault(); setValue(value - 10) }
    else if (e.key === 'Home') { e.preventDefault(); setValue(MIN) }
    else if (e.key === 'End') { e.preventDefault(); setValue(MAX) }
  })

  /* ---------------- Start / Back actions ---------------- */
  startBtn.addEventListener('click', () => {
    // navigate to timer page with selected minutes
    const mins = clamp(Math.round(value))
    location.href = `timer.html?mode=custom&mins=${mins}`
  })

  backBtn.addEventListener('click', () => {
    location.href = 'index.html'
  })

  /* ---------------- Accessibility & small polish ---------------- */
  // Make the element focusable if it isn't
  if (!centerEl.hasAttribute('tabindex')) centerEl.setAttribute('tabindex', '0')
  centerEl.setAttribute('role', 'spinbutton')
  centerEl.setAttribute('aria-valuemin', String(MIN))
  centerEl.setAttribute('aria-valuemax', String(MAX))
  centerEl.setAttribute('aria-valuenow', String(value))
  centerEl.style.userSelect = 'none'

  // ensure displayed value is in sync on load (in case CSS or fonts render late)
  window.addEventListener('load', () => setTimeout(() => setValue(value, { announce: false }), 40))

  // small visual "pop" animation on change (optional)
  let animTimeout = null
  const originalTransform = centerEl.style.transform || ''
  const animatePop = () => {
    centerEl.style.transition = 'transform 100ms ease'
    centerEl.style.transform = 'scale(1.06)'
    clearTimeout(animTimeout)
    animTimeout = setTimeout(() => {
      centerEl.style.transform = originalTransform
    }, 110)
  }
  // call pop animation on each value change
  const originalSetValue = setValue
  setValue = function (v, opts = {}) {
    const prev = value
    originalSetValue(v, opts)
    if (value !== prev) animatePop()
  }

  // cleanup on page unload (clear intervals)
  window.addEventListener('beforeunload', () => {
    clearLongPressState()
  })
})();
