
/* ============================================================
   TAFAß PREMIUM UI V2 — UI-only enhancement
   No Supabase/Auth/Realtime calls. No database writes.
   ============================================================ */
(()=>{"use strict";
 const MAX={post:620,comment:260,media:300};
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 function addToggle(el, limit){
   if(!el || el.dataset.tfaTrimmed==="1") return;
   const raw=(el.textContent||"").trim();
   if(raw.length<=limit) return;
   el.dataset.tfaTrimmed="1";
   el.classList.add("tfa-long-text","is-collapsed");
   const b=document.createElement("button");
   b.type="button"; b.className="tfa-expand-btn"; b.textContent="Voir plus";
   b.setAttribute("aria-expanded","false");
   b.addEventListener("click",()=>{
     const collapsed=el.classList.toggle("is-collapsed");
     b.textContent=collapsed?"Voir plus":"Voir moins";
     b.setAttribute("aria-expanded",String(!collapsed));
   });
   el.insertAdjacentElement("afterend",b);
 }
 function apply(){
   document.querySelectorAll(".post-text").forEach(e=>addToggle(e,MAX.post));
   document.querySelectorAll(".comment-row span").forEach(e=>addToggle(e,MAX.comment));
   document.querySelectorAll(".reel-tile>span").forEach(e=>{
     const raw=(e.textContent||"").trim();
     if(raw.length>MAX.media && !e.dataset.tfaTrimmed){
       e.dataset.tfaTrimmed="1";
       e.style.webkitLineClamp="3";
       const b=document.createElement("button");
       b.type="button"; b.className="tfa-expand-btn";
       b.style.cssText="position:absolute;z-index:3;bottom:5px;right:10px;margin:0;color:#fff!important";
       b.textContent="Voir plus";
       b.onclick=()=>{const on=e.dataset.open==="1";e.dataset.open=on?"0":"1";e.style.webkitLineClamp=on?"3":"unset";b.textContent=on?"Voir plus":"Voir moins";};
       e.parentElement.appendChild(b);
     }
   });
   document.querySelectorAll(".media-tile b").forEach(e=>addToggle(e,MAX.media));
 }
 let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()});}
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
 document.addEventListener("DOMContentLoaded",schedule);
 window.addEventListener("load",schedule);
 schedule();
})();
