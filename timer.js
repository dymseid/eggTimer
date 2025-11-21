// timer page logic: reads ?mode=...&mins=...
(function(){
  function qs(name){
    return new URLSearchParams(location.search).get(name)
  }
  const mode = qs('mode') || 'custom'
  const mins = Number(qs('mins') || 0)
  const timeText = document.getElementById('timeText')
  const modeTitle = document.getElementById('modeTitle')
  const backBtn = document.getElementById('backBtn')
  const pauseBtn = document.getElementById('pause')
  const stopBtn = document.getElementById('stop')

  let totalMs = mins * 60 * 1000
  let endAt = 0, ticker = null, paused = false, remaining = totalMs
  let audioCtx = null, osc = null
  let scheduledOscs = []      // keep references to oscillators we create
  let fallbackAudio = null    // fallback <audio> element (rarely used)

  modeTitle.textContent = mode.charAt(0).toUpperCase() + mode.slice(1)
  // show big initial time
  function format(ms){
    if(ms < 0) ms = 0
    const s = Math.floor(ms / 1000)
    const mm = Math.floor(s/60).toString().padStart(2,'0')
    const ss = (s%60).toString().padStart(2,'0')
    return `${mm}:${ss}`
  }
  function updateDisplay(ms){
    const timeText = document.getElementById('timeText')
    const yolkOverlay = document.getElementById('yolkOverlay')
    const formatted = format(ms)
    if(timeText) timeText.textContent = formatted
    if(yolkOverlay) yolkOverlay.textContent = formatted
  }

  function start(){
    if(totalMs <= 0) return
    endAt = Date.now() + remaining
    clearInterval(ticker)
    ticker = setInterval(tick, 200)
    paused = false
    pauseBtn.textContent = 'Pause'
    updateDisplay(remaining)
  }
  function tick(){
    remaining = endAt - Date.now()
    if(remaining <= 0){
      finish()
      return
    }
    updateDisplay(remaining)
  }
  function pause(){
    if(paused) return
    paused = true
    clearInterval(ticker)
    pauseBtn.textContent = 'Resume'
  }
  function resume(){
    if(!paused) return
    endAt = Date.now() + remaining
    paused = false
    pauseBtn.textContent = 'Pause'
    ticker = setInterval(tick, 200)
  }
  function stop(){
    clearInterval(ticker); remaining = totalMs; updateDisplay(totalMs); stopSound()
    pauseBtn.textContent = 'Pause'
  }
  function finish(){
    clearInterval(ticker); remaining = 0; updateDisplay(0)
    playSound()
    navigator.vibrate && navigator.vibrate([200,80,200])
  }

  // ====== ENABLE / UNLOCK AUDIO ======
  // Creates a small on-screen button (if not present) that the user must tap to enable sound.
function ensureEnableButton() {
  if (document.getElementById('enableSoundBtn')) return;

  const container = document.getElementById('controls') || document.body;

  const btn = document.createElement('button');
  btn.id = 'enableSoundBtn';
  btn.className = 'btn';
  btn.textContent = 'Enable Sound';

  btn.style.marginTop = '18px';

  container.appendChild(btn);

  const handler = async (e) => {
    e.stopPropagation();
    await unlockAudio();

    try { btn.removeEventListener('click', handler); } catch (e) {}
    btn.remove();
  };

  btn.addEventListener('click', handler);
}

  // Unlock and initialize the top-level audio context using a direct user gesture.
  async function unlockAudio(){
    if(audioCtx && audioCtx.state !== 'closed'){
      // try to resume if suspended
      try{ await audioCtx.resume() }catch(e){}
      return
    }
    try{
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      // Play a tiny silent buffer to satisfy the gesture requirement
      try{
        const buffer = audioCtx.createBuffer(1, 1, 22050)
        const src = audioCtx.createBufferSource()
        src.buffer = buffer
        src.connect(audioCtx.destination)
        src.start(0)
        src.stop(0.01)
      }catch(e){
        // Some browsers like a very short oscillator instead
        try{
          const g = audioCtx.createGain(); g.gain.setValueAtTime(0.0001, audioCtx.currentTime)
          const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 440
          o.connect(g); g.connect(audioCtx.destination)
          o.start()
          o.stop(audioCtx.currentTime + 0.01)
        }catch(e){}
      }
      // ensure running
      try{ await audioCtx.resume() }catch(e){}
    }catch(e){
      console.warn('unlockAudio failed', e)
      audioCtx = null
    }
  }

  // ====== PLAY SOUND (uses global audioCtx) ======
  function playSound(){
    try{
      // If there's no audioCtx yet, give it one last try (but this will often be blocked)
      if(!audioCtx){
        try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)() }catch(e){ audioCtx = null }
      }
      // If it's suspended, attempt resume
      if(audioCtx && audioCtx.state === 'suspended'){
        audioCtx.resume().catch(()=>{})
      }

      if(audioCtx){
        const master = audioCtx.createGain()
        master.gain.value = 0.8
        master.connect(audioCtx.destination)

        // create a short repeated pulse pattern using a sawtooth for bite
        const pulses = 10
        const pulseLength = 1000 // ms
        scheduledOscs = [] // reset the list
        for(let i=0;i<pulses;i++){
          const t = audioCtx.currentTime + (i * (pulseLength/1000))
          const o = audioCtx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = 660 - i*40
          const g = audioCtx.createGain()
          g.gain.setValueAtTime(0.0001, t)
          g.gain.exponentialRampToValueAtTime(0.6, t + 0.02)
          g.gain.exponentialRampToValueAtTime(0.0001, t + (pulseLength/1000) - 0.05)
          o.connect(g); g.connect(master)
          o.start(t); o.stop(t + (pulseLength/1000))
          scheduledOscs.push(o)
        }

        // close audio context after a safe time (but not immediately so stopSound can stop)
        setTimeout(()=>{ try{ audioCtx.close(); audioCtx = null }catch(e){} }, pulses * pulseLength + 300)
        // fallback vibration (kept)
        if(navigator.vibrate) navigator.vibrate([400,200,400,200,800])
        return
      }

      // If we reach here audioCtx wasn't available/allowed. Try the <audio> fallback.
      if(!fallbackAudio){
        // small beep via data URI - generate a short WAV beep (sine) programmatically is complex,
        // so attempt to load a short hosted file if you have one. Here we create a minimal silent audio element
        fallbackAudio = new Audio()
        fallbackAudio.loop = true
        fallbackAudio.playsInline = true
        // If you have a hosted beep file you can set fallbackAudio.src = '/beep.mp3'
        // For now, attempt to play (this may fail if autoplay blocked)
      }
      fallbackAudio.play().catch((e)=>{ console.warn('fallback audio failed', e) })
      if(navigator.vibrate) navigator.vibrate([400,200,400])
    }catch(e){
      // silent fail
      console.warn('alarm failed', e)
    }
  }

  // ====== STOP SOUND ======
  function stopSound(){
    try{
      // Stop scheduled oscillators
      if(scheduledOscs && scheduledOscs.length){
        scheduledOscs.forEach(o=>{
          try{ o.stop() }catch(e){}
        })
        scheduledOscs = []
      }
    }catch(e){}
    try{
      // Close audio context if exists
      if(audioCtx && audioCtx.state !== 'closed'){
        audioCtx.close().catch(()=>{})
      }
    }catch(e){}
    try{
      if(fallbackAudio){
        try{ fallbackAudio.pause() }catch(e){}
        fallbackAudio = null
      }
    }catch(e){}
    osc = null; audioCtx = null
  }

  // wire up controls
  pauseBtn.addEventListener('click', ()=>{
    if(paused) resume()
    else pause()
  })
  stopBtn.addEventListener('click', stop)
  backBtn.addEventListener('click', ()=> location.href = 'index.html')

  // Wire a passive unlock attempt: if user interacts with pause/start/stop we try to unlock audio silently.
  function oneTimeUnlockListener(e){
    unlockAudio().finally(()=> {
      try{ document.removeEventListener('click', oneTimeUnlockListener) }catch(e){}
      try{ document.removeEventListener('touchstart', oneTimeUnlockListener) }catch(e){}
    })
  }
  document.addEventListener('click', oneTimeUnlockListener, { once: true })
  document.addEventListener('touchstart', oneTimeUnlockListener, { once: true })

  // Create enable button so user has an obvious control if passive unlock fails.
  ensureEnableButton()

  // init display & start
  totalMs = mins * 60 * 1000
  remaining = totalMs
  updateDisplay(remaining)
  // auto-start when coming from index/custom
  if(totalMs > 0) start()
})();
