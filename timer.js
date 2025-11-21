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
  // audioCtx and osc will be used by WebAudio fallback (kept as in your original file)
  let audioCtx = null, osc = null

  // Developer-uploaded local path (will be transformed by environment to usable URL).
  // This is the file path from your session — replace with "alarm.mp3" when you add a real mp3 to the folder.
  const DEV_ALARM_PATH = '/mnt/data/43d56428-9c97-434b-9734-f932de1a651d.png'

  // Ensure there's an <audio id="alarmAudio"> element; if not, create one silently.
  let audioEl = document.getElementById('alarmAudio')
  if(!audioEl){
    audioEl = document.createElement('audio')
    audioEl.id = 'alarmAudio'
    audioEl.preload = 'auto'
    // append but keep no controls — invisible to users
    document.body.appendChild(audioEl)
  }
  // set src to the developer file path (environment will map it). If you put alarm.mp3 in project,
  // change DEV_ALARM_PATH to 'alarm.mp3' later.
  audioEl.src = DEV_ALARM_PATH

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

  //
  // Mobile-friendly audio unlocking + alarm logic
  //
  // Some mobile browsers block WebAudio/autoplay until a user gesture occurs.
  // We resume/create an AudioContext on first user gesture so fallback tones will play.
  window._audioUnlocked = window._audioUnlocked || false
  window._audioCtxGlobal = window._audioCtxGlobal || null

  function unlockAudioIfNeeded(){
    if(window._audioUnlocked) return Promise.resolve(true)
    try{
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if(!AudioCtx){ window._audioUnlocked = true; return Promise.resolve(true) }
      if(!window._audioCtxGlobal) window._audioCtxGlobal = new AudioCtx()
      // resume if suspended
      if(window._audioCtxGlobal.state === 'suspended' && typeof window._audioCtxGlobal.resume === 'function'){
        return window._audioCtxGlobal.resume().then(()=> {
          window._audioUnlocked = true
          // try quick play/pause of audio element to satisfy some browsers
          try{
            const p = audioEl.play()
            if(p && typeof p.then === 'function'){
              p.then(()=>{ audioEl.pause(); audioEl.currentTime = 0 }).catch(()=>{})
            }
          }catch(e){}
          return true
        }).catch((e)=> {
          console.warn('AudioContext resume rejected:', e)
          return false
        })
      } else {
        window._audioUnlocked = true
        return Promise.resolve(true)
      }
    }catch(e){
      console.warn('unlockAudioIfNeeded error', e)
      return Promise.resolve(false)
    }
  }

  // Listen to first user gesture (tap/click/keydown) to unlock audio context for mobile
  window.addEventListener('pointerdown', unlockAudioIfNeeded, { once:true, passive:true })
  window.addEventListener('touchstart', unlockAudioIfNeeded, { once:true, passive:true })
  window.addEventListener('keydown', unlockAudioIfNeeded, { once:true, passive:true })

  // Try to play audioEl first, fallback to Mobile-friendly WebAudio pulse
  function playSound(){
    // stop any existing tones first
    stopSound()

    // prefer HTMLAudio element if it has a src
    try{
      if(audioEl && audioEl.src){
        // ensure unlocked then try to play
        unlockAudioIfNeeded().then(()=>{
          try{
            audioEl.loop = true
            audioEl.volume = 0.95
            const p = audioEl.play()
            if(p && typeof p.then === 'function'){
              p.then(()=> {
                // playing succeeded
                // nothing else to do
              }).catch((err)=>{
                console.warn('audio element play rejected, falling back to WebAudio:', err)
                playToneFallback()
              })
            }
          }catch(err){
            console.warn('audio element play error, fallback to tone', err)
            playToneFallback()
          }
        }).catch(()=> {
          // if unlock failed, still try tone fallback
          playToneFallback()
        })
        return
      }
    }catch(e){
      console.warn('audio element attempt error', e)
    }

    // fallback
    unlockAudioIfNeeded().then(()=> playToneFallback()).catch(()=> playToneFallback())
  }

  // Mobile-friendly WebAudio fallback: creates continuous pulsing using setInterval
  function playToneFallback(){
    try{
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if(!AudioContext){
        console.warn('No AudioContext available')
        return
      }

      // reuse global audio context if present (helps mobile)
      audioCtx = window._audioCtxGlobal || new AudioContext()
      window._audioCtxGlobal = audioCtx

      // if suspended, resume
      if(audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function'){
        audioCtx.resume().catch(()=>{})
      }

      // master gain
      const master = audioCtx.createGain()
      master.gain.value = 0.0001
      master.connect(audioCtx.destination)
      window._alarmMaster = master

      // two oscillators to create a harsher sound
      const osc1 = audioCtx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.value = 880
      const osc2 = audioCtx.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 660
      const g1 = audioCtx.createGain(); g1.gain.value = 0.0001
      const g2 = audioCtx.createGain(); g2.gain.value = 0.0001
      osc1.connect(g1); g1.connect(master)
      osc2.connect(g2); g2.connect(master)

      osc1.start(); osc2.start()
      // store refs
      osc = [osc1, osc2]

      // Create a pulsing function that ramps gains quickly then back down
      function pulse(){
        const now = audioCtx.currentTime
        g1.gain.cancelScheduledValues(now); g2.gain.cancelScheduledValues(now)
        g1.gain.setValueAtTime(0.0001, now)
        g1.gain.exponentialRampToValueAtTime(0.28, now + 0.02)
        g1.gain.exponentialRampToValueAtTime(0.0001, now + 1.0)

        g2.gain.setValueAtTime(0.0001, now)
        g2.gain.exponentialRampToValueAtTime(0.22, now + 0.02)
        g2.gain.exponentialRampToValueAtTime(0.0001, now + 1.0)
      }

      // first pulse immediately
      pulse()
      // repeat every 1100ms until stopped
      window._alarmPulseInterval = setInterval(pulse, 1100)

      if(navigator.vibrate) navigator.vibrate([400,200,400,200,800])
    }catch(e){
      console.warn('playToneFallback error', e)
    }
  }

  function stopSound(){
    // stop audio element if playing
    try{
      if(audioEl){
        audioEl.pause()
        audioEl.currentTime = 0
        audioEl.loop = false
      }
    }catch(e){}

    // stop WebAudio pulse/oscillators
    try{
      if(window._alarmPulseInterval){ clearInterval(window._alarmPulseInterval); window._alarmPulseInterval = null }
      if(osc){
        if(Array.isArray(osc)){
          osc.forEach(o=>{ try{o.stop()}catch(e){} })
        }else{
          try{ osc.stop() }catch(e){}
        }
      }
      if(window._alarmMaster){ try{ window._alarmMaster.disconnect() }catch(e){}; window._alarmMaster = null }
      // do NOT forcibly close the global audioCtx (window._audioCtxGlobal) — leaving it helps reuse on mobile.
      // but close if you explicitly want to cleanup:
      // if(audioCtx){ try{ audioCtx.close() }catch(e){}; audioCtx = null }
      osc = null
    }catch(e){ console.warn('stopSound error', e) }
  }

  // wire up controls
  pauseBtn.addEventListener('click', ()=>{
    if(paused) resume()
    else pause()
  })
  stopBtn.addEventListener('click', stop)
  backBtn.addEventListener('click', ()=> location.href = 'index.html')

  // init display & start
  totalMs = mins * 60 * 1000
  remaining = totalMs
  updateDisplay(remaining)
  // auto-start when coming from index/custom
  if(totalMs > 0) start()
})();
