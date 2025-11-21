// small script to add subtle interactions (not required)
document.addEventListener('DOMContentLoaded', ()=>{
  // nothing fancy needed — links handle navigation
  // but we can add a quick ripple on press
  document.querySelectorAll('.mode-card').forEach(el=>{
    el.addEventListener('pointerdown', ()=> el.style.transform='scale(0.99)')
    el.addEventListener('pointerup', ()=> el.style.transform='')
    el.addEventListener('pointerleave', ()=> el.style.transform='')
  })
})
