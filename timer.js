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

function playSound(){
  try{
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const master = audioCtx.createGain()
    master.gain.value = 0.8
    master.connect(audioCtx.destination)

    // create a short repeated pulse pattern using a sawtooth for bite
    const pulses = 10
    const pulseLength = 1000 // ms
    for(let i=0;i<pulses;i++){
      const t = audioCtx.currentTime + (i * (pulseLength/1000))
      const osc = audioCtx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = 660 - i*40
      const g = audioCtx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + (pulseLength/1000) - 0.05)
      osc.connect(g); g.connect(master)
      osc.start(t); osc.stop(t + (pulseLength/1000))
    }

    // fallback vibration
    if(navigator.vibrate) navigator.vibrate([400,200,400,200,800])
    // close audio context after a safe time
    setTimeout(()=>{ try{ audioCtx.close() }catch(e){} }, pulses * pulseLength + 200)
  }catch(e){
    // silent fail
    console.warn('alarm failed', e)
  }
}

  function stopSound(){
    try{ osc && osc.stop() }catch(e){}
    try{ audioCtx && audioCtx.close() }catch(e){}
    osc = null; audioCtx = null
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
