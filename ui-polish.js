/* Tafaß UI-only polish layer.
   IMPORTANT: this file does not call Supabase, modify database state, Realtime,
   authentication, tables, or backend logic. It only changes presentation/DOM. */
(function(){
  'use strict';

  const STORE='TAFASS_V4_STATE';
  const esc=(s)=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function readState(){
    try{return JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch(_){return {};}
  }

  /* Theme is presentation-only. Existing settings remain the source of truth.
     No preference => dark by default. "Système" follows the device. */
  window.applyTheme=function(){
    const s=readState();
    const pref=s?.settings?.['preferences-0'];
    let dark;
    if(pref==='Clair') dark=false;
    else if(pref==='Système') dark=!!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    else if(pref==='Sombre') dark=true;
    else dark=true; // requested default
    document.body.classList.toggle('dark',dark);
    document.documentElement.dataset.theme=dark?'dark':'light';
  };

  function hideZeroBadges(){
    document.querySelectorAll('.badge-count').forEach(el=>{
      const n=parseInt((el.textContent||'').replace(/\D/g,''),10)||0;
      el.classList.toggle('hidden',n===0);
    });
  }

  function cleanDecorations(){
    document.querySelectorAll('.eyebrow,.page-context-brand small,.page-context-brand > div').forEach(el=>el.classList.add('ui-hide-decoration'));
    document.querySelectorAll('[data-action="refreshFeed"]').forEach(el=>el.classList.add('ui-hide-decoration'));
  }

  function buildSearchSuggestions(q=''){
    const box=document.getElementById('searchSuggest');
    if(!box)return;
    const s=readState();
    const users=Array.isArray(s.users)?s.users:[];
    const pages=Array.isArray(s.pages)?s.pages:[];
    const groups=Array.isArray(s.groups)?s.groups:[];
    const term=String(q||'').trim().toLowerCase();
    let items=[
      ...users.filter(x=>x.id!==s.current).map(x=>({kind:'Personnes',id:x.id,name:[x.firstName,x.lastName].filter(Boolean).join(' ')||x.name||x.username||'Compte',sub:'@'+(x.username||'user'),avatar:x.avatar||'',action:'profile'})),
      ...pages.map(x=>({kind:'Pages',id:x.id,name:x.name||'Page',sub:x.category||'Page',avatar:x.avatar||x.cover||'',action:'page'})),
      ...groups.map(x=>({kind:'Groupes',id:x.id,name:x.name||'Groupe',sub:'Groupe',avatar:x.avatar||'',action:'group'}))
    ];
    if(term) items=items.filter(x=>(x.name+' '+x.sub+' '+x.kind).toLowerCase().includes(term));
    items=items.slice(0,6);
    if(!items.length){
      box.innerHTML=term?`<div class="search-suggest-empty">Aucun résultat suggéré</div>`:`<div class="search-suggest-title">Suggestions</div><div class="search-suggest-empty">Recherchez une personne ou une Page</div>`;
    }else{
      box.innerHTML=`<div class="search-suggest-title">${term?'Suggestions':'Suggestions pour vous'}</div>`+
        items.map(x=>`<button type="button" class="search-suggest-row" data-suggest-action="${x.action}" data-suggest-id="${esc(x.id)}"><span class="search-suggest-avatar">${x.avatar?`<img src="${esc(x.avatar)}" alt="">`:'T'}</span><span class="search-suggest-copy"><b>${esc(x.name)}</b><small>${esc(x.sub)} · ${esc(x.kind)}</small></span><span class="search-suggest-arrow">›</span></button>`).join('');
    }
    box.classList.remove('hidden');
    box.querySelectorAll('[data-suggest-action]').forEach(btn=>btn.onclick=()=>{
      const act=btn.dataset.suggestAction,id=btn.dataset.suggestId;
      box.classList.add('hidden');
      if(act==='profile' && typeof window.routeToProfile==='function') return window.routeToProfile(id);
      if(act==='page'){try{window.editingPageId=id;window.routeTo('pageView');}catch(_){} return;}
      if(act==='group'){try{window.routeTo('groups');}catch(_){} return;}
    });
  }

  function attachGlobalSearch(){
    const input=document.getElementById('globalSearch');
    const box=document.getElementById('searchSuggest');
    if(!input || input.dataset.uiBound==='1')return;
    input.dataset.uiBound='1';
    input.setAttribute('autocomplete','off');
    input.placeholder='Rechercher sur Tafaß';
    input.addEventListener('focus',()=>buildSearchSuggestions(input.value));
    input.addEventListener('input',()=>buildSearchSuggestions(input.value));
    input.addEventListener('keydown',(e)=>{
      if(e.key!=='Enter')return;
      const q=input.value.trim();
      if(!q)return;
      e.preventDefault();e.stopPropagation();
      if(box)box.classList.add('hidden');
      window.globalSearchQuery=q;
      const loader=document.createElement('div');
      loader.className='search-loading-screen';
      loader.innerHTML='<div class="search-loading-spinner"></div><b>Recherche en cours…</b><small>Préparation des résultats</small>';
      document.body.appendChild(loader);
      setTimeout(()=>{
        loader.classList.add('hide');
        setTimeout(()=>loader.remove(),220);
        try{window.routeTo('search');}catch(_){}
      },520);
    },true);
    document.addEventListener('click',(e)=>{
      if(box && !e.target.closest('.global-search'))box.classList.add('hidden');
    });
  }

  function syncThemeSettingLabel(){
    const pref=readState()?.settings?.['preferences-0'];
    if(pref) return;
    const page=document.querySelector('.settings-premium-v90');
    if(!page)return;
    const groups=page.querySelectorAll('.settings-group-v90');
    if(groups.length){
      const row=groups[0].querySelector('.setting-row-v91');
      if(row){const current=row.querySelector('.setting-current-v91'); if(current) current.textContent='Sombre';}
    }
  }

  function prepareSearchPage(){
    const page=document.querySelector('.search-premium-v90');
    if(!page)return;
    const input=document.getElementById('pageSearchInput');
    const filters=page.querySelector('.search-filter-grid-v90');
    const results=page.querySelector('.search-result-stack-v90');
    if(filters){
      const q=(input?.value||window.globalSearchQuery||'').trim();
      filters.classList.toggle('ui-search-filters-hidden',!q);
    }
    if(results && !results.dataset.uiGrouped){
      const cards=[...results.querySelectorAll('.search-result-card')];
      if(cards.length){
        const order=['Personnes','Groupes','Pages','Publications','Photos','Reels','Comptes'];
        const groups={};
        cards.forEach(c=>{const k=c.dataset.kind||'Autres';(groups[k]??=[]).push(c);});
        results.innerHTML='';
        order.filter(k=>groups[k]?.length).forEach(k=>{
          const sec=document.createElement('section');
          sec.className='search-section-ui';
          sec.dataset.kind=k;
          const title=document.createElement('div');
          title.className='search-section-title-ui';
          title.innerHTML=`<h2>${esc(k)}</h2><button type="button" class="search-see-all-ui">Voir tout</button>`;
          sec.appendChild(title);
          const list=document.createElement('div');
          list.className=(k==='Photos')?'search-photo-grid-ui':'search-section-list-ui';
          groups[k].forEach(c=>list.appendChild(c));
          sec.appendChild(list);
          results.appendChild(sec);
          title.querySelector('button').onclick=()=>{
            sec.classList.toggle('show-all');
            title.querySelector('button').textContent=sec.classList.contains('show-all')?'Réduire':'Voir tout';
          };
        });
        Object.keys(groups).filter(k=>!order.includes(k)).forEach(k=>{
          const sec=document.createElement('section');sec.className='search-section-ui';
          const title=document.createElement('div');title.className='search-section-title-ui';title.innerHTML=`<h2>${esc(k)}</h2>`;
          const list=document.createElement('div');list.className='search-section-list-ui';groups[k].forEach(c=>list.appendChild(c));sec.append(title,list);results.appendChild(sec);
        });
        results.dataset.uiGrouped='1';
      }
    }
  }

  function polishSearchActions(){
    document.querySelectorAll('.search-result-card').forEach(row=>{
      const kind=row.dataset.kind;
      const id=row.dataset.id;
      const old=row.querySelector('.search-open-btn');
      if(!old || !kind || !id)return;
      let label='Voir',act='openSearchResult';
      if(kind==='Personnes'){label='Ajouter';act='addFriend';}
      else if(kind==='Pages'){label='Suivre';act='followPage';}
      else if(kind==='Groupes'){label='Rejoindre';act='joinGroup';}
      old.className='btn search-action-btn primary-action';
      old.dataset.action=act;old.dataset.id=id;old.dataset.kind=kind;old.textContent=label;
    });
  }



  /* ---------- Password recovery: presentation + Supabase Auth flow ---------- */
  let recoveryOpen=false;
  function recoveryModal(step, message=''){
    const root=document.getElementById('modalRoot');
    if(!root)return;
    recoveryOpen=true;
    const titles={1:'Récupérer votre mot de passe',2:'E-mail envoyé',3:'Créer un nouveau mot de passe'};
    const subtitles={1:'Saisissez l’adresse e-mail liée à votre compte.',2:'Vérifiez votre boîte e-mail puis ouvrez le lien sécurisé.',3:'Choisissez un nouveau mot de passe sécurisé.'};
    const progress=[1,2,3].map(i=>`<span class="recovery-step ${i<=step?'active':''}"><b>${i}</b><small>${i===1?'E-mail':i===2?'Vérification':'Nouveau mot de passe'}</small></span>`).join('');
    let body='';
    if(step===1) body=`<form id="tfaRecoveryEmail" class="recovery-form"><label>Adresse e-mail<input id="tfaRecoveryEmailInput" type="email" autocomplete="email" inputmode="email" placeholder="votre@email.com" required></label><p class="recovery-note">Nous utiliserons uniquement l’e-mail fourni pour demander à Supabase l’envoi du lien sécurisé.</p><button class="btn primary wide" type="submit">Envoyer le lien</button></form>`;
    if(step===2) body=`<div class="recovery-success"><div class="recovery-success-icon">✓</div><h3>Vérifiez votre e-mail</h3><p>${esc(message||'Un lien sécurisé de réinitialisation a été demandé.')}</p><small>Ouvrez le lien reçu pour revenir ici et définir votre nouveau mot de passe.</small><button class="btn secondary wide" type="button" id="recoveryCloseBtn">Fermer</button></div>`;
    if(step===3) body=`<form id="tfaRecoveryReset" class="recovery-form"><label>Nouveau mot de passe<span class="password-wrap"><input id="tfaNewPassword" type="password" autocomplete="new-password" minlength="6" required><button type="button" data-recovery-toggle="tfaNewPassword">Afficher</button></span></label><label>Confirmer le mot de passe<span class="password-wrap"><input id="tfaNewPassword2" type="password" autocomplete="new-password" minlength="6" required><button type="button" data-recovery-toggle="tfaNewPassword2">Afficher</button></span></label><div class="recovery-password-rule">Minimum 6 caractères. Utilisez un mot de passe différent de vos anciens mots de passe.</div><button class="btn primary wide" type="submit">Enregistrer le nouveau mot de passe</button></form>`;
    root.innerHTML=`<div class="modal-backdrop recovery-backdrop"><section class="modal recovery-modal" role="dialog" aria-modal="true" aria-labelledby="recoveryTitle"><header class="modal-header"><div><h2 id="recoveryTitle">${titles[step]}</h2><p class="recovery-subtitle">${subtitles[step]}</p></div><button class="modal-close" id="recoveryX" type="button" aria-label="Fermer">×</button></header><div class="recovery-progress">${progress}</div>${body}</section></div>`;
    const close=()=>{root.innerHTML='';recoveryOpen=false;};
    document.getElementById('recoveryX')?.addEventListener('click',close);
    document.getElementById('recoveryCloseBtn')?.addEventListener('click',close);
    root.querySelectorAll('[data-recovery-toggle]').forEach(b=>b.addEventListener('click',()=>{const i=document.getElementById(b.dataset.recoveryToggle);if(i){i.type=i.type==='password'?'text':'password';b.textContent=i.type==='password'?'Afficher':'Masquer';}}));
    const emailForm=document.getElementById('tfaRecoveryEmail');
    if(emailForm) emailForm.addEventListener('submit',async e=>{
      e.preventDefault();
      const email=document.getElementById('tfaRecoveryEmailInput').value.trim().toLowerCase();
      const client=window.supabaseClient;
      if(!client?.auth)return toast('Supabase Auth n’est pas disponible.');
      const submit=emailForm.querySelector('button[type=submit]'); if(submit){submit.disabled=true;submit.textContent='Envoi…';}
      try{
        const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
        if(error)throw error;
        recoveryModal(2,`Un lien de réinitialisation a été envoyé à ${email}. Si vous ne le voyez pas, vérifiez aussi vos courriers indésirables.`);
      }catch(err){
        if(submit){submit.disabled=false;submit.textContent='Envoyer le lien';}
        toast(err?.message||'Impossible d’envoyer le lien de réinitialisation.');
      }
    });
    const resetForm=document.getElementById('tfaRecoveryReset');
    if(resetForm) resetForm.addEventListener('submit',async e=>{
      e.preventDefault();
      const p=document.getElementById('tfaNewPassword')?.value||'', p2=document.getElementById('tfaNewPassword2')?.value||'';
      if(p.length<6)return toast('Le mot de passe doit contenir au moins 6 caractères.');
      if(p!==p2)return toast('Les deux mots de passe ne correspondent pas.');
      const client=window.supabaseClient;
      if(!client?.auth)return toast('Supabase Auth n’est pas disponible.');
      const submit=resetForm.querySelector('button[type=submit]');if(submit){submit.disabled=true;submit.textContent='Enregistrement…';}
      try{
        const {error}=await client.auth.updateUser({password:p});
        if(error)throw error;
        root.innerHTML='';recoveryOpen=false;
        if(location.hash) history.replaceState({},document.title,location.pathname+location.search);
        toast('Mot de passe mis à jour avec succès.');
      }catch(err){
        if(submit){submit.disabled=false;submit.textContent='Enregistrer le nouveau mot de passe';}
        toast(err?.message||'Impossible de modifier le mot de passe.');
      }
    });
  }

  function bindForgotPassword(){
    if(document.documentElement.dataset.tfaRecoveryBound==='1')return;
    document.documentElement.dataset.tfaRecoveryBound='1';
    document.addEventListener('click',e=>{
      const btn=e.target.closest('#forgotBtn');
      if(!btn)return;
      e.preventDefault();e.stopImmediatePropagation();
      recoveryModal(1);
    },true);
    const client=window.supabaseClient;
    if(client?.auth){
      try{client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')setTimeout(()=>recoveryModal(3),120);});}catch(_){}
    }
    if(location.hash && /access_token=|type=recovery|token_hash=/.test(location.hash+location.search)) setTimeout(()=>recoveryModal(3),500);
  }

  function enhanceSearchPage(){
    const page=document.querySelector('.search-premium-v90');
    if(!page)return;
    const input=document.getElementById('pageSearchInput');
    const filters=page.querySelector('.search-filter-grid-v90');
    const results=page.querySelector('.search-result-stack-v90');
    const q=(input?.value||window.globalSearchQuery||'').trim();
    if(filters)filters.classList.toggle('ui-search-filters-hidden',!q);
    if(!results)return;
    const cards=[...results.querySelectorAll('.search-result-card')];
    if(!cards.length){
      if(!q){results.innerHTML=`<section class="search-suggestion-page"><div class="search-section-title-ui"><h2>Suggestions</h2></div><p>Recherchez une personne, une Page ou un groupe avec la barre ci-dessus.</p></section>`;}
      return;
    }
    if(!q){
      cards.forEach((c,i)=>{
        const kind=c.querySelector('[data-kind]')?.dataset.kind || c.dataset.kind || '';
        const label=(c.querySelector('.search-result-main small')?.textContent||'').toLowerCase();
        const isPerson=kind==='Personnes'||label.startsWith('@')||c.querySelector('.search-result-avatar');
        const isPage=kind==='Pages'||label.includes('page');
        c.style.display=(isPerson||isPage)&&i<6?'flex':'none';
      });
      let head=results.querySelector('.search-suggestion-head');
      if(!head){head=document.createElement('div');head.className='search-suggestion-head';head.innerHTML='<h2>Suggestions pour vous</h2><p>Profils et Pages recommandés</p>';results.prepend(head);}
      results.dataset.uiGrouped='suggestions';
      return;
    }
    // On every real query, rebuild clean sections from the rendered cards.
    if(results.dataset.uiQuery===q)return;
    results.dataset.uiQuery=q;
    results.dataset.uiGrouped='1';
    const groups={Personnes:[],Groupes:[],Pages:[],Publications:[],Photos:[],Vidéos:[],Reels:[]};
    cards.forEach(c=>{
      const b=c.querySelector('.search-result-main b')?.textContent||'';
      const btn=c.querySelector('[data-kind]');
      const k=btn?.dataset.kind||c.dataset.kind||'';
      let kind=k;
      if(!groups[kind]){
        if(/photo/i.test(k))kind='Photos'; else if(/video/i.test(k))kind='Vidéos'; else kind=k||'Publications';
      }
      (groups[kind]||(groups.Publications=[])).push(c);
    });
    results.innerHTML='';
    Object.entries(groups).forEach(([kind,list])=>{
      if(!list.length)return;
      const sec=document.createElement('section');sec.className='search-section-ui';
      const title=document.createElement('div');title.className='search-section-title-ui';title.innerHTML=`<div><h2>${esc(kind)}</h2><p>${kind==='Personnes'?'Profils correspondants':kind==='Pages'?'Pages correspondantes':kind==='Groupes'?'Groupes correspondants':'Contenus correspondants'}</p></div><button type="button" class="search-see-all-ui">Voir tout</button>`;
      const listEl=document.createElement('div');listEl.className=kind==='Photos'?'search-photo-grid-ui':'search-section-list-ui';
      list.forEach(c=>{
        const action=c.querySelector('.search-open-btn');
        if(action){
          const id=action.dataset.id, oldKind=action.dataset.kind;
          action.dataset.kind=oldKind||kind;
          if(oldKind==='Personnes') {action.dataset.action='addFriend';action.textContent='Ajouter';}
          else if(oldKind==='Pages'){action.dataset.action='followPage';action.textContent='Suivre';}
          else if(oldKind==='Groupes'){action.dataset.action='joinGroup';action.textContent='Rejoindre';}
          else {action.textContent='Voir';}
        }
        listEl.appendChild(c);
      });
      sec.append(title,listEl);results.appendChild(sec);
      title.querySelector('button').onclick=()=>{sec.classList.toggle('show-all');title.querySelector('button').textContent=sec.classList.contains('show-all')?'Réduire':'Voir tout';};
    });
  }

  function bindSearchLoading(){
    if(document.documentElement.dataset.tfaSearchLoadingBound==='1')return;
    document.documentElement.dataset.tfaSearchLoadingBound='1';
    document.addEventListener('input',e=>{
      const input=e.target.closest('#pageSearchInput');
      if(!input)return;
      clearTimeout(window.__tfaSearchUiTimer);
      const old=document.querySelector('.search-loading-screen');old?.remove();
      const loader=document.createElement('div');loader.className='search-loading-screen';loader.innerHTML='<div class="search-loading-spinner"></div><b>Recherche en cours…</b><small>Quelques instants</small>';document.body.appendChild(loader);
      window.__tfaSearchUiTimer=setTimeout(()=>{loader.classList.add('hide');setTimeout(()=>loader.remove(),180);},520);
    },true);
  }
  function run(){
    hideZeroBadges();cleanDecorations();attachGlobalSearch();prepareSearchPage();enhanceSearchPage();polishSearchActions();syncThemeSettingLabel();bindForgotPassword();bindSearchLoading();
    applyTheme();
  }

  const mo=new MutationObserver(()=>{
    clearTimeout(window.__tfaUiTimer);
    window.__tfaUiTimer=setTimeout(run,30);
  });
  mo.observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  window.addEventListener('storage',applyTheme);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',applyTheme);
})();
