/* TAFAß PREMIUM UI V3 — presentation only. */
(()=>{
 'use strict';
 const LIMITS={post:520,comment:240,media:220};
 const trim=(el,limit,mode='normal')=>{
   if(!el||el.dataset.tfaTrimmed==='1') return;
   const raw=(el.textContent||'').trim();
   if(raw.length<=limit)return;
   el.dataset.tfaTrimmed='1';
   el.classList.add('tfa-long-text','is-collapsed');
   const b=document.createElement('button'); b.type='button'; b.className='tfa-expand-btn'; b.textContent='Voir plus'; b.setAttribute('aria-expanded','false');
   b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const c=el.classList.toggle('is-collapsed');b.textContent=c?'Voir plus':'Voir moins';b.setAttribute('aria-expanded',String(!c));});
   if(mode==='comment') el.parentElement.appendChild(b); else el.insertAdjacentElement('afterend',b);
 };
 function apply(){
   document.querySelectorAll('.post-text').forEach(x=>trim(x,LIMITS.post));
   document.querySelectorAll('.comment-row span').forEach(x=>trim(x,LIMITS.comment,'comment'));
   document.querySelectorAll('.media-tile b').forEach(x=>trim(x,LIMITS.media));
   document.querySelectorAll('.reel-tile>span').forEach(x=>{ if(x.dataset.tfaTrimmed==='1')return; const raw=(x.textContent||'').trim(); if(raw.length<=LIMITS.media)return; x.dataset.tfaTrimmed='1'; x.classList.add('tfa-long-text','is-collapsed'); });
 }
 let timer=0; const schedule=()=>{if(timer)return;timer=requestAnimationFrame(()=>{timer=0;apply()})};
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('click',e=>{const r=e.target.closest('.reel-tile');if(r&&e.target.closest('.tfa-expand-btn')){e.preventDefault();e.stopPropagation();}} ,true);
 document.addEventListener('DOMContentLoaded',schedule); window.addEventListener('load',schedule); schedule();
})();
