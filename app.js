

/* GROUP SEARCH */
document.addEventListener("input",function(e){if(e.target?.id==="groupSearchInput"){window.groupSearch=e.target.value||"";render();}});

/* TAFA_ADMIN_CLICK_FIX
   Admin navigation is handled by the main delegated action system below.
   No capture-phase handler is used here, so data-action="admin" reaches
   handleAction() and routeTo("admin") inside the application scope. */

(() => {
"use strict";

/* ============================================================
   TAFAß — SUPABASE AUTH CONNECTED
   - Authentification réelle via Supabase Auth.
   - Session persistante gérée par Supabase.
   - Profils chargés depuis la table profiles.
   - Les mots de passe ne sont jamais stockés dans localStorage.
   - Les fonctionnalités sociales seront reliées à Supabase dans les étapes suivantes.
   ============================================================ */


/* ============================================================
   TAFAß — SUPABASE AUTH
   Authentification réelle : Supabase Auth + table profiles.
   Les mots de passe ne sont jamais stockés dans localStorage.
============================================================ */
const SB = window.supabaseClient;

/* ============================================================
   TAFAß V18 — REALTIME CORE
   Supabase Realtime is the source of truth for social data.
   UI/layout intentionally unchanged.
============================================================ */
let tafaRealtimeChannels=[];
let realtimeBusy=false;
let expandedCommentReplies=new Set();

// Tafaß V1.1 FINAL — Photo/Video
// Tafaß V1.1 — robust media type detection (photo/video)
function tafasDetectMediaType(file) {
  if (!file) return null;
  const t = String(file.type || '').toLowerCase();
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'image';
  const n = String(file.name || '').toLowerCase();
  if (/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(n)) return 'video';
  if (/\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/i.test(n)) return 'image';
  return null;
}

// Tafaß V1.1.1 — Delete publication safely.
// Deletes the Storage object first (when media exists), then the DB row.
// The DB delete is restricted by the existing RLS policy to the owner.
window.tafasDeletePublication = async function tafasDeletePublication(post) {
  if (!post || !post.id) throw new Error('Publication invalide.');
  if (!window.supabaseClient) throw new Error('Supabase non disponible.');

  const client = window.supabaseClient;

  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Vous devez être connecté.');
  if (post.user_id && post.user_id !== user.id) {
    throw new Error('Vous ne pouvez supprimer que vos propres publications.');
  }

  // Remove media from Storage when the post has one.
  if (post.media_url) {
    try {
      const url = String(post.media_url);
      const marker = '/storage/v1/object/public/posts/';
      const signedMarker = '/storage/v1/object/sign/posts/';
      let path = null;

      if (url.includes(marker)) path = decodeURIComponent(url.split(marker)[1].split('?')[0]);
      else if (url.includes(signedMarker)) path = decodeURIComponent(url.split(signedMarker)[1].split('?')[0]);

      if (path) {
        const { error: storageError } = await client.storage.from('posts').remove([path]);
        if (storageError) console.warn('Storage media non supprimé:', storageError);
      }
    } catch (e) {
      console.warn('Impossible de déterminer le chemin Storage:', e);
    }
  }

  const { error: deleteError } = await client.from('posts').delete().eq('id', post.id);
  if (deleteError) throw deleteError;

  return true;
}



function stopTafaRealtime(){
  if(!supabaseReady()) return;
  tafaRealtimeChannels.forEach(ch=>{try{SB.removeChannel(ch)}catch(e){}});
  tafaRealtimeChannels=[];
  if(callSignalChannel){try{SB.removeChannel(callSignalChannel)}catch(e){} callSignalChannel=null;}
}
async function loadSupabaseNotifications(){
  if(!supabaseReady()||!state.current) return;
  const {data,error}=await SB.from('notifications').select('*').eq('user_id',state.current).order('created_at',{ascending:false}).limit(200);
  if(error){console.warn('Realtime notifications:',error.message);return;}
  state.notifications=(data||[]).map(n=>({
    id:n.id,userId:n.user_id,type:n.type||'activity',text:n.message||'',
    entityId:n.post_id||n.comment_id||null,postId:n.post_id||null,
    commentId:n.comment_id||null,actorId:n.actor_id||null,read:!!n.is_read,
    createdAt:n.created_at
  }));
  save();
}
async function refreshRealtimePosts(){ if(realtimeBusy) return; realtimeBusy=true; try{await loadSupabasePosts();save();render();}finally{realtimeBusy=false;} }
async function refreshRealtimeFriends(){ try{await loadSupabaseFriends();save();render();}catch(e){console.warn(e)} }
async function startTafaRealtime(){
  if(!supabaseReady()||!state.current) return;
  stopTafaRealtime();
  await loadSupabaseNotifications();
  await loadSupabaseGroups();
  startCallSignalChannel();

  // V18.4 REALTIME: each channel is scoped when possible to avoid
  // unnecessary refreshes while keeping the existing UI unchanged.
  const uid=state.current;
  const specs=[
    ['profiles','profile-change',()=>{loadSupabaseProfiles().then(render)}],
    ['posts','post-change',()=>refreshRealtimePosts()],
    ['post_reactions','reaction-change',()=>refreshRealtimePosts()],
    ['comments','comment-change',()=>refreshRealtimePosts()],
    ['friend_requests','friend-request-change',()=>refreshRealtimeFriends()],
    ['friendships','friendship-change',()=>refreshRealtimeFriends()],
    ['notifications','notification-change',()=>loadSupabaseNotifications().then(render),`user_id=eq.${uid}`],
    ['stories','story-change',()=>loadSupabaseStories().then(render)],
    ['story_views','story-view-change',()=>loadSupabaseStories().then(render)],
    ['story_reactions','story-reaction-change',()=>loadSupabaseStories().then(render)],
    ['story_replies','story-reply-change',()=>loadSupabaseStories().then(render)],
    ['messages','message-change',()=>loadSupabaseMessages().then(render)],
    ['message_attachments','message-attachment-change',()=>loadSupabaseMessages().then(render)],
    ['conversations','conversation-change',()=>loadSupabaseMessages().then(render)],
    ['marketplace_listings','marketplace-change',()=>loadSupabaseMarketplace().then(render)],
    ['groups','group-change',()=>loadSupabaseGroups().then(render)],
    ['group_members','group-member-change',()=>loadSupabaseGroups().then(render)],
    ['group_join_requests','group-request-change',()=>loadSupabaseGroups().then(render)],
    ['group_polls','group-poll-change',()=>selectedGroupId?loadSupabaseGroupPolls(selectedGroupId).then(render):loadSupabaseGroups().then(render)],
    ['group_poll_options','group-poll-option-change',()=>selectedGroupId?loadSupabaseGroupPolls(selectedGroupId).then(render):null],
    ['group_poll_votes','group-poll-vote-change',()=>selectedGroupId?loadSupabaseGroupPolls(selectedGroupId).then(render):null]
  ];

  specs.forEach(([table,name,refresh,filter])=>{
    const config={event:'*',schema:'public',table};
    if(filter) config.filter=filter;
    const ch=SB.channel('tafa-v18.4-'+name)
      .on('postgres_changes',config,payload=>{
        console.debug('[TAFAß V18.4 REALTIME]',table,payload.eventType);
        Promise.resolve(refresh()).catch(err=>console.warn('Realtime refresh '+table+':',err));
      });
    ch.subscribe(status=>{
      if(status==='SUBSCRIBED') console.debug('[TAFAß V18.4 REALTIME] subscribed:',table);
      if(status==='CHANNEL_ERROR'||status==='TIMED_OUT') console.warn('Realtime channel error:',table,status);
    });
    tafaRealtimeChannels.push(ch);
  });
}
async function loadSupabaseMessages(){
  if(!supabaseReady()||!state.current) return;
  try{
    // Read through SECURITY DEFINER RPCs so RLS cannot hide valid
    // conversations/messages from the logged-in participant.
    const {data:cs,error:ce}=await SB.rpc('tafa_get_user_conversations');
    if(ce) throw ce;

    const convs=(cs||[]).map(c=>({
      id:c.id,
      type:c.type||'private',
      members:Array.isArray(c.members)?c.members:[],
      name:'',
      createdAt:c.created_at
    }));

    state.conversations=convs;

    if(convs.length){
      const conversationIds=convs.map(c=>c.id);
      const {data:ms,error:me}=await SB.rpc('tafa_get_conversation_messages',{p_conversation_ids:conversationIds});
      if(me) throw me;

      const baseMessages=(ms||[]).map(m=>({
        id:m.id,
        conversationId:m.conversation_id,
        from:m.sender_id,
        to:m.recipient_id,
        text:(m.text ?? m.content ?? ''),
        files:[],
        file:null,
        read:!!m.is_read,
        createdAt:m.created_at,
        updatedAt:m.updated_at,
        messageType:m.message_type||'text',
        mediaUrl:m.media_url||null,
        fileName:m.file_name||null,
        fileSize:m.file_size||null,
        mimeType:m.mime_type||null
      }));
      let attachments=[];
      try{
        const {data:ad,error:ae}=await SB.rpc('tafa_get_message_attachments',{p_message_ids:baseMessages.map(m=>m.id)});
        if(!ae) attachments=(ad||[]).map(x=>typeof x==='string'?JSON.parse(x):x);
        else throw ae;
      }catch(attErr){
        console.warn('Message attachments RPC:',attErr?.message||attErr);
        // Fallback for installations where the RPC is older or absent.
        try{
          const {data:direct,error:de}=await SB.from('message_attachments')
            .select('*')
            .in('message_id',baseMessages.map(m=>m.id))
            .order('created_at',{ascending:true});
          if(!de) attachments=direct||[];
        }catch(directErr){
          console.warn('Message attachments direct load:',directErr?.message||directErr);
        }
      }
      const byMessage=new Map();
      attachments.forEach(a=>{
        const mid=a.message_id||a.messageid||a.msg_id;
        if(!mid)return;
        const name=a.file_name||a.name||a.filename||'Fichier';
        const path=a.storage_path||a.path||a.file_path||null;
        const rawType=a.file_type||a.mime_type||a.type||'';
        const type=messageFileMime({name,type:rawType});
        const directUrl=a.file_url||a.url||a.media_url||a.attachment_url||null;
        const url=directUrl || (path && supabaseReady() ? (SB.storage.from('messages').getPublicUrl(path)?.data?.publicUrl||null) : null);
        const size=Number(a.file_size??a.size??a.size_bytes??0);
        const f={id:a.id||null,url,path,name,size,type,messageType:type.startsWith('audio/')?'audio':'file'};
        if(!byMessage.has(mid))byMessage.set(mid,[]);
        byMessage.get(mid).push(f);
      });
      state.messages=baseMessages.map(m=>{
        const fs=byMessage.get(m.id)||[];
        if(!fs.length && m.mediaUrl) {
          const fallbackType=messageFileMime({name:m.fileName||'',type:m.mimeType||m.messageType||''});
          fs.push({id:m.id,url:m.mediaUrl,name:m.fileName||'Fichier',size:Number(m.fileSize||0),type:fallbackType,messageType:fallbackType.startsWith('audio/')?'audio':'file'});
        }
        return {...m,files:fs,file:fs[0]||null};
      });
    }else{
      state.messages=[];
    }

    // Make the current conversation deterministic after a server refresh.
    if(activeConversation && !convs.some(c=>String(c.id)===String(activeConversation))){
      activeConversation=convs[0]?.id||null;
    }
    save();
    return true;
  }catch(e){
    console.warn('Supabase messages:',e.message||e);
    return false;
  }
}
async function markConversationRead(conversationId){
  if(!supabaseReady() || !state.current || !conversationId) return;
  try{
    const {error}=await SB.from('messages')
      .update({is_read:true})
      .eq('conversation_id',conversationId)
      .eq('recipient_id',state.current)
      .eq('is_read',false);
    if(error) throw error;
    state.messages=state.messages.map(m=>m.conversationId===conversationId && m.to===state.current ? {...m,read:true}:m);
    save();
  }catch(e){console.warn('markConversationRead:',e.message||e)}
}

async function persistConversation(c){
  if(!supabaseReady()||!c?.id||!c.members?.length) throw new Error('Conversation invalide.');
  // V18.5: write through a SECURITY DEFINER RPC so legacy RLS policies
  // cannot block a valid private conversation.
  const {error}=await SB.rpc('tafa_upsert_conversation',{
    p_id:c.id,
    p_type:c.type||'private',
    p_name:c.name||'',
    p_members:c.members
  });
  if(error) throw error;
  return c;
}
async function persistMessage(m){
  if(!supabaseReady()||!m?.id) throw new Error('Message invalide.');
  const payload={
    id:m.id,
    conversation_id:m.conversationId,
    sender_id:m.from||state.current,
    recipient_id:m.to||null,
    content:m.text||'',
    text:m.text||'',
    message_type:m.messageType||'text',
    media_url:m.mediaUrl||null,
    file_name:m.fileName||null,
    file_size:m.fileSize||null,
    mime_type:m.mimeType||null,
    is_read:false,
    created_at:m.createdAt||new Date().toISOString(),
    updated_at:m.updatedAt||new Date().toISOString()
  };
  const {error}=await SB.from('messages').insert(payload);
  if(error) throw error;
  return m;
}
function messageMimeType(file){
  const given=String(file?.type||'').trim();
  const name=String(file?.name||'').toLowerCase();
  const map={
    '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif',
    '.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.m4v':'video/mp4','.avi':'video/x-msvideo','.mkv':'video/x-matroska',
    '.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4','.aac':'audio/aac','.flac':'audio/flac',
    '.pdf':'application/pdf','.zip':'application/zip','.rar':'application/vnd.rar','.7z':'application/x-7z-compressed',
    '.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt':'text/plain','.csv':'text/csv','.json':'application/json','.html':'text/html','.css':'text/css','.js':'text/javascript',
    '.apk':'application/vnd.android.package-archive'
  };
  const ext=Object.keys(map).find(x=>name.endsWith(x));
  // Browser MIME wins when it is useful; for empty/generic MIME use extension fallback.
  if(given && given!=='application/octet-stream') return given;
  return ext?map[ext]:(given||'application/octet-stream');
}
function messageFileMime(file){
  const type=String(file?.type||file?.mimeType||'').toLowerCase().trim();
  const name=String(file?.name||file?.fileName||'').toLowerCase();
  if(type && type!=='application/octet-stream') return type;
  return messageMimeType({type:'',name});
}
function messageFileUrl(file){
  const direct=file?.data||file?.url||file?.mediaUrl||'';
  if(direct) return direct;
  const path=file?.path||file?.storagePath||'';
  if(path && supabaseReady()){
    try{return SB.storage.from('messages').getPublicUrl(path)?.data?.publicUrl||'';}catch(_){}
  }
  return '';
}


let messageUploadProgress = {active:false, conversationId:null, fileName:"", percent:0, status:"Préparation…"};

function updateMessageUploadProgress(conversationId, fileName, percent, status){
  messageUploadProgress={active:true,conversationId,fileName:String(fileName||"Fichier"),percent:Math.max(0,Math.min(100,Math.round(percent||0))),status:status||"Envoi…"};
  const box=document.getElementById("messageUploadProgress");
  if(!box) return;
  box.classList.remove("hidden");
  const bar=box.querySelector(".message-upload-progress-bar");
  const pct=box.querySelector(".message-upload-percent");
  const name=box.querySelector(".message-upload-name");
  const statusEl=box.querySelector(".message-upload-status");
  if(bar) bar.style.width=messageUploadProgress.percent+"%";
  if(pct) pct.textContent=messageUploadProgress.percent+"%";
  if(name) name.textContent=messageUploadProgress.fileName;
  if(statusEl) statusEl.textContent=messageUploadProgress.status;
}
function finishMessageUploadProgress(){
  const box=document.getElementById("messageUploadProgress");
  messageUploadProgress={active:false,conversationId:null,fileName:"",percent:100,status:"Terminé"};
  if(box){
    const bar=box.querySelector(".message-upload-progress-bar");
    const pct=box.querySelector(".message-upload-percent");
    const statusEl=box.querySelector(".message-upload-status");
    if(bar) bar.style.width="100%";
    if(pct) pct.textContent="100%";
    if(statusEl) statusEl.textContent="Envoyé ✓";
    setTimeout(()=>{ if(messageUploadProgress.active===false && box) box.classList.add("hidden"); },650);
  }
}
function failMessageUploadProgress(){
  const box=document.getElementById("messageUploadProgress");
  messageUploadProgress={...messageUploadProgress,active:false,status:"Échec"};
  if(box){
    const statusEl=box.querySelector(".message-upload-status");
    if(statusEl) statusEl.textContent="Échec de l’envoi";
    setTimeout(()=>{ if(box) box.classList.add("hidden"); },1800);
  }
}

async function uploadMessageFile(file,onProgress){
  if(!supabaseReady()||!state.current||!file) throw new Error('Fichier invalide.');
  const max=100*1024*1024;
  if(Number(file.size||0)>max) throw new Error('Fichier trop volumineux. Maximum : 100 Mo.');

  const safeName=String(file.name||'fichier')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^[-_.]+/,'') || 'fichier';
  const mime=messageMimeType(file);
  const path=`${state.current}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;

  const baseUrl=window.TAFA_SUPABASE_CONFIG?.url;
  const apiKey=window.TAFA_SUPABASE_CONFIG?.key;
  if(!baseUrl||!apiKey) throw new Error('Configuration Supabase introuvable.');

  const sessionResult=await SB.auth.getSession();
  const accessToken=sessionResult?.data?.session?.access_token;
  if(!accessToken) throw new Error('Session Supabase expirée. Reconnectez-vous.');

  await new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST',`${baseUrl}/storage/v1/object/messages/${path}`,true);
    xhr.setRequestHeader('Authorization',`Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey',apiKey);
    xhr.setRequestHeader('x-upsert','false');
    xhr.setRequestHeader('cache-control','3600');
    xhr.setRequestHeader('content-type',mime||'application/octet-stream');
    xhr.upload.onprogress=(e)=>{
      if(e.lengthComputable){
        const p=(e.loaded/e.total)*100;
        onProgress?.(p);
      }
    };
    xhr.onload=()=>{
      if(xhr.status>=200&&xhr.status<300) resolve();
      else{
        let msg='Erreur Storage';
        try{msg=JSON.parse(xhr.responseText)?.message||JSON.parse(xhr.responseText)?.error||msg;}catch(_){}
        reject(new Error(`Upload fichier refusé : ${msg}`));
      }
    };
    xhr.onerror=()=>reject(new Error('Connexion interrompue pendant l’upload.'));
    xhr.onabort=()=>reject(new Error('Upload annulé.'));
    try{xhr.send(file);}catch(e){reject(e);}
  });

  const {data}=SB.storage.from('messages').getPublicUrl(path);
  if(!data?.publicUrl) throw new Error('URL du fichier introuvable après upload.');

  return {
    url:data.publicUrl,
    path,
    name:file.name||safeName,
    size:Number(file.size||0),
    type:mime
  };
}


function supabaseReady(){
  return !!(SB && SB.auth);
}

/* ============================================================
   TAFAß — SUPABASE FRIENDS / INVITATIONS + PROFILES
   Source de vérité: friend_requests + friendships
============================================================ */
function mergeUsersFromProfiles(rows){
  const map=new Map(state.users.map(u=>[u.id,u]));
  (rows||[]).forEach(p=>map.set(p.id,profileFromRow(p)));
  state.users=[...map.values()];
}

async function loadSupabaseProfiles(){
  if(!supabaseReady() || !state.current) return;
  try{
    const {data,error}=await SB.from("profiles")
      .select("*")
      .order("created_at",{ascending:false});
    if(error) throw error;
    mergeUsersFromProfiles(data||[]);
    save();
  }catch(err){
    console.error("Supabase profiles:",err);
  }
}

async function loadSupabaseProfileById(id){
  if(!supabaseReady() || !id) return null;
  try{
    const {data,error}=await SB.from("profiles").select("*").eq("id",id).maybeSingle();
    if(error) throw error;
    if(data){
      mergeUsersFromProfiles([data]);
      save();
      return profileFromRow(data);
    }
  }catch(err){
    console.error("Supabase profile by id:",err);
  }
  return null;
}

async function loadSupabaseFriends(){
  if(!supabaseReady() || !state.current) return;
  try{
    // Source de vérité Supabase: friendships.
    // Le schéma réel de la base est:
    // id, requester_id, receiver_id, status, created_at, updated_at
    const {data,error}=await SB.from("friendships")
      .select("id,requester_id,receiver_id,status,created_at,updated_at")
      .or(`requester_id.eq.${state.current},receiver_id.eq.${state.current}`)
      .order("created_at",{ascending:false});
    if(error) throw error;

    const rows=data||[];
    state.friendRequests=rows
      .filter(r=>r.status!=="accepted")
      .map(r=>({
        id:r.id,
        from:r.requester_id,
        to:r.receiver_id,
        status:r.status,
        createdAt:r.created_at,
        respondedAt:r.updated_at
      }));

    state.friendships=rows
      .filter(r=>r.status==="accepted")
      .map(r=>({
        id:r.id,
        a:r.requester_id,
        b:r.receiver_id,
        createdAt:r.created_at,
        updatedAt:r.updated_at
      }));

    const ids=new Set();
    rows.forEach(r=>{
      if(r.requester_id!==state.current) ids.add(r.requester_id);
      if(r.receiver_id!==state.current) ids.add(r.receiver_id);
    });

    if(ids.size){
      const {data:profiles,error:profileError}=await SB.from("profiles")
        .select("*").in("id",[...ids]);
      if(!profileError) mergeUsersFromProfiles(profiles||[]);
    }

    save();
  }catch(err){
    console.error("Supabase friends:",err);
  }
}

function friendRequestBetween(a,b){
  return state.friendRequests.find(r=>
    ((r.from===a&&r.to===b)||(r.from===b&&r.to===a))
    && r.status==="pending"
  ) || null;
}

function outgoingFriendRequest(id){
  return state.friendRequests.find(r=>
    r.from===state.current && r.to===id && r.status==="pending"
  ) || null;
}

function incomingFriendRequest(id){
  return state.friendRequests.find(r=>
    r.from===id && r.to===state.current && r.status==="pending"
  ) || null;
}

function friendActionState(id){
  if(isFriend(id)) return "friends";
  if(outgoingFriendRequest(id)) return "sent";
  if(incomingFriendRequest(id)) return "received";
  return "none";
}

async function sendFriend(id){
  if(!supabaseReady() || !state.current) return toast("Session Supabase introuvable");
  if(!id || id===state.current) return;
  if(isFriend(id)) return toast("Vous êtes déjà amis.");

  const existing=friendRequestBetween(state.current,id);
  if(existing){
    if(existing.from===id && existing.to===state.current){
      return toast("Cette personne vous a déjà envoyé une invitation.");
    }
    if(existing.from===state.current){
      return toast("Invitation déjà envoyée.");
    }
  }

  try{
    // Schéma réel: friendships(requester_id, receiver_id, status, ...)
    const {data,error}=await SB.from("friendships")
      .insert({
        requester_id:state.current,
        receiver_id:id,
        status:"pending"
      })
      .select("id,requester_id,receiver_id,status,created_at,updated_at")
      .single();

    if(error) throw error;

    state.friendRequests.unshift({
      id:data.id,
      from:data.requester_id,
      to:data.receiver_id,
      status:data.status,
      createdAt:data.created_at,
      respondedAt:data.updated_at
    });

    save();
    await notify(id,"friend_request",`${displayName(me())} vous a envoyé une invitation d’ami.`);
    render();
    toast("Invitation envoyée.");
  }catch(err){
    console.error("sendFriend:",err);
    if(err.code==="23505") toast("Une invitation existe déjà.");
    else toast("Impossible d'envoyer l'invitation : "+(err.message||"erreur Supabase"));
  }
}

async function acceptFriend(id){
  if(!supabaseReady() || !state.current) return toast("Session Supabase introuvable");
  const r=state.friendRequests.find(x=>x.id===id);
  if(!r || r.to!==state.current || r.status!=="pending") return;

  try{
    // L'invitation devient directement une amitié dans la même ligne.
    const {data,error}=await SB.from("friendships")
      .update({
        status:"accepted",
        updated_at:new Date().toISOString()
      })
      .eq("id",id)
      .eq("receiver_id",state.current)
      .eq("status","pending")
      .select("id,requester_id,receiver_id,status,created_at,updated_at")
      .single();

    if(error) throw error;

    r.status="accepted";
    r.respondedAt=data.updated_at;
    state.friendRequests=state.friendRequests.filter(x=>x.id!==id);
    state.friendships.push({
      id:data.id,
      a:data.requester_id,
      b:data.receiver_id,
      createdAt:data.created_at,
      updatedAt:data.updated_at
    });

    save();
    await notify(r.from,"friend_request_accepted",`${displayName(me())} a accepté votre invitation d’ami.`);
    render();
    toast("Invitation acceptée.");
  }catch(err){
    console.error("acceptFriend:",err);
    toast("Impossible d'accepter l'invitation : "+(err.message||"erreur Supabase"));
  }
}

async function declineFriend(id){
  if(!supabaseReady() || !state.current) return;
  const r=state.friendRequests.find(x=>x.id===id);
  if(!r || (r.to!==state.current && r.from!==state.current) || r.status!=="pending") return;

  try{
    const newStatus=r.from===state.current ? "cancelled" : "declined";
    const {data,error}=await SB.from("friendships")
      .update({
        status:newStatus,
        updated_at:new Date().toISOString()
      })
      .eq("id",id)
      .or(`requester_id.eq.${state.current},receiver_id.eq.${state.current}`)
      .eq("status","pending")
      .select("id,requester_id,receiver_id,status,created_at,updated_at")
      .single();
    if(error) throw error;

    state.friendRequests=state.friendRequests.filter(x=>x.id!==id);
    save();
    render();
    toast(newStatus==="cancelled"?"Invitation annulée.":"Invitation refusée.");
  }catch(err){
    console.error("declineFriend:",err);
    toast("Action impossible : "+(err.message||"erreur Supabase"));
  }
}

async function removeFriend(id){
  if(!supabaseReady() || !state.current) return;
  const f=state.friendships.find(x=>
    (x.a===state.current&&x.b===id)||(x.b===state.current&&x.a===id)
  );
  if(!f)return;

  try{
    const {error}=await SB.from("friendships")
      .delete()
      .eq("id",f.id)
      .or(`requester_id.eq.${state.current},receiver_id.eq.${state.current}`);
    if(error) throw error;
    state.friendships=state.friendships.filter(x=>x.id!==f.id);
    save();
    render();
    toast("Ami supprimé.");
  }catch(err){
    console.error("removeFriend:",err);
    toast("Impossible de supprimer cet ami : "+(err.message||"erreur Supabase"));
  }
}




function normalizeRegistrationPayload(form){
  const f=form||{};
  return {
    first_name:String(f.first_name||f.prenom||"").trim(),
    last_name:String(f.last_name||f.nom||"").trim(),
    username:String(f.username||f.nom_utilisateur||"").trim().toLowerCase(),
    birth_date:String(f.birth_date||f.date_naissance||"").trim(),
    gender:String(f.gender||f.genre||"").trim(),
    country:String(f.country||f.pays||"").trim(),
    phone:String(f.phone||f.numero||"").trim(),
    email:String(f.email||"").trim().toLowerCase(),
    password:String(f.password||"")
  };
}

function isOfficialRegistration(p){
  return p.email===String(ADMIN.email).trim().toLowerCase() &&
    p.username===String(TAFA_OFFICIAL_ADMIN_PROFILE.username).toLowerCase();
}

async function createRegisteredProfile(authUser, form){
  if(!authUser?.id || !supabaseReady()) return {profile:null,error:new Error("Session Supabase absente")};
  const p=normalizeRegistrationPayload(form);
  const official=isOfficialRegistration(p) && String(authUser.email||"").toLowerCase()===String(ADMIN.email).toLowerCase();

  const payload={
    id:authUser.id,
    email:String(authUser.email||p.email).toLowerCase(),
    username:p.username||null,
    first_name:p.first_name||null,
    last_name:p.last_name||null,
    birth_date:p.birth_date||null,
    gender:p.gender||null,
    country:p.country||null,
    phone:p.phone||null,
    verified:official
  };

  const variants=[
    payload,
    {...payload,birth_date:undefined},
    {id:payload.id,email:payload.email,username:payload.username,first_name:payload.first_name,last_name:payload.last_name},
    {id:payload.id,email:payload.email,username:payload.username}
  ];

  let lastError=null;
  for(const candidate of variants){
    Object.keys(candidate).forEach(k=>candidate[k]===undefined&&delete candidate[k]);
    const {data,error}=await SB.from("profiles").insert(candidate).select("*").maybeSingle();
    if(!error && data) return {profile:data,error:null};
    lastError=error;
  }
  return {profile:null,error:lastError};
}

async function ensureOfficialProfile(authUser){
  if(!supabaseReady() || !authUser?.id) return null;
  const patch=officialAdminProfilePatch(authUser);

  const base={
    id:authUser.id,
    email:String(authUser.email||patch.email||"").trim().toLowerCase(),
    username:patch.username||null,
    first_name:patch.first_name||null,
    last_name:patch.last_name||null,
    country:patch.country||null,
    phone:patch.phone||null,
    gender:patch.gender||null,
    birth_date:patch.birth_date||null,
    verified:isAdminAccount({id:authUser.id})
  };

  // Existing profile first: never overwrite user data for non-admins.
  const {data:existing}=await SB.from("profiles").select("*").eq("id",authUser.id).maybeSingle();
  if(existing){
    if(isAdminAccount({id:authUser.id})){
      const {data:updated,error}=await SB.from("profiles").update(base).eq("id",authUser.id).select("*").maybeSingle();
      if(!error && updated) return updated;
    }
    return existing;
  }

  // Try the complete known profile shape, then progressively smaller payloads
  // so a schema difference does not block Auth sign-in.
  const variants=[
    base,
    {id:base.id,email:base.email,username:base.username,first_name:base.first_name,last_name:base.last_name},
    {id:base.id,email:base.email,username:base.username},
    {id:base.id,email:base.email}
  ];
  let lastError=null;
  for(const payload of variants){
    const {data,error}=await SB.from("profiles").insert(payload).select("*").maybeSingle();
    if(!error && data) return data;
    lastError=error;
  }
  console.warn("Profile creation failed after Auth succeeded:",lastError);
  return null;
}

function profileFromRow(p){
  if(!p) return null;
  return {
    id:p.id,
    firstName:p.first_name || "",
    lastName:p.last_name || "",
    name:[p.first_name,p.last_name].filter(Boolean).join(" ") || p.username || "Utilisateur",
    birth:p.birth || "",
    gender:p.gender || "",
    username:p.username || "",
    country:p.country || "Madagascar",
    code:p.phone_code || "",
    phone:p.phone || "",
    email:p.email || "",
    avatar:p.avatar_url || "",
    cover:p.cover_url || "",
    bio:p.bio || "",
    pseudo:p.pseudo || "",
    relationshipStatus:p.relationship_status || "",
    privacy:p.privacy || {},
    location:p.location || p.country || "",
    type:p.type || "account",
    verified:!!p.verified,
    createdAt:p.created_at ? String(p.created_at).slice(0,10) : "",
    followers:p.followers || 0,
    following:p.following || 0,
    friends:p.friends || 0
  };
}

async function loadSupabaseMarketplace(){
  if(!supabaseReady() || !state.current) return;
  try{
    const {data,error}=await SB.from("marketplace_listings").select("*").order("created_at",{ascending:false}).limit(300);
    if(error) throw error;
    state.marketplace=(data||[]).map(r=>({
      id:r.id,
      ownerId:r.owner_id,
      kind:r.kind||"Produit",
      title:r.title||"",
      price:r.price||"",
      description:r.description||"",
      location:r.location||"Madagascar",
      image:r.image_url||"",
      createdAt:r.created_at
    }));
    save();
  }catch(e){
    console.warn("Marketplace Supabase:",e.message||e);
  }
}
async function uploadMarketplaceImage(file){
  if(!file || !supabaseReady() || !state.current) return "";
  if(!String(file.type||"").toLowerCase().startsWith("image/")) throw new Error("Seules les images sont autorisées.");
  if(file.size>15*1024*1024) throw new Error("Image trop volumineuse. Maximum: 15 Mo.");
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
  const path=`${state.current}/${crypto.randomUUID()}.${ext}`;
  const {error}=await SB.storage.from("marketplace").upload(path,file,{contentType:file.type,upsert:false,cacheControl:"3600"});
  if(error) throw error;
  const {data}=SB.storage.from("marketplace").getPublicUrl(path);
  return data?.publicUrl||"";
}

async function loadRealAdminData(){
  if(!supabaseReady() || !adminRoleActive) return null;
  try{
    const {data,error}=await SB.rpc("tafa_admin_dashboard");
    if(error) throw error;
    adminRealData=data||null;
    if(adminRealData?.users){
      const rows=adminRealData.users||[];
      const map=new Map((state.users||[]).map(u=>[String(u.id),u]));
      rows.forEach(r=>map.set(String(r.id),profileFromRow(r)));
      state.users=[...map.values()];
    }
    if(adminRealData?.posts){
      state.posts=(adminRealData.posts||[]).map(r=>({id:r.id,ownerId:r.owner_id,title:r.title||"Publication",text:r.text||"",mediaType:r.media_type||"text",visibility:r.visibility||"Public",createdAt:r.created_at}));
    }
    if(adminRealData?.comments){
      state.comments=(adminRealData.comments||[]).map(r=>({id:r.id,postId:r.post_id,userId:r.user_id,text:r.text||"",createdAt:r.created_at}));
    }
    if(adminRealData?.pages){
      state.pages=(adminRealData.pages||[]).map(r=>({id:r.id,ownerId:r.owner_id,name:r.name,username:r.username,category:r.category,verified:!!r.verified,createdAt:r.created_at}));
    }
    if(adminRealData?.groups){
      state.groups=(adminRealData.groups||[]).map(r=>({id:r.id,ownerId:r.owner_id,name:r.name,category:r.category,privacy:r.privacy,memberCount:Number(r.member_count||0),createdAt:r.created_at}));
    }
    save();
    return adminRealData;
  }catch(err){
    console.warn("Real Admin Supabase:",err?.message||err);
    return null;
  }
}

async function hydrateSupabaseSession(){
  if(!supabaseReady()) return false;
  const {data:{session},error} = await SB.auth.getSession();
  if(error) console.error("Supabase session:",error);
  if(!session){
    adminAuthUserId=null;
    adminRoleActive=false;
    adminRealData=null;
    state.current=null;
    state.users=[];
    save();
    return false;
  }

  // The server is the source of truth for the admin role.
  adminAuthUserId=String(session.user.id);
  adminRoleActive=false;
  try{
    await SB.rpc("tafa_bootstrap_official_admin");
  }catch(_e){}
  try{
    const {data:roleData,error:roleError}=await SB.rpc("tafa_is_admin",{p_user_id:session.user.id});
    if(roleError) throw roleError;
    adminRoleActive=!!roleData;
  }catch(err){
    console.warn("Admin role check:",err?.message||err);
  }

  const {data:profile,error:profileError}=await SB
    .from("profiles")
    .select("*")
    .eq("id",session.user.id)
    .maybeSingle();
  if(profileError) console.error("Supabase profile:",profileError);
  const u=profileFromRow(profile) || profileFromRow({
    id:session.user.id,
    email:session.user.email
  });
  adminizeUser(u);
  state.users=[u];
  state.current=u.id;

  // IMPORTANT: load every public profile so Recherche can find accounts
  // that are not friends and have no posts yet.
  await loadSupabaseProfiles();
  await loadSupabasePosts();
  await loadSupabaseFriends();
  await loadSupabaseStories();
  await loadSupabaseMarketplace();
  if(adminRoleActive) await loadRealAdminData();
  save();
  return true;
}



async function loadSupabaseStories(){
  if(!supabaseReady() || !state.current) return;
  try{
    const {data,error}=await SB.from('stories').select('*').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(200);
    if(error) throw error;
    const rows=data||[];
    const ownerIds=[...new Set(rows.map(r=>r.user_id).filter(Boolean))];
    if(ownerIds.length){
      const {data:profiles}=await SB.from('profiles').select('*').in('id',ownerIds);
      mergeUsersFromProfiles(profiles||[]);
    }
    const ids=rows.map(r=>r.id);
    let views=[], reactions=[], replies=[];
    if(ids.length){
      const [v,r,rep]=await Promise.all([
        SB.from('story_views').select('story_id,user_id,created_at').in('story_id',ids),
        SB.from('story_reactions').select('story_id,user_id,reaction_type').in('story_id',ids),
        SB.from('story_replies').select('id,story_id,user_id,text,created_at').in('story_id',ids).order('created_at',{ascending:true})
      ]);
      if(!v.error) views=v.data||[]; else console.warn('Stories views:',v.error.message);
      if(!r.error) reactions=r.data||[]; else console.warn('Stories reactions:',r.error.message);
      if(!rep.error) replies=rep.data||[]; else console.warn('Stories replies:',rep.error.message);
    }
    state.stories=rows.map(r=>({
      id:r.id,ownerId:r.user_id,ownerType:'user',text:r.text||'',media:r.media_url||'',mediaType:r.media_type||'text',
      visibility:r.visibility==='friends'?'Amis':'Public',createdAt:r.created_at,expiresAt:r.expires_at,
      views:views.filter(v=>v.story_id===r.id).map(v=>v.user_id),
      reactions:Object.fromEntries(reactions.filter(x=>x.story_id===r.id).map(x=>[x.user_id,x.reaction_type||'❤️'])),
      replies:replies.filter(x=>x.story_id===r.id).map(x=>({id:x.id,userId:x.user_id,text:x.text||'',createdAt:x.created_at}))
    }));
    save();
  }catch(err){ console.error('Supabase stories:',err); }
}
async function uploadStoryMedia(file){
  if(!file) return {url:'',path:'',type:'text'};
  const type=String(file.type||'').toLowerCase();
  if(!type.startsWith('image/')&&!type.startsWith('video/')) throw new Error('Format Story non pris en charge.');
  const max=type.startsWith('image/')?15*1024*1024:100*1024*1024;
  if(file.size>max) throw new Error(`Fichier trop volumineux. Maximum ${type.startsWith('image/')?'15':'100'} Mo.`);
  const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase()||'bin';
  const path=`${state.current}/${crypto.randomUUID()}.${ext}`;
  const {error}=await SB.storage.from('stories').upload(path,file,{contentType:file.type||undefined,upsert:false});
  if(error) throw error;
  const {data}=SB.storage.from('stories').getPublicUrl(path);
  return {url:data?.publicUrl||'',path,type:type.startsWith('video/')?'video':'image'};
}
async function createSupabaseStory({text='',file=null,visibility='Public'}){
  if(!supabaseReady()||!state.current) throw new Error('Connexion requise.');
  let uploaded=null;
  try{
    uploaded=await uploadStoryMedia(file);
    const now=new Date();
    const expires=new Date(now.getTime()+24*3600e3);
    const {data,error}=await SB.from('stories').insert({
      user_id:state.current,text:text||'',media_url:uploaded.url||null,media_type:uploaded.type||'text',
      visibility:visibility==='Amis'?'friends':'public',created_at:now.toISOString(),expires_at:expires.toISOString()
    }).select('*').single();
    if(error) throw error;
    await loadSupabaseStories();
    return data;
  }catch(err){
    if(uploaded?.path) try{await SB.storage.from('stories').remove([uploaded.path]);}catch(_e){}
    throw err;
  }
}
async function markStoryViewed(storyId){
  if(!supabaseReady()||!state.current||!storyId) return;
  const {error}=await SB.from('story_views').upsert({story_id:storyId,user_id:state.current},{onConflict:'story_id,user_id'});
  if(error) console.warn('Story view:',error.message);
}
async function reactStorySupabase(storyId,reaction='❤️'){
  if(!supabaseReady()||!state.current) return;
  const {error}=await SB.from('story_reactions').upsert({story_id:storyId,user_id:state.current,reaction_type:reaction},{onConflict:'story_id,user_id'});
  if(error) throw error;
}
async function replyStorySupabase(storyId,text){
  if(!supabaseReady()||!state.current) throw new Error('Connexion requise.');
  const {data,error}=await SB.from('story_replies').insert({story_id:storyId,user_id:state.current,text}).select('*').single();
  if(error) throw error;
  return data;
}
async function deleteStorySupabase(story){
  if(!supabaseReady()||!story?.id) throw new Error('Story invalide.');
  const {data:{user}}=await SB.auth.getUser();
  if(!user||user.id!==story.ownerId) throw new Error('Vous ne pouvez supprimer que votre Story.');
  const {error}=await SB.from('stories').delete().eq('id',story.id).eq('user_id',user.id);
  if(error) throw error;
  await loadSupabaseStories();
}

async function loadSupabasePosts(){
  if(!supabaseReady() || !state.current) return;
  const {data,error}=await SB.from("posts")
    .select("*")
    .order("created_at",{ascending:false})
    .limit(200);
  if(error){ console.error("Supabase posts:",error); return; }

  const ownerIds=[...new Set((data||[]).map(r=>r.owner_id || r.user_id).filter(Boolean))];
  if(ownerIds.length){
    const {data:profiles}=await SB.from("profiles").select("*").in("id",ownerIds);
    const map=new Map(state.users.map(u=>[u.id,u]));
    (profiles||[]).forEach(profile=>map.set(profile.id,profileFromRow(profile)));
    state.users=[...map.values()];
  }

  const visibilityFromDb=v=>({public:"Public",friends:"Amis",private:"Moi uniquement","public":"Public","friends":"Amis","private":"Moi uniquement",Public:"Public",Amis:"Amis","Moi uniquement":"Moi uniquement"}[String(v||"")] || (v||"Public"));
  state.posts=(data||[]).map(row=>({
    id:row.id, ownerId:row.owner_id || row.user_id, ownerType:"user",
    groupId:row.group_id||null, publisherPageId:row.publisher_page_id||null,
    title:row.title||"Publication", text:row.text ?? row.content ?? "",
    media:row.media_url||"", mediaType:(row.media_type||"text"),
    visibility:visibilityFromDb(row.visibility),
    allowedUsers:[], tags:[],
    createdAt:row.created_at, editedAt:row.edited_at || row.updated_at,
    shares:Number(row.shares||0), reactions:{}, myReaction:{}
  }));

  const {data:rx,error:rxErr}=await SB.from("post_reactions").select("post_id,user_id,reaction_type");
  if(!rxErr) (rx||[]).forEach(r=>{
    const p=state.posts.find(x=>x.id===r.post_id); if(!p)return;
    p.reactions[r.reaction_type]=(p.reactions[r.reaction_type]||0)+1;
    if(r.user_id===state.current)p.myReaction[state.current]=r.reaction_type;
  });

  const {data:cm,error:cmErr}=await SB.from("comments").select("*").order("created_at",{ascending:true});
  if(!cmErr) {
    state.comments=(cm||[]).map(c=>({
      id:c.id,postId:c.post_id,parentId:c.parent_id,userId:c.user_id,text:(c.text ?? c.content ?? c.body ?? ""),
      createdAt:c.created_at,editedAt:c.edited_at,likes:{}
    }));
    // V1.1.4 — persistent comment likes
    const {data:commentLikes,error:commentLikesError}=await SB
      .from("comment_likes")
      .select("comment_id,user_id");
    if(!commentLikesError){
      (commentLikes||[]).forEach(like=>{
        const c=state.comments.find(x=>x.id===like.comment_id);
        if(c){
          c.likes=c.likes||{};
          c.likes[like.user_id]=true;
        }
      });
    }
    const commentUserIds=[...new Set((cm||[]).map(c=>c.user_id).filter(Boolean))];
    if(commentUserIds.length){
      const {data:commentProfiles}=await SB.from("profiles").select("*").in("id",commentUserIds);
      const map=new Map(state.users.map(u=>[u.id,u]));
      (commentProfiles||[]).forEach(profile=>map.set(profile.id,profileFromRow(profile)));
      state.users=[...map.values()];
    }
  }

  // Shares are stored on public.posts.shares in the existing Tafa database.
  // Do not depend on a separate post_shares table here.
}

async function uploadPostMedia(file){
  if(!file || !supabaseReady() || !state.current) return null;

  const type=String(file.type||"").toLowerCase();
  const isImage=type.startsWith("image/");
  const isVideo=type.startsWith("video/");
  const maxSize=isImage ? 15*1024*1024 : isVideo ? 100*1024*1024 : 20*1024*1024;

  if(!isImage && !isVideo){
    throw new Error("Seuls les fichiers image et vidéo sont autorisés pour Photo, Vidéo et Reel.");
  }
  if(file.size>maxSize){
    throw new Error(`Fichier trop volumineux. Maximum: ${isImage?"15 Mo":"100 Mo"}.`);
  }

  const ext=(file.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"")||"bin";
  const path=`${state.current}/${crypto.randomUUID()}.${ext}`;

  const {error}=await SB.storage.from("posts").upload(path,file,{
    contentType:type || undefined,
    upsert:false,
    cacheControl:"3600"
  });
  if(error) throw error;

  const {data}=SB.storage.from("posts").getPublicUrl(path);
  return {url:data?.publicUrl||"",path};
}
function postVisibilityToDb(value){
  // Canonical Tafaß database values (legacy installations use these labels).
  return ({
    "Public":"Public",
    "Amis":"Amis",
    "Moi uniquement":"Moi uniquement",
    public:"Public",
    friends:"Amis",
    private:"Moi uniquement"
  }[value] || "Public");
}
async function createSupabasePost({text,file,visibility,kind,ownerId=state.current}){
  if(!supabaseReady()) throw new Error("Supabase non disponible.");

  const {data:{user},error:userError}=await SB.auth.getUser();
  if(userError) throw userError;
  if(!user?.id) throw new Error("Session Supabase introuvable. Reconnectez-vous.");

  state.current=user.id;
  ownerId=user.id;

  if(visibility==="Sélection personnalisée") {
    throw new Error("La visibilité personnalisée n'est pas encore disponible.");
  }

  let media_url="", media_type="text", uploadedPath=null;
  if(file){
    const uploaded=await uploadPostMedia(file);
    media_url=uploaded?.url||"";
    uploadedPath=uploaded?.path||null;

    const fileIsVideo=String(file.type||"").toLowerCase().startsWith("video/");
    const fileIsImage=String(file.type||"").toLowerCase().startsWith("image/");

    if(kind==="photo" && !fileIsImage) throw new Error("Le mode Photo nécessite une image.");
    if((kind==="video" || kind==="reel") && !fileIsVideo) throw new Error(`Le mode ${kind==="reel"?"Reel":"Vidéo"} nécessite une vidéo.`);

    media_type=kind==="photo" ? "photo"
      : kind==="reel" ? "reel"
      : kind==="video" ? "video"
      : (fileIsVideo ? "video" : (fileIsImage ? "image" : "file"));
  }

  const id=crypto.randomUUID();
  // Existing Tafaß database schema uses user_id + content.
  // Keep the frontend model (ownerId/text) separate from Supabase column names.
  const payload={
    id,
    user_id: ownerId,
    content: String(text||""),
    media_url: media_url || null,
    media_type,
    visibility: postVisibilityToDb(visibility)
  };

  const {error}=await SB.from("posts").insert(payload);
  if(error){
    if(uploadedPath){
      try{ await SB.storage.from("posts").remove([uploadedPath]); }catch(cleanErr){ console.warn("Nettoyage Storage:",cleanErr); }
    }
    const msg=[error.message,error.details,error.hint].filter(Boolean).join(" — ");
    if(/row-level security|rls|policy/i.test(msg)) throw new Error("Publication refusée par Supabase (RLS). Exécutez PUBLICATIONS_V4_SCHEMA_FIX.sql puis réessayez.");
    if(/column .*owner_id|column .*text|schema cache/i.test(msg)) throw new Error("Le schéma de la table posts ne correspond pas à l'installation actuelle de Tafaß. Vérifiez les colonnes user_id et content de public.posts.");
    if(/foreign key|profiles/i.test(msg)) throw new Error("Le profil Supabase de ce compte est introuvable. "+msg);
    throw new Error(msg||"Erreur Supabase lors de la publication.");
  }

  return {
    id,
    user_id: ownerId,
    content: String(text||""),
    media_url: media_url || "",
    media_type,
    visibility: postVisibilityToDb(visibility),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
async function signOutSupabase(){
  if(supabaseReady()){
    const {error}=await SB.auth.signOut();
    if(error) throw error;
  }
  state.current=null;
  state.users=[];
  adminAuthUserId=null;
  adminRoleActive=false;
  adminRealData=null;
  save();
}

const STORAGE = "TAFASS_V4_STATE";
const ADMIN_ID = "tafass-admin"; // legacy display ID only; never grants admin rights
const ADMIN = {
  id: ADMIN_ID, firstName:"Tafaß", lastName:"Ofisialy", name:"Tafaß Ofisialy",
  username:"tafabofisialy", email:"tafabofisialy@gmail.com",
  phone:"+261383955105", country:"Madagascar", code:"+261",
  location:"Antananarivo, Madagascar", type:"account", verified:true,
  avatar:"", cover:"", bio:"Compte officiel de Tafaß.", createdAt:"2026-01-01",
  followers:0, following:0, friends:0
};

function isAdminAccount(entity=me()){
  if(!entity || !adminRoleActive) return false;
  return !!adminAuthUserId && String(entity.id||"")===String(adminAuthUserId);
}
function isAdminUser(entity){ return isAdminAccount(entity); }

const TAFA_OFFICIAL_ADMIN_PROFILE = Object.freeze({
  first_name:"Ofisialy",
  last_name:"Tafaß",
  username:"tafabofisialy",
  country:"Madagascar",
  phone:"+261336756185",
  gender:"Homme",
  birth_date:"2005-04-21",
  email:"tafabofisialy@gmail.com"
});

function officialAdminProfilePatch(authUser){
  if(!authUser || !isAdminAccount({id:authUser.id})) return {};
  return {
    ...TAFA_OFFICIAL_ADMIN_PROFILE,
    id:authUser.id,
    email:String(authUser.email||TAFA_OFFICIAL_ADMIN_PROFILE.email)
  };
}

function adminizeUser(entity){
  if(!entity || !isAdminAccount(entity)) return entity;
  entity.verified=true;
  entity.admin=true;
  entity.type="account";
  return entity;
}

const countryData = [
["Afghanistan","+93"],["Albanie","+355"],["Algérie","+213"],["Andorre","+376"],["Angola","+244"],["Antigua-et-Barbuda","+1"],["Argentine","+54"],["Arménie","+374"],["Australie","+61"],["Autriche","+43"],["Azerbaïdjan","+994"],
["Bahamas","+1"],["Bahreïn","+973"],["Bangladesh","+880"],["Barbade","+1"],["Belgique","+32"],["Belize","+501"],["Bénin","+229"],["Bhoutan","+975"],["Biélorussie","+375"],["Bolivie","+591"],["Bosnie-Herzégovine","+387"],["Botswana","+267"],["Brésil","+55"],["Brunei","+673"],["Bulgarie","+359"],["Burkina Faso","+226"],["Burundi","+257"],
["Cabo Verde","+238"],["Cambodge","+855"],["Cameroun","+237"],["Canada","+1"],["Chili","+56"],["Chine","+86"],["Chypre","+357"],["Colombie","+57"],["Comores","+269"],["Congo","+242"],["Costa Rica","+506"],["Côte d’Ivoire","+225"],["Croatie","+385"],["Cuba","+53"],["Tchéquie","+420"],
["Danemark","+45"],["Djibouti","+253"],["Dominique","+1"],["Égypte","+20"],["Émirats arabes unis","+971"],["Équateur","+593"],["Érythrée","+291"],["Espagne","+34"],["Estonie","+372"],["Eswatini","+268"],["États-Unis","+1"],["Éthiopie","+251"],
["Fidji","+679"],["Finlande","+358"],["France","+33"],["Gabon","+241"],["Gambie","+220"],["Géorgie","+995"],["Ghana","+233"],["Grèce","+30"],["Grenade","+1"],["Guatemala","+502"],["Guinée","+224"],["Guinée-Bissau","+245"],["Guinée équatoriale","+240"],["Guyana","+592"],
["Haïti","+509"],["Honduras","+504"],["Hongrie","+36"],["Inde","+91"],["Indonésie","+62"],["Irak","+964"],["Iran","+98"],["Irlande","+353"],["Islande","+354"],["Israël","+972"],["Italie","+39"],["Jamaïque","+1"],["Japon","+81"],["Jordanie","+962"],
["Kazakhstan","+7"],["Kenya","+254"],["Kiribati","+686"],["Koweït","+965"],["Kirghizistan","+996"],["Laos","+856"],["Lettonie","+371"],["Liban","+961"],["Lesotho","+266"],["Libéria","+231"],["Libye","+218"],["Liechtenstein","+423"],["Lituanie","+370"],["Luxembourg","+352"],
["Madagascar","+261"],["Malaisie","+60"],["Malawi","+265"],["Maldives","+960"],["Mali","+223"],["Malte","+356"],["Maroc","+212"],["Marshall","+692"],["Maurice","+230"],["Mauritanie","+222"],["Mexique","+52"],["Micronésie","+691"],["Moldavie","+373"],["Monaco","+377"],["Mongolie","+976"],["Monténégro","+382"],["Mozambique","+258"],["Myanmar","+95"],
["Namibie","+264"],["Nauru","+674"],["Népal","+977"],["Nicaragua","+505"],["Niger","+227"],["Nigéria","+234"],["Norvège","+47"],["Nouvelle-Zélande","+64"],["Oman","+968"],["Ouganda","+256"],["Ouzbékistan","+998"],["Pakistan","+92"],["Palaos","+680"],["Panama","+507"],["Papouasie-Nouvelle-Guinée","+675"],["Paraguay","+595"],["Pays-Bas","+31"],["Pérou","+51"],["Philippines","+63"],["Pologne","+48"],["Portugal","+351"],
["Qatar","+974"],["République centrafricaine","+236"],["République démocratique du Congo","+243"],["République dominicaine","+1"],["Roumanie","+40"],["Royaume-Uni","+44"],["Russie","+7"],["Rwanda","+250"],["Saint-Christophe-et-Niévès","+1"],["Sainte-Lucie","+1"],["Saint-Marin","+378"],["Saint-Vincent-et-les-Grenadines","+1"],["Salomon","+677"],["Salvador","+503"],["Samoa","+685"],["Sao Tomé-et-Principe","+239"],["Arabie saoudite","+966"],["Sénégal","+221"],["Serbie","+381"],["Seychelles","+248"],["Sierra Leone","+232"],["Singapour","+65"],["Slovaquie","+421"],["Slovénie","+386"],["Somalie","+252"],["Soudan","+249"],["Soudan du Sud","+211"],["Sri Lanka","+94"],["Suède","+46"],["Suisse","+41"],["Suriname","+597"],["Syrie","+963"],
["Tadjikistan","+992"],["Tanzanie","+255"],["Tchad","+235"],["Thaïlande","+66"],["Timor oriental","+670"],["Togo","+228"],["Tonga","+676"],["Trinité-et-Tobago","+1"],["Tunisie","+216"],["Turkménistan","+993"],["Turquie","+90"],["Tuvalu","+688"],["Ukraine","+380"],["Uruguay","+598"],["Vanuatu","+678"],["Vatican","+39"],["Venezuela","+58"],["Vietnam","+84"],["Yémen","+967"],["Zambie","+260"],["Zimbabwe","+263"],["Réunion","+262"],["Palestine","+970"],["Taïwan","+886"],["Hong Kong","+852"],["Macao","+853"]
];

const NAV = [
  ["home","home","Actualités"],
  ["friends","friends","Amis"],
  ["videos","videos","Vidéos"],
  ["reels","reels","Reels"],
  ["marketplace","marketplace","Marketplace"],
  ["notifications","notifications","Notifications"]
];

function navIcon(name){
  const icons={
    home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    friends:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.3-6 5.5-6s5.1 2 5.5 6"/><circle cx="17" cy="9" r="2.2"/><path d="M15.5 14c2.7-.2 4.4 1.5 5 4"/></svg>',
    messages:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 10h8M8 13h5"/></svg>',
    videos:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4V8Z"/></svg>',
    reels:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="3"/><path d="m10 8 5 4-5 4V8Z"/><path d="M9 5h6M9 19h6"/></svg>',
    marketplace:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4z"/><path d="M3 10 5 5h14l2 5"/><path d="M8 10v3M12 10v3M16 10v3"/></svg>',
    notifications:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h12l-1.4-2V10a4.6 4.6 0 0 0-9.2 0v5L6 17Z"/><path d="M10 20h4"/></svg>'
  };
  return icons[name]||icons.home;
}


/* ============================================================
   LOCALISATION — interface Tafaß
   Les textes système sont traduits côté front-end. Les contenus
   écrits par les utilisateurs (publications, messages, bios...) ne
   sont jamais modifiés automatiquement.
   ============================================================ */
const APP_LANGUAGES = [
  ["Français","Français"],["Malagasy","Malagasy"],["English","English"],["Español","Español"],
  ["Português","Português"],["Deutsch","Deutsch"],["Italiano","Italiano"],["Nederlands","Nederlands"],
  ["Türkçe","Türkçe"],["Русский","Русский"],["Українська","Українська"],["Polski","Polski"],
  ["Română","Română"],["Ελληνικά","Ελληνικά"],["العربية","العربية"],["हिन्दी","हिन्दी"],
  ["বাংলা","বাংলা"],["اردو","اردو"],["中文","中文"],["日本語","日本語"],["한국어","한국어"],
  ["ไทย","ไทย"],["Tiếng Việt","Tiếng Việt"],["Bahasa Indonesia","Bahasa Indonesia"],["Bahasa Melayu","Bahasa Melayu"],
  ["Kiswahili","Kiswahili"],["Afrikaans","Afrikaans"],["Shqip","Shqip"],["Čeština","Čeština"],
  ["Dansk","Dansk"],["Suomi","Suomi"],["Norsk","Norsk"],["Svenska","Svenska"],["Magyar","Magyar"],
  ["Slovenčina","Slovenčina"],["Български","Български"],["Српски","Српски"],["עברית","עברית"],
  ["فارسی","فارسی"],["ქართული","ქართული"],["Հայերեն","Հայերեն"],["नेपाली","नेपाली"],
  ["Filipino","Filipino"],["Català","Català"],["Euskara","Euskara"]
];
const I18N={
  "Français":{},
  "English":{
    "Actualités":"Home","Amis":"Friends","Messages":"Messages","Vidéos":"Videos","Marketplace":"Marketplace","Notifications":"Notifications","Rechercher":"Search","Rechercher sur Tafaß":"Search Tafaß","Menu":"Menu","Profil":"Profile","Pages":"Pages","Groupes":"Groups","Enregistrés":"Saved","Reels":"Reels","Événements":"Events","Paramètres":"Settings","Confidentialité":"Privacy","Sécurité":"Security","Comptes":"Accounts","Langue":"Language","Accessibilité":"Accessibility","Appareils":"Devices","Paiements":"Payments","Badge bleu":"Blue badge","Publicités":"Ads","Activité":"Activity","Aide":"Help","Conditions":"Terms","À propos":"About","Déconnexion":"Log out","Changer un autre compte":"Switch account","Connexion":"Log in","Créer un nouveau compte":"Create new account","E-mail ou numéro de téléphone":"Email or phone number","Mot de passe":"Password","Se connecter":"Log in","Mot de passe oublié ?":"Forgot password?","Afficher":"Show","Masquer":"Hide","ou":"or","Annuler":"Cancel","Retour":"Back","Continuer":"Continue","Créer mon compte":"Create my account","Informations personnelles":"Personal information","Pays et téléphone":"Country and phone","Compte":"Account","Photo de profil":"Profile photo","Finalisation":"Finish","Public":"Public","Amis":"Friends","Moi uniquement":"Only me","Tout le monde":"Everyone","Personne":"No one","Modifier":"Edit","Supprimer":"Delete","Enregistrer":"Save","Partager":"Share","Commenter":"Comment","Répondre":"Reply","Envoyer":"Send","Fermer":"Close","Ajouter":"Add","Suivre":"Follow","Ne plus suivre":"Unfollow","Voir tout":"See all","Aucun résultat":"No results","Aucune conversation":"No conversations","Aucune notification":"No notifications","Votre fil est prêt":"Your feed is ready","Publier":"Post","Photo":"Photo","Story":"Story","Vidéo":"Video","Fichier":"File","Recherche":"Search","Tout":"All","Personnes":"People","Comptes":"Accounts","Publications":"Posts","Photos":"Photos","À propos de Tafaß":"About Tafaß","Sombre":"Dark","Clair":"Light","Système":"System","Langue de l'application":"App language","Interface":"Interface","Contenu suggéré":"Suggested content","Lecture automatique":"Autoplay","Activées":"Enabled","Désactivées":"Disabled","Activé":"Enabled","Désactivé":"Disabled","Informations de connexion":"Login information","Changer de compte":"Switch account","Ajouter un compte":"Add account","Taille du texte":"Text size","Contraste":"Contrast","Animations":"Animations","Lecteur d'écran":"Screen reader","Appareil actuel":"Current device","Gestion des sessions":"Session management","Historique":"History","Solde de démonstration":"Demo balance","Aucune transaction":"No transactions","Pourquoi le badge ?":"Why the badge?","Demander le badge":"Request badge","Identité":"Identity","Catégorie":"Category","Justificatifs":"Documents","Paiement":"Payment","Confirmation":"Confirmation"
  },
  "Malagasy":{
    "Actualités":"Vaovao","Amis":"Namana","Messages":"Hafatra","Vidéos":"Lahatsary","Marketplace":"Tsena","Notifications":"Fampandrenesana","Rechercher":"Karoka","Rechercher sur Tafaß":"Karoka ao Tafaß","Menu":"Menu","Profil":"Mombamomba","Pages":"Pejy","Groupes":"Vondrona","Enregistrés":"Voatahiry","Reels":"Reels","Événements":"Hetsika","Paramètres":"Fikirana","Confidentialité":"Tsiambaratelo","Sécurité":"Fiarovana","Comptes":"Kaonty","Langue":"Fiteny","Accessibilité":"Fahafahana miditra","Appareils":"Fitaovana","Paiements":"Fandoavam-bola","Badge bleu":"Badge manga","Publicités":"Dokam-barotra","Activité":"Hetsika natao","Aide":"Fanampiana","Conditions":"Fepetra","À propos":"Momba","Déconnexion":"Hivoaka","Changer un autre compte":"Hanova kaonty","Connexion":"Hiditra","Créer un nouveau compte":"Mamorona kaonty vaovao","E-mail ou numéro de téléphone":"E-mail na laharan-telefaona","Mot de passe":"Teny miafina","Se connecter":"Hiditra","Mot de passe oublié ?":"Adino ny teny miafina?","Afficher":"Asehoy","Masquer":"Afeno","ou":"na","Annuler":"Hanafoana","Retour":"Hiverina","Continuer":"Hanohy","Créer mon compte":"Mamorona ny kaontiko","Informations personnelles":"Mombamomba manokana","Pays et téléphone":"Firenena sy telefaona","Compte":"Kaonty","Photo de profil":"Sarin'ny profil","Finalisation":"Famaranana","Public":"Ho an'ny rehetra","Amis":"Namana","Moi uniquement":"Izaho ihany","Tout le monde":"Rehetra","Personne":"Tsy misy","Modifier":"Hanova","Supprimer":"Hamafa","Enregistrer":"Hitahiry","Partager":"Hizara","Commenter":"Haneho hevitra","Répondre":"Hamaly","Envoyer":"Alefa","Fermer":"Hidio","Ajouter":"Hanampy","Suivre":"Hanaraka","Ne plus suivre":"Aza arahina intsony","Voir tout":"Jereo daholo","Aucun résultat":"Tsy misy valiny","Aucune conversation":"Tsy misy resaka","Aucune notification":"Tsy misy fampandrenesana","Votre fil est prêt":"Vonona ny vaovao","Publier":"Hamoaka","Photo":"Sary","Story":"Story","Vidéo":"Lahatsary","Fichier":"Rakitra","Recherche":"Karoka","Tout":"Daholo","Personnes":"Olona","Comptes":"Kaonty","Publications":"Famoahana","Photos":"Sary","À propos de Tafaß":"Momba an'i Tafaß","Sombre":"Maizina","Clair":"Mazava","Système":"Rafitra","Langue de l'application":"Fitenin'ny app","Interface":"Interface","Contenu suggéré":"Votoaty soso-kevitra","Lecture automatique":"Fandehanana ho azy","Activées":"Mandeha","Désactivées":"Maty","Activé":"Mandeha","Désactivé":"Maty","Informations de connexion":"Mombamomba fidirana","Changer de compte":"Hanova kaonty","Ajouter un compte":"Hanampy kaonty","Taille du texte":"Haben'ny soratra","Contraste":"Hifanohitra","Animations":"Animation","Lecteur d'écran":"Mpamaky efijery","Appareil actuel":"Fitaovana ampiasaina","Gestion des sessions":"Fitantanana session","Historique":"Tantaran'ny hetsika","Solde de démonstration":"Saldo fanandramana","Aucune transaction":"Tsy misy fifanakalozana","Pourquoi le badge ?":"Nahoana ny badge?","Demander le badge":"Hangataka badge","Identité":"Mombamomba","Catégorie":"Sokajy","Justificatifs":"Antontan-taratasy","Paiement":"Fandoavana","Confirmation":"Fanamafisana"
  },
  "Español":{"Actualités":"Inicio","Amis":"Amigos","Messages":"Mensajes","Vidéos":"Vídeos","Marketplace":"Marketplace","Notifications":"Notificaciones","Rechercher":"Buscar","Menu":"Menú","Profil":"Perfil","Pages":"Páginas","Groupes":"Grupos","Enregistrés":"Guardados","Reels":"Reels","Événements":"Eventos","Paramètres":"Configuración","Confidentialité":"Privacidad","Sécurité":"Seguridad","Comptes":"Cuentas","Langue":"Idioma","Accessibilité":"Accesibilidad","Appareils":"Dispositivos","Paiements":"Pagos","Badge bleu":"Insignia azul","Publicités":"Anuncios","Activité":"Actividad","Aide":"Ayuda","Conditions":"Condiciones","À propos":"Acerca de","Déconnexion":"Cerrar sesión","Connexion":"Iniciar sesión","Créer un nouveau compte":"Crear una cuenta nueva","Mot de passe":"Contraseña","Mot de passe oublié ?":"¿Olvidaste tu contraseña?","Se connecter":"Iniciar sesión","Afficher":"Mostrar","Masquer":"Ocultar","Continuer":"Continuar","Retour":"Atrás","Annuler":"Cancelar","Enregistrer":"Guardar","Partager":"Compartir","Commenter":"Comentar","Répondre":"Responder","Envoyer":"Enviar","Fermer":"Cerrar","Ajouter":"Añadir","Suivre":"Seguir","Ne plus suivre":"Dejar de seguir","Voir tout":"Ver todo","Aucun résultat":"Sin resultados","Public":"Público","Moi uniquement":"Solo yo","Tout le monde":"Todos","Personne":"Nadie","Tout":"Todo","Personnes":"Personas","Publications":"Publicaciones","Photos":"Fotos","Recherche":"Búsqueda","Photo":"Foto","Vidéo":"Vídeo","Fichier":"Archivo","Story":"Historia","Sombre":"Oscuro","Clair":"Claro","Système":"Sistema","Langue de l'application":"Idioma de la aplicación","Interface":"Interfaz","Taille du texte":"Tamaño del texto","Contraste":"Contraste","Animations":"Animaciones","Appareil actuel":"Dispositivo actual","Historique":"Historial","Identité":"Identidad","Catégorie":"Categoría","Justificatifs":"Documentos","Paiement":"Pago","Confirmation":"Confirmación"},
  "Português":{"Actualités":"Início","Amis":"Amigos","Messages":"Mensagens","Vidéos":"Vídeos","Marketplace":"Marketplace","Notifications":"Notificações","Rechercher":"Pesquisar","Menu":"Menu","Profil":"Perfil","Pages":"Páginas","Groupes":"Grupos","Enregistrés":"Salvos","Reels":"Reels","Événements":"Eventos","Paramètres":"Configurações","Confidentialité":"Privacidade","Sécurité":"Segurança","Comptes":"Contas","Langue":"Idioma","Accessibilité":"Acessibilidade","Appareils":"Dispositivos","Paiements":"Pagamentos","Badge bleu":"Selo azul","Publicités":"Anúncios","Activité":"Atividade","Aide":"Ajuda","Conditions":"Termos","À propos":"Sobre","Déconnexion":"Sair","Connexion":"Entrar","Créer un nouveau compte":"Criar nova conta","Mot de passe":"Senha","Mot de passe oublié ?":"Esqueceu a senha?","Se connecter":"Entrar","Afficher":"Mostrar","Masquer":"Ocultar","Continuer":"Continuar","Retour":"Voltar","Annuler":"Cancelar","Enregistrer":"Salvar","Partager":"Compartilhar","Commenter":"Comentar","Répondre":"Responder","Envoyer":"Enviar","Fermer":"Fechar","Ajouter":"Adicionar","Suivre":"Seguir","Ne plus suivre":"Deixar de seguir","Voir tout":"Ver tudo","Aucun résultat":"Nenhum resultado","Public":"Público","Moi uniquement":"Somente eu","Tout le monde":"Todos","Personne":"Ninguém","Tout":"Tudo","Personnes":"Pessoas","Publications":"Publicações","Photos":"Fotos","Recherche":"Pesquisa","Photo":"Foto","Vidéo":"Vídeo","Fichier":"Arquivo","Story":"Story","Sombre":"Escuro","Clair":"Claro","Système":"Sistema","Langue de l'application":"Idioma do aplicativo","Interface":"Interface","Taille du texte":"Tamanho do texto","Contraste":"Contraste","Animations":"Animações","Appareil actuel":"Dispositivo atual","Historique":"Histórico","Identité":"Identidade","Catégorie":"Categoria","Justificatifs":"Documentos","Paiement":"Pagamento","Confirmation":"Confirmação"}
};
function tText(text){const lang=state.settings?.language||"Français";return I18N[lang]?.[text]||text;}
function localizeApp(){
  const lang=state.settings?.language||"Français";
  if(lang==="Français") return;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];let n;while(n=walker.nextNode())nodes.push(n);
  nodes.forEach(node=>{const raw=node.nodeValue.trim();if(raw&&I18N[lang]?.[raw])node.nodeValue=node.nodeValue.replace(raw,I18N[lang][raw]);});
  document.querySelectorAll("input[placeholder],textarea[placeholder]").forEach(el=>{const v=el.getAttribute("placeholder");if(I18N[lang]?.[v])el.setAttribute("placeholder",I18N[lang][v]);});
  document.querySelectorAll("input[value],option").forEach(el=>{const v=el.textContent?.trim()||el.value;if(I18N[lang]?.[v]){if(el.tagName==="OPTION")el.textContent=I18N[lang][v];else el.value=I18N[lang][v];}});
}

const MENU_ITEMS = [
["profile","◯","Profil"],["friends","♧","Amis"],["messages","✉","Messages"],
["videos","▶","Vidéos"],["reels","◆","Reels"],["notifications","♢","Notifications"],["pages","▤","Pages"],["groups","◉","Groupes"],
["saved","🔖","Enregistrer"],["events","◫","Événement"],
["settings","⚙","Paramètres"],["privacy","◌","Confidentialité"],["security","🔒","Sécurité"],
["accounts","◎","Comptes"],["language","文","Langue"],["accessibility","♿","Accessibilité"],
["devices","▣","Appareils"],["payments","◇","Paiements"],["badge","✓","Badge Bleu · 5 étapes"],
["ads","▥","Publicités"],["activity","◷","Activité"],["help","?","Aide"],["terms","§","Conditions"],
["about","ⓘ","À propos de Tafaß"],["switchAccount","⇄","Changer un autre compte"],["admin","♛","Administration"],["logout","↪","Déconnexion"]
];

const PAGE_CATS = [
"Entreprise","Artiste","Musicien","Acteur","Comédien","Influenceur","Marque","Boutique","Restaurant","Association","Organisation","Média","Créateur","Sport","Éducation","Service","Autre",
"Personnalité publique","Président de la République","Vice-président","Premier ministre","Ministre","Député","Sénateur","Maire","Élu local","Responsable politique","Diplomate","Ambassadeur","Fonctionnaire","Journaliste","Animateur","Présentateur","Personnalité médiatique","Chef d'entreprise","Entrepreneur","Professionnel","Médecin","Avocat","Enseignant","Chercheur","Auteur","Écrivain","Photographe","Producteur","Réalisateur","Influenceur digital","Créateur de contenu","Streamer","Gamer","Coach","Athlète","Association caritative","ONG","Fondation","Institution","Administration publique","Service public","Tourisme","Hôtel","Voyage","Transport","Immobilier","Finance","Banque","Assurance","Technologie","Logiciel","Application","Télécommunication","Mode","Beauté","Santé","Alimentation","Commerce","E-commerce","Église / communauté","Culture","Musée","Université","École","Club","Fédération","Média sportif","Radio","Télévision","Podcast","Magazine","Blog","Communauté","Projet","Événement","Autre"
];
const PROFILE_CATS = PAGE_CATS;

let state = loadState();
let route = state.current ? "home" : "home";
let selectedGroupId = null;
let adminAuthUserId = null;
let adminRoleActive = false;
let adminRealData = null;
let searchFilter = "Tout";
let activeConversation = null;
let activeCall = null;
let callSignalChannel = null;
let callPeer = null;
let callLocalStream = null;
let callRemoteStream = null;
let callIceQueue = [];
let callRemoteUserId = null;
let voiceRecorder = null;
let voiceChunks = [];
let voiceRecording = false;
let registerStep = 1;
let registerAvatar = "";
let profileFriendsAll = false;
let committedSearchQuery = "";
let editingPageId = null;
let profileTab = "posts";
let profileViewingId = null;
let pageTab = "posts";
let mediaFilter = "all";
const expandedPostTextIds = new Set();
let marketFilter = "all";
let friendTab = "friends";
let friendSearch = "";
let openReactionPostId = null;
let routeHistory = [];

function $(id){ return document.getElementById(id); }
function uid(prefix="id"){ return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8); }
function appLink(id){ return `https://tafa-ofisialy.vercel.app/id=${encodeURIComponent(id)}`; }
function copyAppLink(id,label="Lien copié"){
  const url=appLink(id);
  if(navigator.clipboard?.writeText){ navigator.clipboard.writeText(url).then(()=>toast(label)).catch(()=>fallbackCopy(url,label)); }
  else fallbackCopy(url,label);
}
function fallbackCopy(text,label){ const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");toast(label);}catch(e){modal("Lien",`<div class="link-share-card-v91"><input value="${esc(text)}" readonly><button class="btn primary wide" data-action="closeModal">Fermer</button></div>`);} ta.remove(); }
function shareLink(id,title="Partager le lien"){
  const url=appLink(id);
  modal(title,`<div class="link-share-card-v91"><div class="link-preview-v91"><span>↗</span><div><b>Lien Tafaß</b><small>${esc(url)}</small></div></div><button class="btn primary wide" data-action="copyLink" data-id="${esc(id)}">Copier le lien</button><button class="btn secondary wide" data-action="nativeShareLink" data-id="${esc(id)}">Partager</button></div>`);
}
function esc(v=""){ return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function save(){ localStorage.setItem(STORAGE, JSON.stringify(state)); }
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE);
    if(raw){
      const s=JSON.parse(raw);
      return Object.assign(baseState(),s);
    }
  }catch(e){ console.warn("State reset",e); }
  return baseState();
}
function baseState(){
  return {
    users:[structuredClone(ADMIN)], pages:[], groups:[], posts:[], stories:[], comments:[], notifications:[],
    conversations:[], messages:[], friendRequests:[], friendships:[], follows:[], saved:[], searches:[],
    badgeRequests:[], reports:[], events:[], marketplace:[], settings:{dark:false,language:"Français",privacy:"public"},
    current:null, pageMode:null, drafts:[]
  };
}
function me(){ return state.users.find(u=>u.id===state.current) || null; }
function findUser(id){ return state.users.find(u=>u.id===id); }
function findPage(id){ return state.pages.find(p=>p.id===id); }
function displayName(entity){ return entity?.name || [entity?.firstName,entity?.lastName].filter(Boolean).join(" ") || "Utilisateur"; }
const DEFAULT_AVATAR_SVG = `assets/default-avatar.svg`;
function avatar(entity, cls="avatar"){
  const src = entity?.avatar || DEFAULT_AVATAR_SVG;
  return `<span class="${cls}"><img src="${src}" alt="${esc(displayName(entity)||"Utilisateur")}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_SVG}'"></span>`;
}
function verified(entity){ return isAdminAccount(entity) || entity?.verified ? `<span class="verified-badge">✓ Compte vérifié</span>` : ""; }
function typePill(entity){ return `<span class="type-pill">${entity?.type==="page"?"PAGE":"COMPTE"}</span>`; }
function timeAgo(ts){ const d=Date.now()-new Date(ts).getTime(),m=Math.floor(d/60000),h=Math.floor(m/60),day=Math.floor(h/24); if(m<1)return"à l'instant";if(m<60)return`il y a ${m} min`;if(h<24)return`il y a ${h} h`;if(day<7)return`il y a ${day} j`;return new Date(ts).toLocaleDateString("fr-FR"); }
function toast(t){
  const el=$("toast");
  if(!el)return;
  el.textContent=String(t||"");
  el.style.display="block";
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>{el.classList.remove("show");el.style.display="none";},3000);
}
function modal(title,body,buttons=""){
  $("modalRoot").innerHTML=`<div class="modal-backdrop" data-close-modal><div class="modal" onclick="event.stopPropagation()"><div class="modal-head"><h2>${title}</h2><button class="close" data-action="closeModal" aria-label="Fermer">Fermer</button></div>${body}${buttons?`<div class="actions" style="margin-top:16px;justify-content:flex-end">${buttons}</div>`:""}</div></div>`;
  $("modalRoot").querySelectorAll("[data-action]").forEach(el=>el.onclick=e=>handleAction(e,el));
  $("modalRoot").querySelectorAll("[data-close-modal]").forEach(el=>el.onclick=()=>closeModal());
}
function closeModal(){ $("modalRoot").innerHTML=""; }
async function notify(userId,type,text,entityId=null,commentId=null){
  if(!userId || userId===state.current)return null;
  let actorId=state.current;
  if(supabaseReady()){
    try{
      const {data:{user},error:userError}=await SB.auth.getUser();
      if(userError) throw userError;
      if(user?.id) actorId=user.id;
    }catch(e){ console.warn('Notification auth user:',e.message||e); }
  }
  const createdAt=new Date().toISOString();
  const local={id:crypto.randomUUID(),userId,type,text,entityId,postId:entityId,commentId,actorId,read:false,createdAt};
  if(supabaseReady() && actorId && userId!==actorId){
    try{
      const {data,error}=await SB.from('notifications').insert({
        user_id:userId, actor_id:actorId, type:type||'activity',
        post_id:entityId||null, comment_id:commentId||null,
        message:text||'', is_read:false, created_at:createdAt
      }).select('*').single();
      if(error) throw error;
      if(data){
        local.id=data.id; local.createdAt=data.created_at; local.read=!!data.is_read;
      }
    }catch(error){
      console.warn('Notification persist:',error.message||error);
    }
  }
  state.notifications.unshift(local); save();
  return local;
}
function routeTo(r, options={}){
  const allowed=["home","friends","messages","search","profile","notifications","pages","groups","videos","marketplace","reels","saved","events","menu","settings","privacy","security","accounts","language","accessibility","devices","payments","badge","ads","activity","help","terms","about","admin","admin-users","admin-reports","admin-badges","admin-posts","admin-pages","admin-groups","admin-comments","admin-messages","admin-settings","pageView"];
  if(!allowed.includes(r)) r="home";
  if(!options.replace && route!==r) routeHistory.push(route);
  route=r;
  if(r!=="profile")profileViewingId=null;
  if(r!=="pageView")pageTab="posts";
  openReactionPostId=null;
  if($("leftSidebar"))$("leftSidebar").classList.remove("open");
  render();
  window.scrollTo({top:0,behavior:"smooth"});
}
function goBack(fallback="menu"){
  const previous=routeHistory.pop();
  if(previous && previous!==route) return routeTo(previous,{replace:true});
  return routeTo(fallback,{replace:true});
}
function routeBackBar(label,target="menu"){
  return `<div class="route-back-bar-v94"><button type="button" data-action="goBack" data-back-target="${esc(target)}"><span>‹</span><b>${esc(label)}</b></button></div>`;
}
function unreadNotifications(){ return state.notifications.filter(n=>n.userId===state.current&&!n.read).length; }
function pendingFriendInvites(){ return state.friendRequests.filter(r=>r.to===state.current&&r.status==="pending").length; }
function setupNavigation(){
  /* Navigation unique: icônes seulement, style mobile premium. */
  const nav = $("bottomNav");
  if(nav) nav.innerHTML = NAV.map(([id,icon,label])=>{
    const count = id === "messages" ? unreadMessages() : id === "notifications" ? unreadNotifications() : id === "friends" ? pendingFriendInvites() : 0;
    const badge = count ? `<em id="${id}Badge" class="badge-count">${count>99?"99+":count}</em>` : id === "messages" ? `<em id="msgBadge" class="badge-count hidden">0</em>` : id === "notifications" ? `<em id="notifBadge" class="badge-count hidden">0</em>` : id === "friends" ? `<em id="friendsBadge" class="badge-count hidden">0</em>` : "";
    return `<button class="nav-item ${route===id?"active":""}" data-route="${id}" title="${label}" aria-label="${label}"><span class="nav-glyph">${navIcon(icon)}</span>${badge}<small class="sr-only">${label}</small></button>`;
  }).join("");
  const topMsg = $("topMsgBadge");
  if(topMsg){ const msgCount=unreadMessages(); topMsg.textContent=msgCount>99?"99+":String(msgCount); topMsg.classList.toggle("hidden",!msgCount); }
  const legacy = $("mainNav");
  if(legacy) legacy.innerHTML = "";
}
function isOnline(u){ return !!u?.online; }
function canSeePost(p){
  if(p.ownerId===state.current)return true;
  if(p.ownerType==="page")return true;
  if((p.visibility||"Public")==="Public")return true;
  if(p.visibility==="Amis")return isFriend(p.ownerId);
  if(p.visibility==="Sélection personnalisée")return (p.allowedUsers||[]).includes(state.current);
  return false;
}
function downloadData(data,name){if(!data)return toast("Aucun fichier disponible");const a=document.createElement("a");a.href=data;a.download=name||"tafab-media";document.body.appendChild(a);a.click();a.remove();}
function openMediaViewer(p){const o=p.ownerType==="page"?findPage(p.ownerId):findUser(p.ownerId);modal(p.title||displayName(o),`<div class="media-viewer">${["video","reel"].includes(String(p.mediaType||""))?`<video src="${esc(p.media)}" controls autoplay playsinline></video>`:`<img src="${esc(p.media)}" alt="">`}<button class="btn primary wide" data-action="downloadMedia" data-id="${p.id}">⇩ Enregistrer</button></div>`);}

/* =========================================================
   TAFAß — RESTORED ROUTE RENDERER V1
   Restores the SPA views that were lost while keeping
   Supabase/Auth/Realtime/Admin logic untouched.
========================================================= */
function renderPost(p){
  if(!p) return "";
  const u=p.ownerType==="page" ? findPage(p.ownerId) : findUser(p.ownerId);
  const owner=u||me();
  const comments=(state.comments||[]).filter(c=>String(c.postId)===String(p.id));
  const mine=String(p.ownerId)===String(state.current);
  const reaction=p.myReaction?.[state.current]||"";
  const media=p.media ? (
    String(p.mediaType||"").startsWith("video") || p.mediaType==="reel"
      ? `<div class="media-frame"><video src="${esc(p.media)}" controls playsinline preload="metadata"></video></div>`
      : `<button class="post-media-button" data-action="viewMedia" data-id="${esc(p.id)}"><img src="${esc(p.media)}" alt="" loading="lazy"></button>`
  ) : "";
  return `<article class="card post-card" data-post="${esc(p.id)}" data-post-id="${esc(p.id)}">
    <div class="post-head">
      <button class="post-author" data-action="viewProfile" data-id="${esc(p.ownerId)}">${avatar(owner,"avatar md")}<span><b>${esc(displayName(owner))} ${verified(owner)}</b><small>${timeAgo(p.createdAt)} · ${esc(p.visibility||"Public")}</small></span></button>
      <button class="icon-btn" data-action="postMore" data-id="${esc(p.id)}">⋯</button>
    </div>
    ${p.title&&p.title!=="Publication"?`<h3>${esc(p.title)}</h3>`:""}
    <div class="post-text">${esc(p.text||"")}</div>
    ${media}
    <div class="post-stats"><span>${Object.values(p.reactions||{}).reduce((a,b)=>a+Number(b||0),0)} réactions</span><span>${comments.length} commentaires</span><span>${Number(p.shares||0)} partages</span></div>
    <div class="post-actions">
      <button class="${reaction?'active':''}" data-action="react" data-id="${esc(p.id)}">👍 ${reaction||"J’aime"}</button>
      <button data-action="comment" data-id="${esc(p.id)}">💬 Commenter</button>
      <button data-action="share" data-id="${esc(p.id)}">↗ Partager</button>
      <button data-action="save" data-id="${esc(p.id)}">🔖 ${state.saved.includes(p.id)?"Enregistré":"Enregistrer"}</button>
    </div>
    <div class="comment-list">${comments.slice(-5).map(c=>{const cu=findUser(c.userId);return `<div class="comment-row">${avatar(cu,"avatar sm")}<div><b>${esc(displayName(cu))}</b><span>${esc(c.text||"")}</span><small>${timeAgo(c.createdAt)}</small></div></div>`}).join("")}</div>
    <form class="comment-form" data-comment-form="${esc(p.id)}"><input placeholder="Écrire un commentaire…" maxlength="1000"><button class="btn primary" type="submit">Envoyer</button></form>
  </article>`;
}
function renderHome(){
  const filter=window.tafaHomeFeedFilter||"all";
  let posts=(state.posts||[]).filter(canSeePost);
  if(filter==="friends") posts=posts.filter(p=>p.ownerId===state.current||isFriend(p.ownerId));
  if(filter==="media") posts=posts.filter(p=>p.media);
  return `<section class="page-head"><div><span class="eyebrow">TAFAß</span><h1>Actualités</h1><p>Découvrez les publications de votre communauté.</p></div><button class="btn secondary" data-action="refreshFeed">↻ Actualiser</button></section>
    <div class="feed-tabs"><button class="${filter==="all"?"active":""}" data-action="feedFilter" data-filter="all">Pour vous</button><button class="${filter==="friends"?"active":""}" data-action="feedFilter" data-filter="friends">Amis</button><button class="${filter==="media"?"active":""}" data-action="feedFilter" data-filter="media">Médias</button></div>
    <div class="card composer-card"><div class="composer-trigger" data-action="openComposer" data-kind="post">${avatar(me(),"avatar md")}<span>Quoi de neuf, ${esc(me()?.firstName||"") || "vous"} ?</span><b>＋</b></div><div class="composer-shortcuts"><button data-action="openComposer" data-kind="photo">📷 Photo</button><button data-action="openComposer" data-kind="video">🎥 Vidéo</button><button data-action="openComposer" data-kind="reel">◆ Reel</button><button data-action="createStory">◉ Story</button></div></div>
    <div class="stories-strip">${(state.stories||[]).slice(0,12).map(s=>{const su=findUser(s.ownerId);return `<button class="story-card" data-action="viewStory" data-id="${esc(s.id)}">${s.media?`<img src="${esc(s.media)}" alt="">`:"<span>＋</span>"}<b>${esc(displayName(su))}</b></button>`}).join("") || `<button class="story-card create" data-action="createStory"><span>＋</span><b>Créer une Story</b></button>`}</div>
    <div class="feed-list">${posts.length?posts.map(renderPost).join(""):`<div class="card empty-state"><div class="empty-icon">⌁</div><h3>Aucune publication pour le moment</h3><p>Commencez par publier quelque chose ou ajoutez des amis.</p><button class="btn primary" data-action="openComposer" data-kind="post">Créer une publication</button></div>`}</div>`;
}
function renderFriends(){
  const all=state.users.filter(u=>u.id!==state.current);
  const friends=all.filter(u=>isFriend(u.id));
  const requests=(state.friendRequests||[]).filter(r=>r.to===state.current&&r.status!=="accepted");
  const list=friendTab==="requests"?requests.map(r=>findUser(r.from)).filter(Boolean):friendTab==="suggestions"?all.filter(u=>!isFriend(u.id)):friends;
  return `<section class="page-head"><div><span class="eyebrow">COMMUNAUTÉ</span><h1>Amis</h1><p>Gérez vos amis, invitations et suggestions.</p></div><button class="btn primary" data-action="openFindFriends">Trouver des amis</button></section>
  <div class="feed-tabs"><button class="${friendTab==="friends"?"active":""}" data-action="friendTab" data-tab="friends">Mes amis (${friends.length})</button><button class="${friendTab==="requests"?"active":""}" data-action="friendTab" data-tab="requests">Demandes (${requests.length})</button><button class="${friendTab==="suggestions"?"active":""}" data-action="friendTab" data-tab="suggestions">Suggestions</button></div>
  <div class="card list-panel">${list.length?list.map(u=>`<div class="list-item friend-row">${avatar(u,"avatar md")}<div class="list-main"><b>${esc(displayName(u))} ${verified(u)}</b><small>@${esc(u.username||"")} · ${isOnline(u)?"En ligne":"Membre de Tafaß"}</small></div>${friendTab==="requests"?`<button class="btn primary" data-action="acceptFriend" data-id="${esc(u.id)}">Accepter</button><button class="btn ghost" data-action="declineFriend" data-id="${esc(u.id)}">Refuser</button>`:isFriend(u.id)?`<button class="btn ghost" data-action="messageUser" data-id="${esc(u.id)}">Message</button>`:`<button class="btn primary" data-action="addFriend" data-id="${esc(u.id)}">Ajouter</button>`}</div>`).join(""):`<div class="empty-state"><h3>Aucun résultat</h3><p>Les personnes et invitations apparaîtront ici.</p></div>`}</div>`;
}
function renderVideos(){
  const posts=(state.posts||[]).filter(p=>canSeePost(p)&&String(p.mediaType||"").startsWith("video")&&p.mediaType!=="reel");
  return `<section class="page-head"><div><span class="eyebrow">VIDÉOS</span><h1>Vidéos</h1><p>Regardez les vidéos publiées par la communauté.</p></div><button class="btn primary" data-action="openComposer" data-kind="video">＋ Publier une vidéo</button></section>
  <div class="media-grid">${posts.length?posts.map(p=>`<div class="card media-tile" data-action="viewMedia" data-id="${esc(p.id)}">${p.media?`<video src="${esc(p.media)}" muted playsinline preload="metadata"></video>`:""}<div><b>${esc((p.text||"Vidéo").slice(0,70))}</b><small>${timeAgo(p.createdAt)}</small></div></div>`).join(""):`<div class="card empty-state"><h3>Aucune vidéo</h3><p>Les vidéos publiées apparaîtront ici.</p></div>`}</div>`;
}
function renderReels(){
  const reels=(state.posts||[]).filter(p=>canSeePost(p)&&p.media&&(p.mediaType==="reel"||String(p.mediaType||"").toLowerCase().includes("reel")));
  return `<section class="page-head"><div><span class="eyebrow">TAFAß REELS</span><h1>Réels</h1><p>Des vidéos courtes à découvrir.</p></div><button class="btn primary" data-action="openComposer" data-kind="reel">＋ Créer un Reel</button></section>
  <div class="reels-grid">${reels.length?reels.map(p=>`<article class="reel-tile" data-action="viewMedia" data-id="${esc(p.id)}"><video src="${esc(p.media)}" muted playsinline preload="metadata"></video><span>${esc(p.text||"")}</span></article>`).join(""):`<div class="card empty-state"><h3>Aucun Reel</h3><p>Publiez votre premier Reel.</p></div>`}</div>`;
}
function renderMarketplace(){
  const q=(window.marketSearch||"").toLowerCase();
  const items=(state.marketplace||[]).filter(x=>!q||`${x.title} ${x.description} ${x.location}`.toLowerCase().includes(q));
  return `<section class="page-head"><div><span class="eyebrow">TAFAß MARKET</span><h1>Marketplace</h1><p>Achetez et vendez simplement dans votre communauté.</p></div><button class="btn primary" data-action="createMarketplace">＋ Vendre</button></section>
  <div class="card search-inline"><input id="marketSearch" value="${esc(window.marketSearch||"")}" placeholder="Rechercher un produit, service…"><button class="btn secondary" id="marketSearchBtn">Rechercher</button></div>
  <div class="market-grid">${items.length?items.map(x=>`<article class="card market-card">${x.image?`<button data-action="viewMarketMedia" data-id="${esc(x.id)}"><img src="${esc(x.image)}" alt=""></button>`:"<div class='market-placeholder'>🛍️</div>"}<div class="market-body"><span class="type-pill">${esc(x.kind||"Produit")}</span><h3>${esc(x.title)}</h3><strong>${esc(String(x.price||"Prix à discuter"))}</strong><small>📍 ${esc(x.location||"Madagascar")}</small><p>${esc((x.description||"").slice(0,120))}</p><div class="market-actions">${x.ownerId===state.current?`<button class="btn ghost danger" data-action="deleteMarket" data-id="${esc(x.id)}">Supprimer</button>`:`<button class="btn primary" data-action="messageUser" data-id="${esc(x.ownerId)}">Contacter</button><button class="btn ghost" data-action="reportMarket" data-id="${esc(x.id)}">Signaler</button>`}</div></div></article>`).join(""):`<div class="card empty-state"><h3>Aucune annonce</h3><p>La Marketplace est prête à accueillir vos annonces.</p></div>`}</div>`;
}
function renderNotifications(){
  const ns=(state.notifications||[]).filter(n=>n.userId===state.current);
  return `<section class="page-head"><div><span class="eyebrow">ACTIVITÉ</span><h1>Notifications</h1><p>Retrouvez toutes vos interactions récentes.</p></div><div class="head-actions"><button class="btn secondary" data-action="markAllRead">Tout lire</button><button class="btn ghost" data-action="clearNotifications">Effacer</button></div></section>
  <div class="card notification-list">${ns.length?ns.map(n=>{const a=findUser(n.actorId);return `<button class="notification-row ${n.read?"":"unread"}" data-action="readNotif" data-id="${esc(n.id)}">${avatar(a,"avatar md")}<span><b>${esc(n.text||"Nouvelle activité")}</b><small>${timeAgo(n.createdAt)}</small></span>${n.read?"":"<i></i>"}</button>`}).join(""):`<div class="empty-state"><div class="empty-icon">♢</div><h3>Aucune notification</h3><p>Vous êtes à jour.</p></div>`}</div>`;
}
function renderSearch(){
  const q=(window.globalSearchQuery||committedSearchQuery||"").trim().toLowerCase();
  const people=(state.users||[]).filter(u=>u.id!==state.current&&(!q||`${displayName(u)} ${u.username||""} ${u.email||""}`.toLowerCase().includes(q)));
  const posts=(state.posts||[]).filter(p=>canSeePost(p)&&(!q||`${p.text||""} ${p.title||""}`.toLowerCase().includes(q)));
  return `<section class="page-head"><div><span class="eyebrow">RECHERCHE</span><h1>Rechercher</h1><p>Personnes, publications, vidéos, Pages et groupes.</p></div></section>
  <div class="card search-hero"><input id="searchPageInput" value="${esc(q)}" placeholder="Rechercher sur Tafaß…"><button class="btn primary" id="searchPageBtn">Rechercher</button></div>
  ${q?`<div class="search-sections"><section><h2>Personnes</h2><div class="card list-panel">${people.slice(0,20).map(u=>`<div class="list-item">${avatar(u,"avatar md")}<div class="list-main"><b>${esc(displayName(u))}</b><small>@${esc(u.username||"")}</small></div><button class="btn ghost" data-action="viewProfile" data-id="${esc(u.id)}">Voir</button></div>`).join("")||"<div class='empty'>Aucune personne.</div>"}</div></section><section><h2>Publications</h2><div class="feed-list">${posts.slice(0,20).map(renderPost).join("")||"<div class='card empty'>Aucune publication.</div>"}</div></section></div>`:`<div class="card empty-state"><div class="empty-icon">⌕</div><h3>Commencez votre recherche</h3><p>Trouvez des personnes et du contenu sur Tafaß.</p></div>`}`;
}
function renderMessages(){
  const convMap=new Map();
  (state.messages||[]).forEach(m=>{const other=m.from===state.current?m.to:m.from;if(!other)return;if(!convMap.has(other))convMap.set(other,m);});
  const selected=activeConversation?state.messages.filter(m=>m.from===activeConversation||m.to===activeConversation):[];
  const other=activeConversation?findUser(activeConversation):null;
  return `<section class="page-head"><div><span class="eyebrow">MESSAGERIE</span><h1>Messages</h1><p>Discutez en privé avec vos contacts.</p></div><button class="btn primary" data-action="newConversation">＋ Nouveau message</button></section>
  <div class="messages-layout card"><aside class="conversation-list"><input id="conversationSearch" placeholder="Rechercher une conversation…">${[...convMap.entries()].map(([id,m])=>{const u=findUser(id);return `<button class="conversation-item ${activeConversation===id?"active":""}" data-action="selectConversation" data-id="${esc(id)}">${avatar(u,"avatar md")}<span><b>${esc(displayName(u))}</b><small>${esc(m.text||"Fichier")}</small></span></button>`}).join("")||`<div class="empty">Aucune conversation.</div>`}</aside>
  <section class="chat-panel">${activeConversation&&other?`<header class="chat-head">${avatar(other,"avatar md")}<div><b>${esc(displayName(other))}</b><small>@${esc(other.username||"")}</small></div><button class="icon-btn" data-action="backToMessages">×</button></header><div class="chat-messages">${selected.map(m=>`<div class="message-bubble ${m.from===state.current?"mine":""}"><span>${esc(m.text||"")}</span><small>${timeAgo(m.createdAt)}</small></div>`).join("")||`<div class="empty">Commencez la conversation.</div>`}</div><form class="chat-form" data-chat-form="${esc(activeConversation)}"><input name="text" placeholder="Écrire un message…" autocomplete="off"><button class="btn primary">Envoyer</button></form>`:`<div class="empty-state"><div class="empty-icon">✉</div><h3>Sélectionnez une conversation</h3><p>Choisissez un contact ou créez une nouvelle conversation.</p></div>`}</section></div>`;
}
function renderProfile(){
  const target=profileViewingId||state.current, u=findUser(target)||me(), own=target===state.current;
  const posts=(state.posts||[]).filter(p=>p.ownerId===target&&canSeePost(p));
  const friends=(state.users||[]).filter(x=>x.id!==target&&isFriend(x.id));
  return `<section class="profile-page"><div class="profile-cover"></div><div class="profile-card card"><div class="profile-main">${avatar(u,"avatar profile-avatar")}<div><h1>${esc(displayName(u))} ${verified(u)}</h1><p>@${esc(u.username||"")} · ${esc(u.country||"Madagascar")}</p><p>${esc(u.bio||"Bienvenue sur mon profil Tafaß.")}</p></div><div class="profile-actions">${own?`<button class="btn secondary" data-action="editProfile">Modifier le profil</button>`:`<button class="btn primary" data-action="${isFriend(u.id)?"messageUser":"addFriend"}" data-id="${esc(u.id)}">${isFriend(u.id)?"Message":"Ajouter"}</button><button class="btn ghost" data-action="follow" data-id="${esc(u.id)}">Suivre</button>`}</div></div><div class="profile-stats"><button data-action="profileStat" data-stat="friends"><b>${friends.length}</b><span>Amis</span></button><button data-action="profileStat" data-stat="followers"><b>${(state.follows||[]).filter(f=>f.to===target).length}</b><span>Abonnés</span></button><button><b>${posts.length}</b><span>Publications</span></button></div></div>
  <div class="feed-tabs"><button class="active">Publications</button><button data-action="profileFriendsAll">Amis</button></div><div class="feed-list">${posts.length?posts.map(renderPost).join(""):`<div class="card empty-state"><h3>Aucune publication</h3><p>Les publications de ce profil apparaîtront ici.</p></div>`}</div></section>`;
}
function renderPages(){
  const pages=state.pages||[];
  return `<section class="page-head"><div><span class="eyebrow">COMMUNAUTÉS</span><h1>Pages</h1><p>Découvrez les Pages et gérez les vôtres.</p></div><button class="btn primary" data-action="createPage">＋ Créer une Page</button></section><div class="card list-panel">${pages.length?pages.map(p=>`<div class="list-item"><div class="avatar md">📄</div><div class="list-main"><b>${esc(p.name||"Page")}</b><small>@${esc(p.username||"")} · ${esc(p.category||"")}</small></div><button class="btn ghost" data-action="viewPage" data-id="${esc(p.id)}">Voir</button></div>`).join(""):`<div class="empty-state"><h3>Aucune Page</h3><p>Créez votre première Page.</p></div>`}</div>`;
}
function renderGroups(){
  const groups=state.groups||[];
  return `<section class="page-head"><div><span class="eyebrow">COMMUNAUTÉS</span><h1>Groupes</h1><p>Rejoignez des communautés et partagez avec leurs membres.</p></div><button class="btn primary" data-action="createGroup">＋ Créer un Groupe</button></section><div class="card list-panel">${groups.length?groups.map(g=>`<div class="list-item"><div class="avatar md">👥</div><div class="list-main"><b>${esc(g.name||"Groupe")}</b><small>${esc(g.privacy||"Public")} · ${Number(g.member_count||g.members?.length||0)} membres</small></div><button class="btn ghost" data-action="viewGroup" data-id="${esc(g.id)}">Voir</button></div>`).join(""):`<div class="empty-state"><h3>Aucun Groupe</h3><p>Créez ou rejoignez votre première communauté.</p></div>`}</div>`;
}
function renderMenu(){
  const groups=[
    {title:"Mon espace",sub:"Votre profil et vos échanges",items:[
      ["profile","◯","Profil","Accéder à votre profil et le modifier"],
      ["friends","♧","Amis","Gérer vos amis et demandes"],
      ["messages","✉","Messages","Conversations et messages privés"],
      ["notifications","♢","Notifications","Vos alertes et activités récentes"]
    ]},
    {title:"Contenu & communautés",sub:"Découvrez et gérez votre contenu",items:[
      ["videos","▶","Vidéos","Regarder et publier des vidéos"],
      ["reels","◆","Réels","Découvrir les vidéos courtes"],
      ["pages","▤","Pages","Gérer et découvrir les Pages"],
      ["groups","◉","Groupes","Communautés et groupes"],
      ["saved","🔖","Enregistré","Retrouver vos contenus enregistrés"],
      ["events","◫","Événements","Vos événements et activités"]
    ]},
    {title:"Paramètres & confidentialité",sub:"Contrôlez votre compte et votre vie privée",items:[
      ["settings","⚙","Paramètres","Préférences générales de Tafaß"],
      ["privacy","◌","Confidentialité","Qui peut voir vos informations"],
      ["security","🔒","Sécurité","Protection et sécurité du compte"],
      ["accounts","◎","Comptes","Comptes enregistrés sur cet appareil"],
      ["language","文","Langue","Langue de l’interface"],
      ["accessibility","♿","Accessibilité","Adapter Tafaß à vos besoins"],
      ["devices","▣","Appareils","Vos sessions et appareils"],
      ["payments","◇","Paiements","Paiements et services"],
      ["ads","▥","Publicités","Préférences publicitaires"],
      ["activity","◷","Activité","Votre historique d’activité"]
    ]},
    {title:"Aide & informations",sub:"Assistance et informations sur Tafaß",items:[
      ["help","?","Aide","Trouver une réponse à vos questions"],
      ["badge","✓","Badge Bleu","Demande de vérification"],
      ["terms","§","Conditions","Conditions d’utilisation"],
      ["about","ⓘ","À propos de Tafaß","Informations sur l’application"]
    ]}
  ];
  return `<section class="page-head"><div><span class="eyebrow">TAFAß</span><h1>Menu</h1><p>Accédez rapidement à votre profil, vos contenus, vos paramètres et votre confidentialité.</p></div></section>
  <section class="menu-profile-card card" data-route="profile">${avatar(me(),"avatar lg")}<div><span>MON PROFIL</span><h2>${esc(displayName(me()))}</h2><p>@${esc(me()?.username||"")} · Voir et modifier votre profil</p></div><i>›</i></section>
  <div class="menu-sections">${groups.map(g=>`<section class="menu-section"><header><h2>${esc(g.title)}</h2><p>${esc(g.sub)}</p></header><div class="menu-grid">${g.items.map(([id,icon,label,desc])=>`<button class="menu-card-premium" data-route="${esc(id)}"><span>${icon}</span><div class="menu-card-copy"><strong>${esc(label)}</strong><small>${esc(desc)}</small></div><i>›</i></button>`).join("")}</div></section>`).join("")}</div>
  <div class="card menu-account">${avatar(me(),"avatar lg")}<div><b>${esc(displayName(me()))}</b><small>@${esc(me()?.username||"")}</small></div><button class="btn ghost danger" data-action="logout">Déconnexion</button></div>`;
}
function renderSettingsRoute(){
  const titles={settings:["Paramètres","Gérez les préférences de Tafaß."],privacy:["Confidentialité","Contrôlez qui peut voir vos informations."],security:["Sécurité","Protégez votre compte."],accounts:["Comptes","Gérez les comptes enregistrés sur cet appareil."],language:["Langue","Choisissez la langue de l’interface."],accessibility:["Accessibilité","Adaptez l’expérience à vos besoins."],devices:["Appareils","Consultez vos sessions."],payments:["Paiements","Historique des paiements et services."],badge:["Badge bleu","Demande de vérification."],ads:["Publicités","Préférences publicitaires."],activity:["Activité","Votre historique Tafaß."],help:["Aide","Trouvez les réponses aux questions fréquentes."],terms:["Conditions","Conditions d’utilisation de Tafaß."],about:["À propos de Tafaß","Réseau social moderne pour partager, communiquer et découvrir."]};
  const [title,desc]=titles[route]||titles.settings;
  if(route==="help") return `<section class="page-head"><div><span class="eyebrow">ASSISTANCE</span><h1>Aide</h1><p>${esc(desc)}</p></div></section><div class="menu-grid">${["Compte et connexion","Publications et Stories","Amis et abonnés","Messages et appels","Pages et groupes","Badge bleu","Confidentialité","Sécurité","Marketplace","Recherche"].map(x=>`<button class="menu-card-premium" data-action="helpTopic" data-topic="${esc(x)}"><span>?</span><strong>${esc(x)}</strong><i>›</i></button>`).join("")}</div>`;
  if(route==="badge") return `<section class="page-head"><div><span class="eyebrow">VÉRIFICATION</span><h1>Badge bleu</h1><p>Demandez la vérification de votre compte.</p></div></section><div class="card empty-state"><div class="empty-icon">✓</div><h3>Badge bleu Tafaß</h3><p>Complétez votre demande de vérification en suivant les étapes proposées.</p><button class="btn primary" data-action="startBadge">Commencer la demande</button></div>`;
  return `<section class="page-head"><div><span class="eyebrow">PARAMÈTRES</span><h1>${esc(title)}</h1><p>${esc(desc)}</p></div></section><div class="card settings-list">${MENU_ITEMS.filter(x=>["settings","privacy","security","accounts","language","accessibility","devices","payments","ads","activity","help"].includes(x[0])).map(([id,icon,label])=>`<button class="setting-row" data-route="${id}"><span>${icon}</span><div><b>${esc(label)}</b><small>Ouvrir cette rubrique</small></div><i>›</i></button>`).join("")}<button class="setting-row" data-action="changePassword"><span>🔑</span><div><b>Changer le mot de passe</b><small>Mettre à jour votre sécurité</small></div><i>›</i></button><button class="setting-row danger" data-action="logout"><span>↪</span><div><b>Déconnexion</b><small>Quitter la session actuelle</small></div><i>›</i></button></div>`;
}
function renderRoute(){
  switch(route){
    case "home": return renderHome();
    case "friends": return renderFriends();
    case "videos": return renderVideos();
    case "reels": return renderReels();
    case "marketplace": return renderMarketplace();
    case "notifications": return renderNotifications();
    case "search": return renderSearch();
    case "messages": return renderMessages();
    case "profile": return renderProfile();
    case "pages": return renderPages();
    case "groups": return renderGroups();
    case "menu": return renderMenu();
    case "saved": {const ps=(state.posts||[]).filter(p=>state.saved.includes(p.id));return `<section class="page-head"><div><span class="eyebrow">VOS CONTENUS</span><h1>Enregistrés</h1><p>Publications que vous avez sauvegardées.</p></div></section><div class="feed-list">${ps.map(renderPost).join("")||`<div class="card empty-state"><h3>Aucun contenu enregistré</h3></div>`}</div>`;}
    case "events": return `<section class="page-head"><div><span class="eyebrow">COMMUNAUTÉ</span><h1>Événements</h1><p>Découvrez les événements à venir.</p></div><button class="btn primary" data-action="createEvent">＋ Créer un événement</button></section><div class="card empty-state"><h3>Aucun événement affiché</h3><p>Les événements créés apparaîtront ici.</p></div>`;
    case "admin": return renderAdmin();
    case "admin-users": return renderAdminUsers();
    case "admin-reports": return renderAdminReports();
    case "admin-badges": return renderAdminBadges();
    case "admin-posts": return renderAdminPosts();
    case "admin-pages": return renderAdminPages();
    case "admin-groups": return renderAdminGroups();
    case "admin-comments": return renderAdminComments();
    case "admin-messages": return renderAdminMessages();
    case "admin-settings": return renderAdminSettings();
    case "pageView": {const p=findPage(editingPageId);return p?`<section class="page-head"><button class="btn secondary" data-action="goBack" data-back-target="pages">‹ Retour</button><div><span class="eyebrow">PAGE</span><h1>${esc(p.name||"Page")}</h1><p>${esc(p.description||"")}</p></div></section><div class="card empty-state"><h3>Bienvenue sur cette Page</h3><p>Les publications et informations de la Page apparaîtront ici.</p></div>`:`<div class="card empty-state"><h3>Page introuvable</h3></div>`;}
    default: return renderSettingsRoute();
  }
}
function openComposer(kind="post"){
  const labels={post:"Créer une publication",photo:"Publier une photo",video:"Publier une vidéo",reel:"Créer un Reel"};
  modal(labels[kind]||labels.post,`<form id="composerForm" class="premium-form"><label>Votre publication<textarea id="composerText" rows="5" maxlength="5000" placeholder="Exprimez-vous…"></textarea></label><label>Visibilité<select id="composerVisibility"><option>Public</option><option>Amis</option><option>Moi uniquement</option></select></label><input id="composerFile" type="file" accept="${kind==="photo"?"image/*":kind==="video"?"video/*":kind==="reel"?"video/*":"image/*,video/*"}"><small>Photo : 15 Mo max · Vidéo/Reel : 100 Mo max</small><button class="btn primary wide" type="submit">Publier</button></form>`);
  $("composerForm").onsubmit=async e=>{e.preventDefault();const text=$("composerText").value.trim(),file=$("composerFile").files[0]||null;try{if(!text&&!file)throw new Error("Ajoutez du texte ou un média.");await createSupabasePost({text,file,visibility:$("composerVisibility").value,kind});await loadSupabasePosts();closeModal();render();toast("Publication publiée ✓");}catch(err){console.error(err);toast(err.message||"Publication impossible.");}};
}


/* RESTORED CORE HELPERS */
function isFriend(id){
  if(!state.current||!id) return false;
  return (state.friendships||[]).some(f=>(String(f.a)===String(state.current)&&String(f.b)===String(id))||(String(f.b)===String(state.current)&&String(f.a)===String(id)));
}
function applyTheme(){
  const dark=!!state.settings?.dark;
  document.documentElement.classList.toggle("dark",dark);
  document.body.classList.toggle("dark",dark);
}
function setupGlobal(){
  const g=$("globalSearch");
  if(g){
    g.value=window.globalSearchQuery||"";
    g.addEventListener("input",()=>{window.globalSearchQuery=g.value;});
    g.addEventListener("keydown",e=>{if(e.key==="Enter"){committedSearchQuery=g.value.trim();routeTo("search");}});
  }
  document.addEventListener("click",e=>{
    const ms=e.target.closest("#marketSearchBtn");
    if(ms){window.marketSearch=$("marketSearch")?.value||"";render();return;}
    const ps=e.target.closest("#searchPageBtn");
    if(ps){window.globalSearchQuery=$("searchPageInput")?.value||"";committedSearchQuery=window.globalSearchQuery;const top=$("globalSearch");if(top)top.value=window.globalSearchQuery;render();return;}
  });
}
function openDeepLink(){
  const path=location.hash.replace(/^#/,"").replace(/^\/+/,"");
  if(path&&state.current){
    const known=["home","friends","messages","search","profile","notifications","pages","groups","videos","marketplace","reels","menu","settings","privacy","security","accounts","language","accessibility","devices","payments","badge","ads","activity","help","terms","about","admin"];
    if(known.includes(path)) route=path;
  }
}
function searchSupabaseGlobal(q){ window.globalSearchQuery=q||""; committedSearchQuery=q||""; routeTo("search"); }
function renderGroup(g){
  if(!g) return `<div class="card empty-state"><h3>Groupe introuvable</h3></div>`;
  return `<section class="page-head"><div><span class="eyebrow">GROUPE</span><h1>${esc(g.name||"Groupe")}</h1><p>${esc(g.description||"Communauté Tafaß")}</p></div><button class="btn secondary" data-action="goBack" data-back-target="groups">‹ Retour</button></section><div class="card empty-state"><h3>Bienvenue dans ${esc(g.name||"ce groupe")}</h3><p>${Number(g.members?.length||g.member_count||0)} membres</p></div>`;
}
function openAccountSwitcher(){
  const accounts=savedAccounts();
  modal("Comptes",`<div class="premium-options">${accounts.map(a=>`<button class="menu-card-premium" data-action="selectAccount" data-id="${esc(a.email)}"><span>◎</span><strong>${esc(a.name||a.email)}</strong><small>${esc(a.email)}</small></button>`).join("")}<button class="menu-card-premium" data-action="addAccount"><span>＋</span><strong>Ajouter un compte</strong></button></div>`);
}
async function switchSupabaseAccount(email){
  closeModal();
  if(!email)return;
  if(supabaseReady()) await SB.auth.signOut();
  state.current=null;save();$("authScreen")?.classList.remove("hidden");$("appScreen")?.classList.add("hidden");
  const input=$("loginIdentifier");if(input){input.value=email;input.focus();}
}

function render(){
  const splash=$("splash"),auth=$("authScreen"),app=$("appScreen");
  if(!state.current){auth.classList.remove("hidden");app.classList.add("hidden");return;}
  auth.classList.add("hidden");app.classList.remove("hidden");
  setupNavigation();
  const u=me();
  $("sideName").textContent=displayName(u);$("sideHandle").textContent="@"+(u?.username||"");
  $("sideAvatar").outerHTML=avatar(u,"avatar") .replace("<span","<span id=\"sideAvatar\"");
  const unread=unreadNotifications();
  const nb=$("notifBadge"); if(nb){nb.textContent=unread>99?"99+":unread;nb.classList.toggle("hidden",unread===0)}
  const mb=$("msgBadge"); const mu=unreadMessages(); if(mb){mb.textContent=mu>99?"99+":mu;mb.classList.toggle("hidden",mu===0)}
  const fb=$("friendsBadge"); const fi=pendingFriendInvites(); if(fb){fb.textContent=fi>99?"99+":fi;fb.classList.toggle("hidden",fi===0)}
  $("mainContent").innerHTML=renderRoute();
  $("rightSuggestions").innerHTML=renderSuggestions(3);
  localizeApp();
  setupNavigation();
  bindPageEvents();
}
function unreadMessages(){ return state.messages.filter(m=>m.to===state.current&&!m.read).length; }
function adminUsersData(){ return Array.isArray(adminRealData?.users)?adminRealData.users:[]; }
function adminPagesData(){ return Array.isArray(adminRealData?.pages)?adminRealData.pages:[]; }
function adminGroupsData(){ return Array.isArray(adminRealData?.groups)?adminRealData.groups:[]; }
function adminPostsData(){ return Array.isArray(adminRealData?.posts)?adminRealData.posts:[]; }
function adminCommentsData(){ return Array.isArray(adminRealData?.comments)?adminRealData.comments:[]; }
function adminGuard(){ return isAdminAccount(); }
function adminCollection(key){ return Array.isArray(state[key])?state[key]:[]; }
function renderAdminUsers(){
  if(!adminGuard()) return routeTo("home");
  const users=adminUsersData();
  return `${routeBackBar("Administration","admin")}<section class="admin-dashboard"><div class="admin-head"><div><span class="eyebrow">TAFAß · ADMIN</span><h1>Utilisateurs</h1><p>Comptes réels chargés depuis Supabase.</p></div><button class="btn secondary" data-action="adminRefresh">↻ Actualiser</button></div><div class="admin-panel">${users.map(u=>`<div class="admin-row"><div class="admin-avatar">${esc(String(u.first_name||u.username||"?").slice(0,1).toUpperCase())}</div><div class="admin-grow"><b>${esc([u.first_name,u.last_name].filter(Boolean).join(" ")||u.username||"Utilisateur")}</b><small>@${esc(u.username||"")} · ${esc(u.email||"")}</small></div>${u.id===adminAuthUserId?'<span class="admin-pill blue">✓ ADMIN</span>':`<span class="admin-pill ${u.account_status==='banned'?'red':'green'}">${esc(u.account_status||"active")}</span><button class="btn ghost" data-action="adminToggleUserStatus" data-id="${esc(u.id)}" data-status="${u.account_status==='banned'?'active':'banned'}">${u.account_status==='banned'?'Activer':'Bannir'}</button><button class="btn ghost danger" data-action="adminDeleteUser" data-id="${esc(u.id)}">Supprimer</button>`}</div>`).join("")||'<div class="admin-empty">Aucun utilisateur.</div>'}</div></section>`;
}
function renderAdminReports(){
  if(!adminGuard()) return routeTo("home");
  const reports=Array.isArray(adminRealData?.reports)?adminRealData.reports:[];
  return `${routeBackBar("Administration","admin")}<section class="admin-dashboard"><div class="admin-head"><div><span class="eyebrow">TAFAß · MODÉRATION</span><h1>Signalements</h1><p>Signalements stockés réellement dans Supabase.</p></div></div><div class="admin-panel">${reports.length?reports.map(r=>`<div class="admin-row"><div class="admin-grow"><b>${esc(r.reason||"Signalement")}</b><small>${esc(r.target_type||"")} · ${esc(r.target_id||"")} · ${timeAgo(r.created_at)}</small></div><span class="admin-pill">${esc(r.status||"pending")}</span><button class="btn primary" data-action="adminResolveReport" data-id="${esc(r.id)}">Traiter</button></div>`).join(""):'<div class="admin-empty">Aucun signalement.</div>'}</div></section>`;
}
function renderAdminBadges(){
  if(!adminGuard()) return routeTo("home");
  const req=adminCollection("badgeRequests");
  return `${routeBackBar("Administration","admin")}<section class="admin-dashboard admin-subpage"><div class="admin-head"><div><span class="eyebrow">TAFAß · VÉRIFICATION</span><h1>Badges bleus</h1><p>Demandes de vérification.</p></div></div><div class="admin-panel">${req.length?req.map(r=>`<div class="admin-row"><div class="admin-grow"><b>${esc(r.userName||r.username||r.userId||"Utilisateur")}</b><small>${esc(r.status||"pending")} · ${timeAgo(r.createdAt)}</small></div><button class="btn primary" data-action="adminApproveBadge" data-id="${esc(r.id)}">Approuver</button><button class="btn ghost danger" data-action="adminRejectBadge" data-id="${esc(r.id)}">Refuser</button></div>`).join(""):'<div class="admin-empty">Aucune demande.</div>'}</div></section>`;
}
function renderAdmin(){
  if(!adminGuard()) return `${routeBackBar("Menu","menu")}<section class="card"><h2>Accès refusé</h2><p>Cette section est réservée à l'administrateur officiel.</p></section>`;
  const c=adminRealData?.counts||{};
  const cards=[
    ["👥","Utilisateurs",Number(c.users||0),"adminUsers","Comptes et modération"],
    ["📄","Pages",Number(c.pages||0),"adminPages","Pages de la plateforme"],
    ["👥","Groupes",Number(c.groups||0),"adminGroups","Communautés"],
    ["📝","Publications",Number(c.posts||0),"adminPosts","Contenus publiés"],
    ["💬","Commentaires",Number(c.comments||0),"adminComments","Commentaires récents"],
    ["✉️","Messages",Number(c.messages||0),"adminMessages","Volume des messages"],
    ["🛡️","Signalements",Number(c.reports_pending||0),"adminReports","À traiter"],
    ["🔵","Badges bleus",adminCollection("badgeRequests").filter(r=>String(r.status||"pending")==="pending").length,"adminBadges","Demandes en attente"]
  ];
  return `${routeBackBar("Menu","menu")}<section class="admin-dashboard admin-dashboard-v2"><div class="admin-hero-v2"><div><span class="eyebrow">TAFAß · ADMINISTRATION RÉELLE</span><h1>Centre d'administration</h1><p>Données et actions sécurisées par Supabase.</p></div><div class="admin-official"><span>✓</span><div><b>Administrateur officiel</b><small>Rôle vérifié côté serveur</small></div></div></div><div class="admin-stat-grid admin-stat-grid-v2">${cards.map(ca=>`<button type="button" class="admin-stat admin-stat-button" data-action="${ca[3]}"><span class="admin-stat-icon">${ca[0]}</span><div><strong>${ca[2]}</strong><small>${ca[1]}</small><em>${ca[4]}</em></div><span class="admin-arrow">›</span></button>`).join("")}</div><div class="admin-panel"><div class="admin-panel-title"><div><b>État Supabase</b><small>Source de vérité serveur</small></div><span class="admin-live">● LIVE</span></div><div class="admin-setting-row"><div><b>Rôle administrateur</b><small>Contrôlé par tafa_is_admin()</small></div><span class="admin-pill green">ACTIF</span></div><div class="admin-setting-row"><div><b>Modération</b><small>Suppression des publications, commentaires, Pages et Groupes via RPC sécurisé.</small></div><span class="admin-pill blue">SÉCURISÉ</span></div><div class="admin-setting-row"><div><b>Messages</b><small>Seul le volume est exposé à l'Admin, pas le contenu privé.</small></div><span class="admin-pill green">PRIVÉ</span></div></div></section>`;
}

function renderAdminPosts(){ if(!adminGuard())return routeTo("home"); const items=adminPostsData(); return `${routeBackBar("Administration","admin")}<section class="admin-dashboard admin-subpage"><div class="admin-head"><div><span class="eyebrow">TAFAß · MODÉRATION</span><h1>Publications</h1><p>Publications réelles depuis Supabase.</p></div></div><div class="admin-panel">${items.map(x=>`<div class="admin-row"><div class="admin-grow"><b>${esc((x.text||x.title||"Publication").slice(0,90))}</b><small>${esc(x.owner_id||"")} · ${timeAgo(x.created_at)}</small></div><button class="btn ghost danger" data-action="adminDeletePost" data-id="${esc(x.id)}">Supprimer</button></div>`).join("")||'<div class="admin-empty">Aucune publication.</div>'}</div></section>`; }
function renderAdminPages(){ if(!adminGuard())return routeTo("home"); const items=adminPagesData(); return `${routeBackBar("Administration","admin")}<section class="admin-dashboard admin-subpage"><div class="admin-head"><div><span class="eyebrow">TAFAß · PAGES</span><h1>Pages</h1><p>Pages réelles depuis Supabase.</p></div></div><div class="admin-panel">${items.map(x=>`<div class="admin-row"><div class="admin-avatar">📄</div><div class="admin-grow"><b>${esc(x.name||"Page")}</b><small>@${esc(x.username||"")} · owner ${esc(x.owner_id||"")}</small></div><button class="btn ghost danger" data-action="adminDeletePage" data-id="${esc(x.id)}">Supprimer</button></div>`).join("")||'<div class="admin-empty">Aucune Page.</div>'}</div></section>`; }
function renderAdminGroups(){ if(!adminGuard())return routeTo("home"); const items=adminGroupsData(); return `${routeBackBar("Administration","admin")}<section class="admin-dashboard admin-subpage"><div class="admin-head"><div><span class="eyebrow">TAFAß · COMMUNAUTÉS</span><h1>Groupes</h1><p>Groupes réels depuis Supabase.</p></div></div><div class="admin-panel">${items.map(x=>`<div class="admin-row"><div class="admin-avatar">👥</div><div class="admin-grow"><b>${esc(x.name||"Groupe")}</b><small>${esc(x.privacy||"")} · ${Number(x.member_count||0)} membres</small></div><button class="btn ghost danger" data-action="adminDeleteGroup" data-id="${esc(x.id)}">Supprimer</button></div>`).join("")||'<div class="admin-empty">Aucun Groupe.</div>'}</div></section>`; }
function renderAdminComments(){ if(!adminGuard())return routeTo("home"); const items=adminCommentsData(); return `${routeBackBar("Administration","admin")}<section class="admin-dashboard admin-subpage"><div class="admin-head"><div><span class="eyebrow">TAFAß · COMMENTAIRES</span><h1>Commentaires</h1><p>Commentaires réels depuis Supabase.</p></div></div><div class="admin-panel">${items.map(x=>`<div class="admin-row"><div class="admin-grow"><b>${esc((x.text||"Commentaire").slice(0,120))}</b><small>${esc(x.user_id||"")} · ${timeAgo(x.created_at)}</small></div><button class="btn ghost danger" data-action="adminDeleteComment" data-id="${esc(x.id)}">Supprimer</button></div>`).join("")||'<div class="admin-empty">Aucun commentaire.</div>'}</div></section>`; }
function renderAdminMessages(){ if(!adminGuard())return routeTo("home"); const items=adminCollection("messages"); return `${routeBackBar("Administration","admin")}<section class="admin-dashboard admin-subpage"><div class="admin-head"><div><span class="eyebrow">TAFAß · MESSAGES</span><h1>Messages</h1><p>Statistiques et aperçu de l'activité des messages. Le contenu privé n'est pas affiché automatiquement.</p></div></div><div class="admin-panel"><div class="admin-message-safe"><span>🔒</span><div><b>Respect de la vie privée</b><small>Cette section affiche uniquement le volume chargé. Les conversations privées ne sont pas ouvertes automatiquement à l'administrateur.</small></div><strong>${items.length}</strong></div></div></section>`; }
function renderAdminSettings(){ if(!adminGuard())return routeTo("home"); return `${routeBackBar("Administration","admin")}<section class="admin-dashboard admin-subpage"><div class="admin-head"><div><span class="eyebrow">TAFAß · CONFIGURATION</span><h1>Paramètres Admin</h1><p>Contrôles visuels et sécurité du centre d'administration.</p></div></div><div class="admin-panel"><div class="admin-setting-row"><div><b>Protection du rôle Admin</b><small>Compte Supabase Auth officiel uniquement.</small></div><span class="admin-pill green">ACTIVÉ</span></div><div class="admin-setting-row"><div><b>Supabase / Realtime</b><small>Aucune modification de schéma depuis ce panneau.</small></div><span class="admin-pill green">PRÉSERVÉ</span></div><div class="admin-setting-row"><div><b>Modération</b><small>Publications, signalements et badges.</small></div><span class="admin-pill blue">PRÊT</span></div></div></section>`; }

function renderSuggestions(n){const users=state.users.filter(u=>u.id!==state.current&&!isFriend(u.id)).slice(0,n);return users.length?users.map(u=>`<div class="list-item">${avatar(u,"avatar sm")}<div class="list-main"><b>${esc(displayName(u))}</b><small>@${esc(u.username)}</small></div><button class="link-btn" data-action="addFriend" data-id="${u.id}">Ajouter</button></div>`).join(""):`<div class="empty">Pas encore de suggestions.</div>`;}

function bindPageEvents(){
  document.querySelectorAll("[data-route]").forEach(el=>el.onclick=(e)=>{e.preventDefault();routeTo(el.dataset.route);});
  document.querySelectorAll("[data-action]").forEach(el=>el.onclick=(e)=>handleAction(e,el));
  document.querySelectorAll("[data-comment-form]").forEach(form=>form.onsubmit=async e=>{
    e.preventDefault();const postId=form.dataset.commentForm,text=form.querySelector("input").value.trim();if(!text)return;
    if(!supabaseReady()||!state.current){toast("Connexion requise");return;}
    try{
      const {error}=await SB.from("comments").insert({post_id:postId,user_id:state.current,text:text,content:text});
      if(error)throw error;
      await loadSupabasePosts();save();render();toast("Commentaire publié ✓");
    }catch(err){console.error(err);toast("Commentaire impossible : "+(err.message||"erreur Supabase"));}
  });
  const convSearch=document.getElementById("conversationSearch");
  if(convSearch){
    convSearch.value=window.messageConversationQuery||"";
    convSearch.oninput=()=>{window.messageConversationQuery=convSearch.value;render();};
  }
  document.querySelectorAll("[data-chat-form]").forEach(form=>form.onsubmit=async e=>{e.preventDefault();const id=form.dataset.chatForm,text=form.querySelector('[name="text"]').value.trim(),input=form.querySelector('input[type=file]'),files=[...(input?.files||[])];if(!text&&!files.length)return;await sendMessage(id,text,files);form.reset();render();});
  const theme=$("themeSelect");if(theme)theme.onchange=()=>{state.settings.dark=theme.value==="dark";save();applyTheme();};
  const lang=$("languageSelect");if(lang)lang.onchange=()=>{state.settings.language=lang.value;save();toast("Langue enregistrée");};
  const ps=$("pageSearchInput");const pf=$("pageSearchForm");if(ps){ps.oninput=()=>{window.globalSearchQuery=ps.value;const top=$("globalSearch");if(top)top.value=ps.value;};}if(pf){pf.onsubmit=e=>{e.preventDefault();const q=ps?.value.trim()||"";if(!q)return;committedSearchQuery=q;if(openSearchDeepLink(q))return;state.searches=[q,...state.searches.filter(x=>x!==q)].slice(0,15);save();render();searchSupabaseGlobal(q).then(()=>{if(committedSearchQuery===q)render();});};}
  const ms=$("mediaSearchInput");if(ms)ms.oninput=()=>{window.mediaSearch=ms.value;clearTimeout(window.mediaSearchTimer);window.mediaSearchTimer=setTimeout(render,180);};
  const fs=$("friendsSearchInput");if(fs)fs.oninput=()=>{friendSearch=fs.value;clearTimeout(window.friendSearchTimer);window.friendSearchTimer=setTimeout(render,150);};
  const cs=$("conversationSearch");if(cs)cs.oninput=()=>{const q=cs.value.toLowerCase().trim();document.querySelectorAll(".conversation-row").forEach(x=>x.style.display=x.textContent.toLowerCase().includes(q)?"flex":"none");const box=$("messagePeopleResults");if(box){if(!q){box.innerHTML="";return;}const people=state.users.filter(u=>u.id!==state.current&&(displayName(u)+" "+(u.username||"")).toLowerCase().includes(q)).slice(0,6);box.innerHTML=people.map(u=>`<button class="message-person-result" data-action="startPersonConversation" data-id="${u.id}">${avatar(u,"avatar sm")}<span><b>${esc(displayName(u))}</b><small>@${esc(u.username||"")}</small></span>${isOnline(u)?`<i class="online-dot"></i>`:""}</button>`).join("")||`<div class="message-search-empty">Aucune personne</div>`;}};
  const mk=$("marketSearch");if(mk)mk.oninput=()=>{window.marketSearch=String(mk.value||"");clearTimeout(window.marketSearchTimer);window.marketSearchTimer=setTimeout(render,180);};
}
async function handleAction(e,el){
  const a=el.dataset.action,id=el.dataset.id||el.dataset.groupId;
  if(a==="admin"){ if(!isAdminAccount()) return toast("Accès administrateur refusé"); return routeTo("admin"); }
  if(a==="openBadge") return routeTo("badge");
  if(a==="closeModal")return closeModal();
  if(a==="copyLink"){ closeModal(); return copyAppLink(id); }
  if(a==="nativeShareLink"){ const url=appLink(id); if(navigator.share){navigator.share({title:"Tafaß",url}).catch(()=>{});} else copyAppLink(id,"Lien copié"); return; }
  if(a==="shareLink")return shareLink(id);
  if(a==="openComposer")return openComposer(el.dataset.kind||"post");
  if(a==="feedFilter"){
    window.tafaHomeFeedFilter=el.dataset.filter||"all";
    render();
    return;
  }
  if(a==="refreshFeed"){
    if(!supabaseReady()) return toast("Supabase non disponible");
    try{
      await loadSupabasePosts();
      try{ await loadSupabaseFriends(); }catch(friendErr){ console.warn("Actualisation amis ignorée:",friendErr); }
      save(); render(); toast("Actualités actualisées ✓");
    }catch(err){
      console.error("refreshFeed:",err);
      toast("Actualisation impossible : "+(err.message||"erreur Supabase"));
    }
    return;
  }
  if(a==="createMarketplace")return createMarketplace();
  if(a==="createStory")return openStory();
  if(a==="viewStory")return viewStory(id);
  if(a==="downloadStory"){const st=state.stories.find(x=>x.id===id);if(st)return downloadData(st.media,`Tafaß-story-${id}`);return;}
  if(a==="storyReact"){const st=state.stories.find(x=>x.id===id);if(!st)return;try{if(supabaseReady())await reactStorySupabase(id,"❤️");else{st.reactions=st.reactions||{};st.reactions[state.current]="❤️";save();}if(st.ownerId!==state.current)await notify(st.ownerId,"story_reaction",`${displayName(me())} a réagi à votre Story.`);await loadSupabaseStories();closeModal();toast("Réaction envoyée ✓");}catch(err){console.error(err);toast("Réaction impossible : "+(err.message||"erreur Supabase"));}return;}
  if(a==="deleteStory"){const st=state.stories.find(x=>x.id===id);if(!st)return;try{if(supabaseReady())await deleteStorySupabase(st);else{state.stories=state.stories.filter(x=>x.id!==id);save();}closeModal();render();toast("Story supprimée ✓");}catch(err){console.error(err);toast("Suppression impossible : "+(err.message||"erreur Supabase"));}return;}
  if(a==="downloadMedia"){const p=state.posts.find(x=>x.id===id);if(p)return downloadData(p.media,`Tafaß-${p.id}`);return;}
  if(a==="viewMedia"){const p=state.posts.find(x=>x.id===id);if(p)return openMediaViewer(p);return;}
  if(a==="downloadMarketMedia"){const x=(state.marketplace||[]).find(x=>x.id===id);if(x)return downloadData(x.image,`Tafaß-${x.title||"annonce"}`);return;}
  if(a==="viewMarketMedia"){const x=(state.marketplace||[]).find(x=>x.id===id);if(x?.image)return modal(x.title,`<div class="media-viewer"><img src="${esc(x.image)}"><button class="btn primary wide" data-action="downloadMarketMedia" data-id="${x.id}">⇩ Enregistrer</button></div>`);return;}
  if(a==="messageSearch")return document.querySelector("#conversationSearch")?.focus();
  if(a==="clearPageSearch"){window.globalSearchQuery="";const top=$("globalSearch");if(top)top.value="";return render();}
  if(a==="clearMediaSearch"){window.mediaSearch="";return render();}
  if(a==="togglePostText"){
    if(expandedPostTextIds.has(id)) expandedPostTextIds.delete(id); else expandedPostTextIds.add(id);
    return render();
  }
  if(a==="react")return reactPost(id,"J'aime");
  if(a==="reactionMenu")return reactionMenu(id);
  if(a==="chooseReaction"){openReactionPostId=null;return reactPost(id,el.dataset.reaction);}
  if(a==="goBack"){return goBack(el.dataset.backTarget||"menu");}
  if(a==="comment"){document.querySelector(`[data-comment-form="${id}"] input`)?.focus();return;}
  if(a==="share")return sharePost(id);
  if(a==="save"){state.saved=state.saved.includes(id)?state.saved.filter(x=>x!==id):[...state.saved,id];save();render();return;}
  if(a==="postMore")return postMore(id);
  if(a==="reportPost"){closeModal(); if(supabaseReady()){const {error}=await SB.rpc("tafa_admin_report",{p_target_type:"post",p_target_id:id,p_reason:"Publication signalée",p_details:""}); if(error)return toast("Signalement impossible : "+error.message);} state.reports.push({id:uid("report"),type:"post",targetId:id,userId:state.current,createdAt:new Date().toISOString()});save();return toast("Publication signalée ✓");}
  if(a==="hidePost"){closeModal();state.posts=state.posts.filter(p=>p.id!==id);save();render();return toast("Publication masquée");}
  if(a==="likeComment")return toggleCommentLike(id);
  if(a==="replyComment")return replyComment(id);
  if(a==="toggleReplies")return toggleCommentReplies(id);
  if(a==="editComment")return editComment(id);
  if(a==="deleteComment")return deleteComment(id);
  if(a==="addFriend")return sendFriend(id);
  if(a==="acceptFriend")return acceptFriend(id);
  if(a==="declineFriend")return declineFriend(id);
  if(a==="removeFriend")return removeFriend(id);
  if(a==="follow")return toggleFollow(id);
  if(a==="followPage")return togglePageFollow(id);
  if(a==="messageUser"||a==="messagePage")return startConversation(id);
  if(a==="attachFile"){const form=el.closest("form");form?.querySelector("input[type=file]")?.click();return;}
  if(a==="downloadMessageFile"){const all=state.messages.flatMap(m=>m.files||[m.file]).filter(Boolean);const f=all.find(x=>String(x.id||'')===String(id));const src=messageFileUrl(f);if(src){const link=document.createElement("a");link.href=src;link.download=f?.name||"Tafaß-fichier";link.target="_blank";link.rel="noopener";document.body.appendChild(link);link.click();link.remove();}else toast("Fichier introuvable");return;}
  if(a==="messageMore"){
    const m=state.messages.find(x=>String(x.id)===String(id));
    if(!m)return;
    return modal("Options du message",`<div class="premium-options"><button class="menu-card-premium" data-action="deleteMessage" data-id="${esc(id)}"><span>⌫</span><strong>Supprimer ce message</strong></button><button class="menu-card-premium" data-action="closeModal"><span>×</span><strong>Annuler</strong></button></div>`);
  }
  if(a==="deleteMessage")return deleteMessage(id);
  if(a==="conversationMore"){
    return modal("Options de la conversation",`<div class="premium-options"><button class="menu-card-premium danger" data-action="deleteConversation" data-id="${esc(id)}"><span>⌫</span><strong>Supprimer toute la conversation</strong></button><button class="menu-card-premium" data-action="closeModal"><span>×</span><strong>Annuler</strong></button></div>`);
  }
  if(a==="deleteConversation")return deleteConversation(id);
  if(a==="viewProfile")return routeToProfile(id);
  if(a==="settingChoice"){
    const key=el.dataset.settingKey, label=el.dataset.settingLabel, opts=JSON.parse(el.dataset.settingOptions||"[]");
    modal(label,`<div class="setting-choice-modal-v91">${opts.map(v=>`<button class="setting-choice-v91 ${state.settings?.[key]===v?"active":""}" data-action="applySettingChoice" data-key="${esc(key)}" data-value="${esc(v)}"><span>${state.settings?.[key]===v?"✓":""}</span><b>${esc(v)}</b><i>›</i></button>`).join("")}</div>`); return;
  }
  if(a==="applySettingChoice"){ state.settings=state.settings||{}; state.settings[el.dataset.key]=el.dataset.value; if(el.dataset.key==="preferences-0"){state.settings.dark=el.dataset.value==="Sombre";} if(el.dataset.key==="preferences-1"||el.dataset.key==="langue-0"){state.settings.language=el.dataset.value;} save(); closeModal(); applyTheme(); render(); toast("Réglage appliqué"); return; }
  if(a==="changePassword")return changePassword();
  if(a==="editPersonalInfo")return editProfile();
  if(a==="openNotificationSettings")return routeTo("notifications");
  if(a==="openPrivacy")return routeTo("privacy");
  if(a==="openSecurity")return routeTo("security");
  if(a==="openLanguage")return routeTo("language");
  if(a==="openDevices")return routeTo("devices");
  if(a==="openPayments")return routeTo("payments");
  if(a==="openFindFriends")return openFindFriends();
  if(a==="friendTab"){friendTab=el.dataset.tab||"friends";return render();}

  if(a==="searchFilter"){searchFilter=el.dataset.filter;return render();}
  if(a==="profileFriendsAll"){profileFriendsAll=true;return render();}
  if(a==="clearSearches"){state.searches=[];save();render();return;}
  if(a==="useSearch"){$("globalSearch").value=el.dataset.q;routeTo("search");return;}
  if(a==="openSearchResult"){if(el.dataset.kind==="Personnes")return routeToProfile(id);if(el.dataset.kind==="Pages"){editingPageId=id;return routeTo("pageView");}if(el.dataset.kind==="Publications")return modal("Publication",renderPost(state.posts.find(p=>p.id===id)||{}));if(el.dataset.kind==="Groupes")return routeTo("groups");return toast("Résultat ouvert");}
  if(a==="markAllRead"){
    state.notifications.forEach(n=>{if(n.userId===state.current)n.read=true});
    if(supabaseReady()&&state.current){
      SB.from('notifications').update({is_read:true}).eq('user_id',state.current).eq('is_read',false).then(({error})=>{if(error)console.warn('Mark notifications read:',error.message);});
    }
    save();render();return;
  }
  if(a==="clearNotifications"){
    const uid=state.current;
    state.notifications=state.notifications.filter(n=>n.userId!==uid);
    if(supabaseReady()&&uid){
      SB.from('notifications').delete().eq('user_id',uid).then(({error})=>{if(error)console.warn('Clear notifications:',error.message);});
    }
    save();render();return;
  }
  if(a==="readNotif"){const n=state.notifications.find(x=>x.id===id);if(n){n.read=true; if(supabaseReady()&&n.id){SB.from('notifications').update({is_read:true}).eq('id',n.id).eq('user_id',state.current).then(()=>{}).catch(()=>{});} save();
    if(n.postId||n.commentId){
      window.tafaNotificationTarget={postId:n.postId||null,commentId:n.commentId||null};
      routeTo('home');
      setTimeout(()=>{const target=n.commentId?document.querySelector(`[data-comment=\"${CSS.escape(n.commentId)}\"]`):(n.postId?document.querySelector(`[data-post=\"${CSS.escape(n.postId)}\"]`):null);target?.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>{window.tafaNotificationTarget=null;},1400);},180);
      return;
    }
    if(n.type==='message'){routeTo('messages');return;}
    if(n.type==='marketplace_contact'){routeTo('marketplace');return;}
    if(n.actorId && (n.type==='friend'||n.type==='friend_request'||n.type==='friend_request_accepted'||n.type==='follow'||n.type==='mention'||n.type==='story_reaction'||n.type==='story_reply')){routeToProfile(n.actorId);return;}
    render();
  }return;}
  if(a==="newConversation")return newConversation();
  if(a==="startPersonConversation")return startConversation(id);
  if(a==="selectConversation"){activeConversation=id;render();markConversationRead(id).then(()=>{if(activeConversation===id)render();});return;}
  if(a==="backToMessages"){activeConversation=null;stopVoiceCall(false);render();return;}
  if(a==="attachFile"){const target=el.closest("form")?.querySelector('input[type=file]')||document.querySelector(`input[type=file][id="chatFile_${activeConversation}"]`);target?.click();return;}
  if(a==="recordVoice")return toggleVoiceRecording();
  if(a==="voiceCall")return voiceCall(id,false);
  if(a==="voiceVideoCall")return voiceCall(id,true);
  if(a==="acceptCall")return acceptVoiceCall();
  if(a==="declineCall"){stopVoiceCall(true);return;}
  if(a==="createPage")return createPage();
  if(a==="viewPage"){editingPageId=id;return routeTo("pageView");}
  if(a==="pageSettings"){
    const p=findPage(id); if(!p||p.ownerId!==state.current) return toast("Accès réservé au propriétaire de la Page.");
    return modal("Paramètres de la Page",`<div class="premium-options"><button class="menu-card-premium" data-action="editPage" data-id="${esc(id)}"><span>✎</span><strong>Modifier les informations</strong></button><button class="menu-card-premium" data-action="shareLink" data-id="${esc(id)}"><span>🔗</span><strong>Copier le lien de la Page</strong></button><button class="menu-card-premium danger" data-action="deletePage" data-id="${esc(id)}"><span>⌫</span><strong>Supprimer définitivement la Page</strong><small>Cette action est irréversible.</small></button></div>`);
  }
  if(a==="pageMore"){const p=findPage(id);if(!p)return;const own=p.ownerId===state.current;return modal("Options de la Page",`<div class="premium-options">${own?`<button class="menu-card-premium" data-action="editPage" data-id="${id}"><span>✎</span><strong>Modifier la Page</strong></button><button class="menu-card-premium" data-action="pageSettings" data-id="${id}"><span>⚙</span><strong>Paramètres de la Page</strong></button><button class="menu-card-premium" data-action="switchPage" data-id="${id}"><span>▤</span><strong>Passer en mode Page</strong></button><button class="menu-card-premium danger" data-action="deletePage" data-id="${id}"><span>⌫</span><strong>Supprimer définitivement la Page</strong></button><button class="menu-card-premium" data-action="shareLink" data-id="${id}"><span>🔗</span><strong>Copier le lien de la Page</strong></button>`:`<button class="menu-card-premium" data-action="followPage" data-id="${id}"><span>＋</span><strong>${state.follows.some(f=>f.from===state.current&&f.to===id)?"Ne plus suivre":"Suivre"}</strong></button><button class="menu-card-premium" data-action="messagePage" data-id="${id}"><span>◈</span><strong>Message</strong></button><button class="menu-card-premium" data-action="reportProfile" data-id="${id}"><span>⚑</span><strong>Signaler la Page</strong></button><button class="menu-card-premium" data-action="shareLink" data-id="${id}"><span>🔗</span><strong>Copier le lien de la Page</strong></button>`}</div>`);}
  if(a==="pageModeHome"){pageTab="posts";return render();}
  if(a==="pageModeMessages"){return routeTo("messages");}
  if(a==="pageModeVideos"){pageTab="reels";return render();}
  if(a==="pageModeNotifications"){return routeTo("notifications");}
  if(a==="pageModeSearch"){return routeTo("search");}
  if(a==="pageModeMenu"){return routeTo("menu");}
  if(a==="switchPage"){state.pageMode=id;editingPageId=id;pageTab="posts";save();toast("Vous êtes passé en mode Page");return routeTo("pageView");}
  if(a==="leavePageMode"){state.pageMode=null;save();return routeTo("profile");}
  if(a==="editPage")return editPage(id);
  if(a==="groupPick"){
    const input=document.querySelector(`[data-group-file-input][data-group-id="${CSS.escape(el.dataset.groupId||"")}"]`);
    if(input) input.click();
    return;
  }
  if(a==="createGroup")return createGroup();
  if(a==="joinGroup")return joinGroup(id);
  if(a==="leaveGroup")return leaveGroup(id);
  if(a==="viewGroup")return viewGroup(id);
  if(a==="manageGroup")return manageGroup(id);
  if(a==="deleteGroup")return deleteGroup(id);
  if(a==="groupFilter"){window.groupFilter=event?.currentTarget?.dataset?.filter||"all";return render();}
  if(a==="editProfile")return editProfile();
  if(a==="editCover")return editCover();
  if(a==="refreshProfile"){
    const target=id||profileViewingId||state.current;
    if(!target||!supabaseReady()) return toast("Session Supabase introuvable.");
    try{
      await loadSupabaseProfileById(target);
      if(target===state.current){
        await loadSupabaseFriends();
        await loadSupabasePosts();
      }
      if(profileViewingId===target||target===state.current) render();
      toast("Profil actualisé.");
    }catch(err){ console.error("refreshProfile:",err); toast(err?.message||"Impossible d'actualiser le profil."); }
    return;
  }
  if(a==="deletePost"){
    const p=state.posts.find(x=>x.id===id); if(!p)return;
    if(p.ownerId!==state.current)return toast("Vous ne pouvez pas supprimer cette publication.");
    if(supabaseReady()){const {error}=await SB.from("posts").delete().eq("id",id);if(error)return toast("Suppression impossible");}
    state.posts=state.posts.filter(x=>x.id!==id);save();closeModal();render();return toast("Publication supprimée");
  }
  if(a==="editPost")return editPost(id);
  if(a==="reportMarket"){ if(supabaseReady()){const {error}=await SB.rpc("tafa_admin_report",{p_target_type:"marketplace",p_target_id:id,p_reason:"Annonce signalée",p_details:""}); if(error)return toast("Signalement impossible : "+error.message);} state.reports.push({id:uid("report"),type:"marketplace",targetId:id,userId:state.current,createdAt:new Date().toISOString()});save();closeModal();return toast("Annonce signalée ✓");}
  if(a==="deleteMarket"){const x=(state.marketplace||[]).find(v=>v.id===id);if(x?.ownerId===state.current){state.marketplace=state.marketplace.filter(v=>v.id!==id);save();closeModal();render();toast("Annonce supprimée");}return;}
  if(a==="createEvent")return createEvent();
  if(a==="startBadge")return badgeWizard();
  if(a==="openBadge")return routeTo("badge");
  if(a==="approveBadge")return badgeDecision(id,true);
  if(a==="rejectBadge")return badgeDecision(id,false);
  if(a==="adminRefresh"){await loadRealAdminData();render();return toast("Données Admin actualisées ✓");}
  if(a==="adminDeleteUser"){if(!confirm("Supprimer définitivement ce compte et ses données ?"))return; const {error}=await SB.rpc("tafa_admin_delete_user",{p_user_id:id}); if(error)return toast("Suppression impossible : "+error.message); await loadRealAdminData(); render(); return toast("Compte supprimé ✓");}
  if(a==="adminToggleUserStatus"){const status=el.dataset.status||"banned"; const {error}=await SB.rpc("tafa_admin_set_user_status",{p_user_id:id,p_status:status}); if(error)return toast("Action impossible : "+error.message); await loadRealAdminData(); render(); return toast(status==="banned"?"Compte banni ✓":"Compte réactivé ✓");}
  if(a==="adminUsers")return routeTo("admin-users");
  if(a==="adminReports")return routeTo("admin-reports");
  if(a==="adminBadges")return routeTo("admin-badges");
  if(a==="adminPosts")return routeTo("admin-posts");
  if(a==="adminPages")return routeTo("admin-pages");
  if(a==="adminGroups")return routeTo("admin-groups");
  if(a==="adminComments")return routeTo("admin-comments");
  if(a==="adminMessages")return routeTo("admin-messages");
  if(a==="adminSettings")return routeTo("admin-settings");
  if(a==="adminDeletePost"){ if(!confirm("Supprimer définitivement cette publication ?"))return; const {error}=await SB.rpc("tafa_admin_delete_post",{p_post_id:id}); if(error)return toast("Suppression impossible : "+error.message); await loadRealAdminData(); render(); return toast("Publication supprimée ✓"); }
  if(a==="adminDeleteComment"){ if(!confirm("Supprimer définitivement ce commentaire ?"))return; const {error}=await SB.rpc("tafa_admin_delete_comment",{p_comment_id:id}); if(error)return toast("Suppression impossible : "+error.message); await loadRealAdminData(); render(); return toast("Commentaire supprimé ✓"); }
  if(a==="adminDeletePage"){ if(!confirm("Supprimer définitivement cette Page ?"))return; const {error}=await SB.rpc("tafa_admin_delete_page",{p_page_id:id}); if(error)return toast("Suppression impossible : "+error.message); await loadRealAdminData(); render(); return toast("Page supprimée ✓"); }
  if(a==="adminDeleteGroup"){ if(!confirm("Supprimer définitivement ce Groupe ?"))return; const {error}=await SB.rpc("tafa_admin_delete_group",{p_group_id:id}); if(error)return toast("Suppression impossible : "+error.message); await loadRealAdminData(); render(); return toast("Groupe supprimé ✓"); }
  if(a==="adminResolveReport"){ const {error}=await SB.rpc("tafa_admin_resolve_report",{p_report_id:id,p_status:"resolved"}); if(error)return toast("Impossible de traiter le signalement : "+error.message); await loadRealAdminData(); render(); return toast("Signalement traité ✓"); }
  if(a==="adminApproveBadge")return badgeDecision(id,true);
  if(a==="adminRejectBadge")return badgeDecision(id,false);
  if(a==="helpTopic"){ const t=el.dataset.topic; const help={"Compte et connexion":"Gérez la connexion, l'inscription, le changement de mot de passe et la déconnexion.","Publications et Stories":"Créez, modifiez, supprimez, enregistrez et partagez vos contenus. La visibilité peut être Public, Amis ou Moi uniquement.","Amis et abonnés":"Envoyez des invitations, acceptez ou refusez des demandes et gérez vos abonnements.","Messages et appels":"Recherchez une personne, ouvrez sa conversation, envoyez du texte, des photos, vidéos, audio et fichiers, utilisez les messages vocaux et passez des appels audio/vidéo en temps réel.","Pages et groupes":"Créez une Page ou un groupe, publiez au nom de votre Page et gérez les membres.","Badge bleu":"Demandez le badge bleu en 5 étapes pour 25 000 Ar/mois. Le paiement reste simulé localement.","Confidentialité":"Réglez la visibilité de votre profil, bio, photos, situation amoureuse, pseudo, publications et Stories.","Sécurité":"Modifiez votre mot de passe, surveillez les sessions et activez la vérification en deux étapes dans le prototype.","Marketplace":"Publiez des annonces, recherchez des produits et contactez un vendeur.","Recherche":"Recherchez des personnes, comptes, Pages, groupes, publications, photos, vidéos et Reels."}; return modal(t,`<div class="help-topic-card-v91"><div class="help-topic-icon-v91">?</div><p>${esc(help[t]||"Cette rubrique contient les informations d'utilisation de Tafaß.")}</p><button class="btn primary wide" data-action="closeModal">Compris</button></div>`); }
  if(a==="setProfilePrivacy"){
    const u=me(); if(!u) return toast("Profil introuvable.");
    const key=el.dataset.privacyKey; const options=JSON.parse(el.dataset.settingOptions||"[]");
    const current=u.privacy?.[key]||"Public";
    return modal("Confidentialité · "+(el.dataset.settingLabel||"Information"),`<div class="privacy-choice-panel-v91"><p>Choisissez qui peut voir cette information sur votre profil.</p><div class="privacy-choice-list-v91">${options.map(v=>`<button type="button" class="menu-card-premium ${v===current?"active":""}" data-action="saveProfilePrivacy" data-privacy-key="${esc(key)}" data-privacy-value="${esc(v)}"><span>${v==="Public"?"🌐":v==="Amis"?"♧":"🔒"}</span><strong>${esc(v)}</strong><small>${v==="Public"?"Tout le monde":v==="Amis"?"Vos amis uniquement":"Vous uniquement"}</small>${v===current?"<b>✓</b>":""}</button>`).join("")}</div></div>`);
  }
  if(a==="saveProfilePrivacy"){
    const u=me(); if(!u) return;
    const key=el.dataset.privacyKey, value=el.dataset.privacyValue;
    u.privacy={...(u.privacy||{}),[key]:value};
    try{ await saveCurrentProfileToSupabase(u); closeModal(); render(); toast("Confidentialité enregistrée ✓"); }
    catch(err){ console.error("saveProfilePrivacy:",err); toast("Impossible d'enregistrer la confidentialité : "+(err?.message||"erreur Supabase")); }
    return;
  }
  if(a==="applySettings"){state.settings=state.settings||{};document.querySelectorAll("[data-setting-key]").forEach(x=>{state.settings[x.dataset.settingKey]=x.value});save();toast("Paramètres appliqués");return;}
  if(a==="switchAccount")return openAccountSwitcher();
  if(a==="addAccount"){
    closeModal();
    (async()=>{
      try{
        if(supabaseReady()) await SB.auth.signOut();
        state.current=null; state.users=[]; state.posts=[]; state.comments=[]; state.notifications=[];
        save();
        render();
        $("authScreen")?.classList.remove("hidden");
        $("appScreen")?.classList.add("hidden");
        $("loginIdentifier")?.focus();
      }catch(e){console.error("Ajout de compte:",e);toast("Impossible d'ouvrir la connexion.");}
    })();
    return;
  }

  if(a==="selectAccount"){return switchSupabaseAccount(el.dataset.id);}
  if(a==="logout"){
    (async()=>{try{await signOutSupabase();state.pageMode=null;route="home";render();toast("Session déconnectée");}
    catch(e){console.error(e);toast("Impossible de se déconnecter.");}})();
    return;
  }
  if(a==="postMore")return postMore(id);
  if(a==="reportPost"){closeModal();state.reports.push({id:uid("report"),type:"post",targetId:id,userId:state.current,createdAt:new Date().toISOString()});save();return toast("Publication signalée");}
  if(a==="hidePost"){closeModal();state.posts=state.posts.filter(p=>p.id!==id);save();render();return toast("Publication masquée");}
  if(a==="reactionMenu")return reactionMenu(id);
  if(a==="react")return reactPost(id,"👍");
  if(a==="comment")return document.querySelector(`[data-comment-form="${id}"] input`)?.focus();
  if(a==="share")return sharePost(id);
  if(a==="save"){const i=state.saved.indexOf(id);if(i>=0)state.saved.splice(i,1);else state.saved.push(id);save();render();return;}
  if(a==="profileTab"){profileTab=el.dataset.tab||"posts";profileFriendsAll=false;return render();}
  if(a==="pageTab"){pageTab=el.dataset.tab||"posts";return render();}
  if(a==="profile"){profileViewingId=state.current;return routeTo("profile");}
  if(a==="profileStat"){const labels={friends:"amis",followers:"abonnés",following:"suivis"};toast(`${labels[el.dataset.stat]||"statistiques"} : affichage prêt`);return;}
  if(a==="profileMore"){const u=findUser(id);if(!u)return; if(id===state.current)return profileOwnMenu(); return profileOtherMenu(id);}
  if(a==="deleteAccount")return confirmDeleteAccount();
  if(a==="deleteAccountFinal")return deleteAccountFinal();
  if(a==="deletePage")return deletePage(id);
  if(a==="profileOwnMenu")return profileOwnMenu();
  if(a==="profileOtherMenu")return profileOtherMenu(id);
  if(a==="viewAs")return toast("Aperçu public du profil");
  if(a==="profileStatus")return modal("Statut du profil",`<div class="premium-options"><button class="menu-card-premium" data-action="toggleOnline">${isOnline(me())?"🟢 En ligne":"⚪ Hors ligne"}</button></div>`);
  if(a==="toggleOnline"){const u=me();u.online=!u.online;save();closeModal();render();return;}
  if(a==="archive")return modal("Archives",`<div class="premium-options"><button class="menu-card-premium" data-action="archiveStories"><span>◉</span><strong>Stories archivées</strong></button><button class="menu-card-premium" data-action="archivePosts"><span>▣</span><strong>Publications supprimées</strong></button></div>`);
  if(a==="archiveStories")return toast("Archive Stories prête");
  if(a==="archivePosts")return toast("Archive des publications prête");
  if(a==="activityHistory")return routeTo("activity");
  if(a==="friendLinks")return modal("Liens d'amitié",`<p>Les liens d'amitié communs apparaîtront ici.</p>`);
  if(a==="followPrefs")return modal("Suivre",`<div class="modal-option-list"><button data-action="follow" data-id="${id}">Par défaut</button><button data-action="follow" data-id="${id}">Favoris</button><button data-action="follow" data-id="${id}">Ne plus suivre</button></div>`);
  if(a==="reportProfile")return closeModal(),toast("Profil signalé localement");
  if(a==="blockProfile")return closeModal(),toast("Profil bloqué localement");
  if(a==="viewProfile")return routeToProfile(id);
  if(a==="settingChoice"){
    const key=el.dataset.settingKey, label=el.dataset.settingLabel, opts=JSON.parse(el.dataset.settingOptions||"[]");
    modal(label,`<div class="setting-choice-modal-v91">${opts.map(v=>`<button class="setting-choice-v91 ${state.settings?.[key]===v?"active":""}" data-action="applySettingChoice" data-key="${esc(key)}" data-value="${esc(v)}"><span>${state.settings?.[key]===v?"✓":""}</span><b>${esc(v)}</b><i>›</i></button>`).join("")}</div>`); return;
  }
  if(a==="applySettingChoice"){ state.settings=state.settings||{}; state.settings[el.dataset.key]=el.dataset.value; if(el.dataset.key==="preferences-0"){state.settings.dark=el.dataset.value==="Sombre";} if(el.dataset.key==="preferences-1"||el.dataset.key==="langue-0"){state.settings.language=el.dataset.value;} save(); closeModal(); applyTheme(); render(); toast("Réglage appliqué"); return; }
  if(a==="changePassword")return changePassword();
  if(a==="editPersonalInfo")return editProfile();
  if(a==="openNotificationSettings")return routeTo("notifications");
  if(a==="openPrivacy")return routeTo("privacy");
  if(a==="openSecurity")return routeTo("security");
  if(a==="openLanguage")return routeTo("language");
  if(a==="openDevices")return routeTo("devices");
  if(a==="openPayments")return routeTo("payments");
  if(a==="viewPage"){editingPageId=id;return routeTo("pageView");}
  if(a==="pageModeHome"){pageTab="posts";return render();}
  if(a==="pageModeMessages"){return routeTo("messages");}
  if(a==="pageModeVideos"){pageTab="reels";return render();}
  if(a==="pageModeNotifications"){return routeTo("notifications");}
  if(a==="pageModeSearch"){return routeTo("search");}
  if(a==="pageModeMenu"){return routeTo("menu");}
  if(a==="viewStory")return viewStory(id);
  if(a==="createStory")return openStory();
  if(a==="mediaFilter"){mediaFilter=el.dataset.filter||"all";return render();}
  if(a==="marketMore")return marketMore(id);
  if(a==="openMarketItem"){const item=(state.marketplace||[]).find(x=>x.id===id);if(item)return modal(item.title,`<div class="market-modal"><span class="type-pill">${esc(item.kind||"Produit")}</span><h3>${esc(item.price||"Prix à définir")}</h3><p>${esc(item.description||"")}</p><p class="muted">${esc(item.location||"Madagascar")}</p>${item.ownerId!==state.current?`<button class="btn primary wide" data-action="messageSeller" data-id="${item.id}">Contacter le vendeur</button>`:`<div class="market-owner-note">C'est votre annonce.</div>`}</div>`);return;}
  if(a==="messageSeller")return startMarketplaceConversation(id);
  if(a==="marketFilter"){marketFilter=el.dataset.filter||"all";return render();}
  if(a==="forgotBtn")return forgot();
}

async function deletePage(id){
  const page=findPage(id);
  if(!page || String(page.ownerId)!==String(state.current)) return toast("Vous ne pouvez supprimer que votre propre Page.");
  const ok=confirm(`Supprimer définitivement la Page « ${page.name||""} » ?\n\nCette action supprime la Page et ses contenus associés selon les règles Supabase.`);
  if(!ok) return;
  try{
    if(supabaseReady()){
      const {error}=await SB.from("pages").delete().eq("id",id).eq("owner_id",state.current);
      if(error) throw error;
    }
    state.pages=(state.pages||[]).filter(p=>String(p.id)!==String(id));
    if(state.pageMode===id) state.pageMode=null;
    if(editingPageId===id) editingPageId=null;
    save(); render(); toast("Page supprimée définitivement ✓");
  }catch(err){ console.error("deletePage:",err); toast("Suppression de la Page impossible : "+(err?.message||"erreur Supabase")); }
}

function confirmDeleteAccount(){
  modal("Supprimer définitivement le compte",`<div class="delete-account-panel-v87">
    <div class="delete-account-warning-v87">⚠️</div>
    <h3>Cette action est définitive</h3>
    <p>Votre profil, vos Pages, vos Groupes, vos messages et les données liées à votre compte seront supprimés selon la politique de suppression Tafaß.</p>
    <p class="delete-account-note-v87">Pour terminer la suppression complète, le projet Supabase doit avoir installé <b>ACCOUNT_DELETE_V1.sql</b> fourni avec cette version.</p>
    <label class="delete-account-check-v87"><input id="deleteAccountConfirm" type="checkbox"> <span>Je comprends que cette action est irréversible.</span></label>
    <button class="btn danger wide" data-action="deleteAccountFinal">Supprimer définitivement mon compte</button>
  </div>`);
}

async function deleteAccountFinal(){
  const check=$("deleteAccountConfirm");
  if(!check?.checked) return toast("Confirmez d’abord la suppression définitive.");
  if(!supabaseReady()) return toast("Supabase est nécessaire pour supprimer le compte.");
  const btn=document.querySelector('[data-action="deleteAccountFinal"]');
  if(btn){btn.disabled=true;btn.textContent="Suppression en cours…";}
  try{
    const {data,error}=await SB.rpc("tafa_delete_my_account");
    if(error) throw error;
    if(data===false) throw new Error("La suppression du compte n’a pas été confirmée par Supabase.");
    state.current=null; state.users=[]; state.posts=[]; state.comments=[]; state.notifications=[]; state.messages=[]; state.conversations=[]; state.pages=[]; state.groups=[];
    activeConversation=null; selectedGroupId=null; profileViewingId=null; state.pageMode=null;
    save();
    try{await SB.auth.signOut();}catch(_){}
    closeModal();
    render();
    $("authScreen")?.classList.remove("hidden");
    $("appScreen")?.classList.add("hidden");
    toast("Compte supprimé définitivement ✓");
  }catch(err){
    console.error("deleteAccountFinal:",err);
    if(btn){btn.disabled=false;btn.textContent="Supprimer définitivement mon compte";}
    toast("Suppression impossible : "+(err?.message||"Vérifiez ACCOUNT_DELETE_V1.sql dans Supabase."));
  }
}

async function deleteMessage(id){
  const m=state.messages.find(x=>String(x.id)===String(id));
  if(!m)return;
  if(!confirm("Supprimer définitivement ce message ?"))return;
  try{
    if(supabaseReady()){const {error}=await SB.rpc("tafa_delete_message",{p_message_id:id});if(error)throw error;}
    state.messages=state.messages.filter(x=>String(x.id)!==String(id));
    save();closeModal();render();toast("Message supprimé ✓");
  }catch(err){console.error("deleteMessage:",err);toast("Suppression du message impossible : "+(err?.message||"Vérifiez ACCOUNT_DELETE_V1.sql."));}
}

async function deleteConversation(id){
  if(!confirm("Supprimer définitivement toute cette conversation et ses messages ?"))return;
  try{
    if(supabaseReady()){const {error}=await SB.rpc("tafa_delete_conversation",{p_conversation_id:id});if(error)throw error;}
    state.messages=state.messages.filter(x=>String(x.conversationId)!==String(id));
    state.conversations=state.conversations.filter(x=>String(x.id)!==String(id));
    if(activeConversation===id)activeConversation=null;
    save();closeModal();render();toast("Conversation supprimée ✓");
  }catch(err){console.error("deleteConversation:",err);toast("Suppression de la conversation impossible : "+(err?.message||"Vérifiez ACCOUNT_DELETE_V1.sql."));}
}

function profileOwnMenu(){modal("Mon profil",`<div class="premium-options"><button class="menu-card-premium" data-action="viewAs"><span>◉</span><strong>Voir en tant que</strong></button><button class="menu-card-premium" data-action="editProfile"><span>✎</span><strong>Modifier</strong></button><button class="menu-card-premium" data-action="profileStatus"><span>●</span><strong>Statut du profil</strong></button><button class="menu-card-premium" data-action="archive"><span>▣</span><strong>Archive</strong></button><button class="menu-card-premium" data-action="activityHistory"><span>◷</span><strong>Historique d'activité</strong></button><button class="menu-card-premium" data-action="shareLink" data-id="${state.current}"><span>🔗</span><strong>Copier le lien du profil</strong></button><button class="menu-card-premium danger" data-action="deleteAccount"><span>⌫</span><strong>Supprimer définitivement mon compte</strong></button></div>`);}
function profileOtherMenu(id){modal("Options du profil",`<div class="premium-options"><button class="menu-card-premium" data-action="reportProfile" data-id="${id}"><span>⚑</span><strong>Signaler le profil</strong></button><button class="menu-card-premium" data-action="blockProfile" data-id="${id}"><span>⊘</span><strong>Bloquer</strong></button>${isFriend(id)?`<button class="menu-card-premium" data-action="removeFriend" data-id="${id}"><span>−</span><strong>Retirer</strong></button>`:""}<button class="menu-card-premium" data-action="friendLinks" data-id="${id}"><span>♧</span><strong>Voir les liens d'amitié</strong></button><button class="menu-card-premium" data-action="followPrefs" data-id="${id}"><span>◉</span><strong>Suivre</strong></button><button class="menu-card-premium" data-action="shareLink" data-id="${id}"><span>🔗</span><strong>Copier le lien du profil</strong></button></div>`);}
async function toggleCommentLike(id){
  const c=state.comments.find(x=>x.id===id);
  if(!c || !supabaseReady() || !state.current) return toast("Connexion requise");
  const liked=!!c.likes?.[state.current];
  try{
    const {data,error}=await SB.rpc("tafa_set_comment_like",{p_comment_id:id,p_like:!liked});
    if(error) throw error;
    c.likes=c.likes||{};
    if(liked) delete c.likes[state.current]; else c.likes[state.current]=true;
    save(); render();
  }catch(err){
    console.error("toggleCommentLike:",err);
    toast("J'aime impossible : "+(err.message||"erreur Supabase"));
  }
}

function replyComment(id){
  const c=state.comments.find(x=>x.id===id); if(!c)return;
  modal("Répondre",`<form id="replyForm"><textarea id="replyText" required placeholder="Votre réponse..."></textarea><button class="btn primary wide">Répondre</button></form>`);
  $("replyForm").onsubmit=async e=>{
    e.preventDefault(); const text=$("replyText").value.trim(); if(!text)return;
    try{
      const {error}=await SB.from("comments").insert({post_id:c.postId,parent_id:c.id,user_id:state.current,text:text,content:text});
      if(error)throw error;
      await loadSupabasePosts();save();closeModal();render();toast("Réponse publiée ✓");
    }catch(err){console.error(err);toast("Réponse impossible : "+(err.message||"erreur Supabase"));}
  };
}
function toggleCommentReplies(id){
  if(expandedCommentReplies.has(id)) expandedCommentReplies.delete(id);
  else expandedCommentReplies.add(id);
  render();
}
function editComment(id){
  const c=state.comments.find(x=>x.id===id);
  if(!c||c.userId!==state.current)return;
  modal("Modifier le commentaire",`<form id="editCommentForm"><textarea id="editCommentText" required>${esc(c.text)}</textarea><button class="btn primary wide">Enregistrer</button></form>`);
  $("editCommentForm").onsubmit=async e=>{
    e.preventDefault();
    const text=$("editCommentText").value.trim(); if(!text)return;
    try{
      const {error}=await SB.from("comments").update({text:text,content:text,edited_at:new Date().toISOString()}).eq("id",id).eq("user_id",state.current);
      if(error)throw error;
      await loadSupabasePosts();save();closeModal();render();toast("Commentaire modifié ✓");
    }catch(err){console.error(err);toast("Modification impossible : "+(err.message||"erreur Supabase"));}
  };
}
async function deleteComment(id){
  const c=state.comments.find(x=>x.id===id);
  if(!c||c.userId!==state.current)return;
  try{
    const {error}=await SB.from("comments").delete().eq("id",id).eq("user_id",state.current);
    if(error)throw error;
    await loadSupabasePosts();save();render();toast("Commentaire supprimé ✓");
  }catch(err){console.error(err);toast("Suppression impossible : "+(err.message||"erreur Supabase"));}
}

async function routeToProfile(id){
  if(!id) return;
  profileViewingId=id;
  route="profile";
  render();
  const existing=findUser(id);
  if(!existing && supabaseReady()){
    await loadSupabaseProfileById(id);
    if(profileViewingId===id && route==="profile") render();
  }else if(existing && supabaseReady() && id!==state.current){
    // Refresh the profile so Recherche always opens the latest Supabase data.
    await loadSupabaseProfileById(id);
    if(profileViewingId===id && route==="profile") render();
  }
}
async function reactPost(id,type){
  const p=state.posts.find(x=>x.id===id);if(!p)return;
  if(!supabaseReady()||!state.current){toast("Connexion requise");return;}
  try{
    const old=p.myReaction?.[state.current]||null;
    const next=old===type?null:type;
    const {data,error}=await SB.rpc("tafa_set_post_reaction",{p_post_id:id,p_reaction:next});
    if(error)throw error;
    // Notification de réaction: générée côté SQL pour garantir la livraison.
    await loadSupabasePosts();save();render();
  }catch(err){
    console.error("reactPost:",err);
    toast("Réaction impossible : "+(err.message||"erreur Supabase"));
  }
}
async function sharePost(id){
  const p=state.posts.find(x=>x.id===id);
  if(!p)return;
  if(!supabaseReady()||!state.current){toast("Connexion requise");return;}
  try{
    const {error}=await SB.rpc("tafa_increment_post_share",{p_post_id:id});
    if(error)throw error;
    // Notification de partage: générée côté SQL avec l'incrément du compteur.
    await loadSupabasePosts();
    save(); render();
    toast("Publication partagée ✓");
  }catch(err){
    console.error("sharePost:",err);
    toast("Partage impossible : "+(err.message||"erreur Supabase"));
  }
}

function editPost(id){
 const p=state.posts.find(x=>x.id===id);
 if(!p||p.ownerId!==state.current)return toast("Vous ne pouvez modifier que vos propres publications.");

 const original={text:p.text||"",visibility:p.visibility||"Public",editedAt:p.editedAt||null};
 modal("Modifier la publication",`<form id="editPostForm" class="premium-form">
   <label>Texte<textarea id="editPostText" maxlength="5000" required>${esc(original.text)}</textarea></label>
   <label>Visibilité<select id="editPostVisibility">
     <option ${original.visibility==="Public"?"selected":""}>Public</option>
     <option ${original.visibility==="Amis"?"selected":""}>Amis</option>
     <option ${original.visibility==="Sélection personnalisée"?"selected":""}>Sélection personnalisée</option>
     <option ${original.visibility==="Moi uniquement"?"selected":""}>Moi uniquement</option>
   </select></label>
   <div class="form-actions"><button type="button" class="btn secondary" data-action="closeModal">Annuler</button><button id="editPostSaveBtn" class="btn primary wide" type="submit">Enregistrer les modifications</button></div>
 </form>`);

 const form=$("editPostForm");
 if(!form)return;
 form.onsubmit=async e=>{
   e.preventDefault();
   const btn=$("editPostSaveBtn");
   const text=$("editPostText").value.trim();
   const visibility=$("editPostVisibility").value;
   if(!text)return toast("Le texte de la publication ne peut pas être vide.");

   if(btn){btn.disabled=true;btn.textContent="Enregistrement...";}
   try{
     const editedAt=new Date().toISOString();
     if(supabaseReady()){
       const {error}=await SB.from("posts")
         .update({
           content:text,
           visibility:postVisibilityToDb(visibility),
           updated_at:editedAt
         })
         .eq("id",p.id)
         .eq("user_id",state.current);
       if(error)throw error;
     }

     p.text=text;
     p.visibility=visibility;
     p.editedAt=editedAt;
     save();
     closeModal();
     render();
     toast("Publication modifiée ✓");
   }catch(error){
     console.error("Modification publication:",error);
     if(btn){btn.disabled=false;btn.textContent="Enregistrer les modifications";}
     toast("Modification impossible : "+(error?.message||"Erreur Supabase"));
   }
 };
}
function postMore(id){
  const p=state.posts.find(x=>x.id===id); if(!p)return;
  const own=p.ownerId===state.current;
  modal("Options de la publication",`<div class="premium-action-sheet-v85">
    <button class="action-sheet-item-v85" data-action="save" data-id="${id}"><span>🔖</span><b>${state.saved.includes(id)?"Retirer des enregistrements":"Enregistrer"}</b><i>›</i></button>
    <button class="action-sheet-item-v85" data-action="share" data-id="${id}"><span>↗</span><b>Partager</b><i>›</i></button>
    <button class="action-sheet-item-v85" data-action="shareLink" data-id="${id}"><span>🔗</span><b>Copier le lien</b><i>›</i></button>
    <button class="action-sheet-item-v85" data-action="reportPost" data-id="${id}"><span>⚑</span><b>Signaler</b><i>›</i></button>
    <button class="action-sheet-item-v85" data-action="hidePost" data-id="${id}"><span>⊘</span><b>Masquer</b><i>›</i></button>
    ${own?`<button class="action-sheet-item-v85" data-action="editPost" data-id="${id}"><span>✎</span><b>Modifier</b><i>›</i></button><button class="action-sheet-item-v85 danger" data-action="deletePost" data-id="${id}"><span>⌫</span><b>Supprimer</b><i>›</i></button>`:""}
  </div>`);
}
function marketMore(id){
  const x=(state.marketplace||[]).find(v=>v.id===id);if(!x)return;
  const own=x.ownerId===state.current;
  modal("Options de l'annonce",`<div class="premium-action-sheet-v85">
    <button class="action-sheet-item-v85" data-action="viewMarketMedia" data-id="${id}"><span>◉</span><b>Voir la photo</b><i>›</i></button>
    <button class="action-sheet-item-v85" data-action="downloadMarketMedia" data-id="${id}"><span>⇩</span><b>Enregistrer</b><i>›</i></button>
    <button class="action-sheet-item-v85" data-action="messageSeller" data-id="${x.id}"><span>◈</span><b>Contacter</b><i>›</i></button>
    <button class="action-sheet-item-v85" data-action="reportMarket" data-id="${id}"><span>⚑</span><b>Signaler</b><i>›</i></button>
    ${own?`<button class="action-sheet-item-v85 danger" data-action="deleteMarket" data-id="${id}"><span>⌫</span><b>Supprimer</b><i>›</i></button>`:""}
  </div>`);
}
function reactionMenu(id){
  openReactionPostId=openReactionPostId===id?null:id;
  render();
}
function fileToData(file){if(!file)return Promise.resolve("");return new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>res("");r.readAsDataURL(file);});}
async function openStory(){
  modal("Créer une Story",`<form id="storyForm" class="premium-form">
    <label>Texte<textarea id="storyText" placeholder="Votre Story..."></textarea></label>
    <label>Visibilité<select id="storyVisibility"><option>Public</option><option>Amis</option></select></label>
    <label>Photo / vidéo<input id="storyFile" type="file" accept="image/*,video/*"></label>
    <small class="field-help">Image · 15 Mo max · Vidéo · 100 Mo max · durée 24 h</small>
    <button id="storySubmit" class="btn primary wide">Publier</button>
  </form>`);
  $("storyForm").onsubmit=async e=>{
    e.preventDefault();
    const text=$("storyText")?.value.trim()||"", file=$("storyFile")?.files?.[0]||null, visibility=$("storyVisibility")?.value||"Public";
    if(!text&&!file){toast("Ajoutez un texte ou un fichier.");return;}
    const btn=$("storySubmit"); if(btn){btn.disabled=true;btn.textContent="Publication…";}
    try{
      if(supabaseReady()){
        await createSupabaseStory({text,file,visibility});
      }else{
        const media=await fileToData(file);
        state.stories.unshift({id:uid("story"),ownerId:state.current,ownerType:"user",text,media,views:[],reactions:{},replies:[],visibility,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+24*3600e3).toISOString()});
        save();
      }
      closeModal(); render(); toast("Story publiée ✓");
    }catch(err){console.error(err);toast("Story impossible : "+(err.message||"erreur Supabase"));}
    finally{if(btn){btn.disabled=false;btn.textContent="Publier";}}
  };
}
async function viewStory(id){
  let s=state.stories.find(x=>x.id===id);
  if(!s) return;
  if(supabaseReady()){
    try{ await loadSupabaseStories(); s=state.stories.find(x=>x.id===id)||s; }catch(_e){}
  }
  const owner=s?.ownerType==="page"?findPage(s.ownerId):findUser(s.ownerId);
  if(!s||!owner)return;
  if(s.ownerId!==state.current){
    s.views=s.views||[]; if(!s.views.includes(state.current))s.views.push(state.current);
    if(supabaseReady()) await markStoryViewed(id); else save();
  }
  const viewers=(s.views||[]).map(x=>findUser(x)).filter(Boolean);
  const reactions=Object.keys(s.reactions||{}).length;
  modal(displayName(owner),`<div class="story-viewer">
    ${s.media?`<div class="media-click">${String(s.media).match(/\.(mp4|webm|mov|m4v)(\?|$)/i)?`<video src="${esc(s.media)}" controls autoplay playsinline></video>`:`<img src="${esc(s.media)}" alt="Story de ${esc(displayName(owner))}">`}<button class="btn secondary wide" data-action="downloadStory" data-id="${id}">⇩ Enregistrer</button></div>`:""}
    <p>${esc(s.text||"")}</p>
    <div class="story-actions"><button data-action="storyReact" data-id="${id}">❤️ Réagir${reactions?` · ${reactions}`:""}</button>${s.ownerId===state.current?`<button class="btn secondary" data-action="deleteStory" data-id="${id}">Supprimer</button>`:""}</div>
    ${s.ownerId===state.current?`<div class="story-viewers"><b>${viewers.length} vues</b>${viewers.map(v=>`<span>${avatar(v,"avatar xs")} ${esc(displayName(v))}</span>`).join("")||"<small>Aucune vue</small>"}</div>`:""}
    <form id="storyReplyForm"><input id="storyReplyText" placeholder="Répondre à cette Story..." required><button class="btn primary">Envoyer</button></form>
  </div>`);
  $("storyReplyForm").onsubmit=async e=>{
    e.preventDefault(); const text=$("storyReplyText")?.value.trim(); if(!text)return;
    try{
      if(supabaseReady()) await replyStorySupabase(id,text);
      else {s.replies=s.replies||[];s.replies.push({userId:state.current,text,createdAt:new Date().toISOString()});save();}
      if(s.ownerId!==state.current) await notify(s.ownerId,"story_reply",`${displayName(me())} a répondu à votre Story.`,null,null);
      closeModal(); toast("Réponse envoyée ✓");
    }catch(err){console.error(err);toast("Réponse impossible : "+(err.message||"erreur Supabase"));}
  };
}
function toggleFollow(id){if(id===state.current)return;const i=state.follows.findIndex(f=>f.from===state.current&&f.to===id);if(i>=0)state.follows.splice(i,1);else{state.follows.push({from:state.current,to:id,createdAt:new Date().toISOString()});notify(id,"follow",`${displayName(me())} vous suit maintenant.`);}save();render();}
function togglePageFollow(id){const p=findPage(id);if(!p)return;const i=state.follows.findIndex(f=>f.from===state.current&&f.to===id);if(i>=0){state.follows.splice(i,1);p.followers=Math.max(0,(p.followers||0)-1);}else{state.follows.push({from:state.current,to:id,createdAt:new Date().toISOString()});p.followers=(p.followers||0)+1;notify(p.ownerId,"follow",`${displayName(me())} suit votre Page.`);}save();render();}
async function startMarketplaceConversation(listingId){
  const item=(state.marketplace||[]).find(x=>x.id===listingId);
  if(!item) return toast("Annonce introuvable.");
  if(!state.current) return toast("Connectez-vous pour contacter le vendeur.");
  if(item.ownerId===state.current) return toast("Vous êtes le propriétaire de cette annonce.");
  const ownerId=item.ownerId;
  let c=state.conversations.find(c=>c.type==="private"&&Array.isArray(c.members)&&c.members.includes(state.current)&&c.members.includes(ownerId));
  if(!c){
    c={id:crypto.randomUUID(),type:"private",members:[state.current,ownerId],createdAt:new Date().toISOString()};
    if(supabaseReady()){
      try{ await persistConversation(c); }
      catch(e){ console.error("startMarketplaceConversation:",e); toast("Conversation impossible : "+(e.message||"erreur Supabase")); return; }
    }
    state.conversations.push(c);
    save();
  }
  activeConversation=c.id;
  if(ownerId!==state.current) await notify(ownerId,'marketplace_contact',`${displayName(me())} souhaite vous contacter à propos de « ${item.title||'votre annonce'} ».`);
  routeTo("messages");
  if(supabaseReady()) await loadSupabaseMessages();
  render();
}
async function startConversation(id){
  if(!state.current || !id || id===state.current) return;
  let c=state.conversations.find(c=>c.type==='private'&&Array.isArray(c.members)&&c.members.includes(state.current)&&c.members.includes(id));
  if(!c){
    c={id:crypto.randomUUID(),type:'private',members:[state.current,id],createdAt:new Date().toISOString()};
    if(supabaseReady()){
      try{ await persistConversation(c); }
      catch(e){ console.error('startConversation:',e); toast('Conversation impossible : '+(e.message||'erreur Supabase')); return; }
    }
    state.conversations.push(c); save();
  }
  activeConversation=c.id;
  routeTo('messages');
  if(supabaseReady()) await loadSupabaseMessages();
  render();
}

function newConversation(){
  const people=state.users.filter(u=>u.id!==state.current).map(u=>`<option value="${u.id}">${esc(displayName(u))} (@${esc(u.username)})</option>`).join("");
  modal("Nouveau message",`<form id="newConvForm"><label>Destinataire<select id="newConvUser" required>${people}</select></label><label>Premier message<textarea id="newConvText"></textarea></label><div class="actions"><button type="button" class="btn secondary" data-action="createGroup">＋ Groupe</button><button class="btn primary">Créer la conversation</button></div></form>`);
  $("newConvForm").onsubmit=e=>{e.preventDefault();startConversation($("newConvUser").value).then(()=>{
    const c=state.conversations.find(c=>c.id===activeConversation);
    if($("newConvText").value.trim() && c) sendMessage(c.id,$("newConvText").value.trim());
    closeModal(); render();
  });};
}
async function persistMessageAttachment(messageId,uploaded){
  if(!supabaseReady()||!messageId||!uploaded) return {ok:false};
  try{
    const authUser=(await SB.auth.getUser())?.data?.user;
    const uploaderId=authUser?.id||state.current;
    if(!uploaderId) throw new Error('Utilisateur non connecté.');

    const payload={
      message_id:messageId,
      uploader_id:uploaderId,
      file_url:uploaded.url||null,
      file_name:uploaded.name||'Fichier',
      mime_type:uploaded.type||'application/octet-stream',
      file_size:Number(uploaded.size||0),
      storage_path:uploaded.path||null
    };
    const {data,error}=await SB.from('message_attachments').insert(payload).select('id').single();
    if(error) throw error;
    return {ok:true,id:data?.id||null};
  }catch(error){
    // The attachment bridge is secondary: the message itself already stores
    // media_url/file_name/mime_type, so an RLS/schema difference must not make
    // the whole media message fail.
    console.warn('[TAFA MESSAGES ATTACHMENT]',error?.message||error);
    return {ok:false,error};
  }
}

async function sendMessage(convId,text,fileOrFiles){
  const c=state.conversations.find(x=>x.id===convId);
  if(!c || !state.current) return;
  const to=c.type==='group'?null:(c.members?.find(x=>x!==state.current)||null);
  const rawFiles=Array.isArray(fileOrFiles)?fileOrFiles.filter(Boolean):fileOrFiles?[fileOrFiles]:[];
  try{
    await persistConversation(c);
    if(text){
      const m={id:crypto.randomUUID(),conversationId:convId,from:state.current,to,text,files:[],file:null,read:false,createdAt:new Date().toISOString(),messageType:'text'};
      if(supabaseReady()) await persistMessage(m); else state.messages.push(m);
    }
    for(const raw of rawFiles){
      updateMessageUploadProgress(convId,raw.name||"Fichier",0,"Préparation de l’envoi…");
      const uploaded=await uploadMessageFile(raw,(percent)=>{
        updateMessageUploadProgress(convId,raw.name||"Fichier",percent,percent>=100?"Finalisation…":"Envoi en cours…");
      });
      const m={id:crypto.randomUUID(),conversationId:convId,from:state.current,to,text:'',files:[{id:null,url:uploaded.url,path:uploaded.path,name:uploaded.name,size:uploaded.size,type:uploaded.type,messageType:uploaded.type.startsWith('audio/')?'audio':'file'}],file:{id:null,url:uploaded.url,path:uploaded.path,name:uploaded.name,size:uploaded.size,type:uploaded.type,messageType:uploaded.type.startsWith('audio/')?'audio':'file'},read:false,createdAt:new Date().toISOString(),messageType:uploaded.type.startsWith('audio/')?'audio':'file',mediaUrl:uploaded.url,fileName:uploaded.name,fileSize:uploaded.size,mimeType:uploaded.type};
      if(supabaseReady()) {
        await persistMessage(m);
        const attachmentResult=await persistMessageAttachment(m.id,uploaded);
        if(attachmentResult?.id){
          m.file.id=attachmentResult.id;
          m.files[0].id=attachmentResult.id;
        }
      } else state.messages.push(m);
      updateMessageUploadProgress(convId,raw.name||"Fichier",100,"Envoyé ✓");
    }
    if(rawFiles.length) finishMessageUploadProgress();
    if(supabaseReady()) await loadSupabaseMessages();
    if(to) await notify(to,'message',`${displayName(me())} vous a envoyé un message.`);
    save(); render();
  }catch(error){
    console.error('sendMessage:',error);
    if(rawFiles.length) failMessageUploadProgress();
    toast('Message impossible : '+(error.message||'erreur Supabase'));
  }
}

async function toggleVoiceRecording(){
  const c=state.conversations.find(x=>x.id===activeConversation);
  if(!c||!state.current) return;
  if(voiceRecording){
    voiceRecorder?.stop();
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder) return toast('Le message vocal n’est pas pris en charge par ce navigateur.');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const preferred=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(x=>MediaRecorder.isTypeSupported(x));
    voiceChunks=[];
    voiceRecorder=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);
    voiceRecording=true; render();
    voiceRecorder.ondataavailable=e=>{if(e.data?.size)voiceChunks.push(e.data)};
    voiceRecorder.onstop=async()=>{
      voiceRecording=false;
      stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(voiceChunks,{type:voiceRecorder.mimeType||'audio/webm'});
      voiceRecorder=null; voiceChunks=[]; render();
      if(blob.size<100) return;
      const file=new File([blob],`message-vocal-${Date.now()}.webm`,{type:blob.type||'audio/webm'});
      await sendMessage(c.id,'',[file]);
    };
    voiceRecorder.start();
  }catch(e){voiceRecording=false;toast('Microphone inaccessible : '+(e.message||'autorisation requise'));render();}
}

function callSignalName(uid){return `tafa-call-user-${uid}`;}
function startCallSignalChannel(){
  if(!supabaseReady()||!state.current||callSignalChannel) return;
  callSignalChannel=SB.channel(callSignalName(state.current));
  callSignalChannel.on('broadcast',{event:'call-signal'},async({payload})=>{
    if(!payload||payload.target!==state.current)return;
    try{await handleCallSignal(payload);}catch(e){console.warn('Call signal:',e);}
  }).subscribe();
}
async function sendCallSignal(target,data){
  if(!supabaseReady()||!target)return;
  const ch=SB.channel(callSignalName(target));
  await new Promise(resolve=>ch.subscribe(status=>{if(status==='SUBSCRIBED')resolve();}));
  await ch.send({type:'broadcast',event:'call-signal',payload:{...data,target,from:state.current}});
  setTimeout(()=>{try{SB.removeChannel(ch)}catch(e){}},2000);
}
function makePeer(remoteId,video=false){
  if(callPeer)callPeer.close();
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]});
  callPeer=pc; callRemoteUserId=remoteId;
  if(callLocalStream)callLocalStream.getTracks().forEach(t=>pc.addTrack(t,callLocalStream));
  pc.onicecandidate=e=>{if(e.candidate)sendCallSignal(remoteId,{kind:'ice',conversationId:activeCall?.conversationId,candidate:e.candidate.toJSON()});};
  pc.ontrack=e=>{callRemoteStream=e.streams[0];const audio=document.getElementById('tafaRemoteCallAudio');if(audio){audio.srcObject=callRemoteStream;audio.play().catch(()=>{});}const videoEl=document.getElementById('tafaRemoteCallVideo');if(videoEl&&video) {videoEl.srcObject=callRemoteStream;videoEl.play().catch(()=>{});}};
  pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState)) stopVoiceCall(true);};
  return pc;
}
async function voiceCall(remoteId,video=false){
  if(!remoteId||!state.current)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)return toast('Les appels ne sont pas pris en charge par ce navigateur.');
  const conv=state.conversations.find(c=>c.id===activeConversation);
  if(!conv)return toast('Ouvrez une conversation avant d’appeler.');
  try{
    callLocalStream=await navigator.mediaDevices.getUserMedia({audio:true,video:!!video});
    activeCall={conversationId:conv.id,remoteId,video,caller:true};
    const pc=makePeer(remoteId,video);
    const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
    await sendCallSignal(remoteId,{kind:'offer',conversationId:conv.id,video,offer:pc.localDescription});
    showCallModal(false,video,remoteId);
  }catch(e){stopVoiceCall(false);toast('Appel impossible : '+(e.message||'autorisation requise'));}
}
async function handleCallSignal(p){
  if(p.kind==='offer'){
    if(activeCall)return;
    activeCall={conversationId:p.conversationId,remoteId:p.from,video:!!p.video,caller:false,pendingOffer:p.offer};
    showCallModal(true,!!p.video,p.from);
    return;
  }
  if(!activeCall||activeCall.remoteId!==p.from)return;
  if(p.kind==='answer'&&callPeer){await callPeer.setRemoteDescription(new RTCSessionDescription(p.answer));for(const c of callIceQueue.splice(0))await callPeer.addIceCandidate(c);return;}
  if(p.kind==='ice'){if(callPeer?.remoteDescription)await callPeer.addIceCandidate(p.candidate);else callIceQueue.push(p.candidate);return;}
  if(p.kind==='hangup'){stopVoiceCall(false);return;}
}
function showCallModal(incoming,video,remoteId){
  const u=findUser(remoteId)||{name:'Utilisateur'};
  const title=incoming?'Appel entrant':'Appel en cours';
  const media=`<audio id="tafaRemoteCallAudio" autoplay playsinline></audio>${video?`<video id="tafaRemoteCallVideo" class="call-remote-video" autoplay playsinline></video>`:''}`;
  const body=incoming?`<div class="call-card-v1">${media}<div class="call-avatar">${avatar(u,'avatar')}</div><b>${esc(displayName(u))}</b><span>${video?'Appel vidéo':'Appel vocal'}</span><div class="call-actions"><button class="btn secondary" data-action="declineCall">Refuser</button><button class="btn primary" data-action="acceptCall">Accepter</button></div></div>`:`<div class="call-card-v1">${media}<div class="call-avatar">${avatar(u,'avatar')}</div><b>${esc(displayName(u))}</b><span>${video?'Appel vidéo':'Appel vocal'}…</span><div class="call-actions"><button class="btn danger" data-action="declineCall">Raccrocher</button></div></div>`;
  modal(title,body);
}
async function acceptVoiceCall(){
  if(!activeCall?.pendingOffer)return;
  try{
    callLocalStream=await navigator.mediaDevices.getUserMedia({audio:true,video:!!activeCall.video});
    const pc=makePeer(activeCall.remoteId,activeCall.video);
    await pc.setRemoteDescription(new RTCSessionDescription(activeCall.pendingOffer));
    for(const c of callIceQueue.splice(0))await pc.addIceCandidate(c);
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    await sendCallSignal(activeCall.remoteId,{kind:'answer',conversationId:activeCall.conversationId,video:activeCall.video,answer:pc.localDescription});
    delete activeCall.pendingOffer; closeModal(); showCallModal(false,activeCall.video,activeCall.remoteId);
  }catch(e){stopVoiceCall(false);toast('Impossible d’accepter l’appel : '+(e.message||''));}
}
function stopVoiceCall(send=true){
  if(send&&activeCall?.remoteId)sendCallSignal(activeCall.remoteId,{kind:'hangup',conversationId:activeCall.conversationId}).catch(()=>{});
  try{callPeer?.close()}catch(e){} callPeer=null;
  callLocalStream?.getTracks().forEach(t=>t.stop()); callLocalStream=null; callRemoteStream=null; callIceQueue=[]; callRemoteUserId=null; activeCall=null;
  closeModal();
}

async function createMarketplace(){
  if(!supabaseReady()) return toast("Supabase non disponible.");
  modal("Nouvelle annonce",`<form id="marketForm" class="premium-form">
    <label>Type<select id="mKind"><option>Produit</option><option>Service</option><option>Boutique</option></select></label>
    <label>Titre<input id="mTitle" required maxlength="120" placeholder="Ex. Smartphone, vêtement, service..."></label>
    <label>Prix<input id="mPrice" maxlength="60" placeholder="Ex. 250 000 Ar"></label>
    <label>Description<textarea id="mDesc" required maxlength="3000" placeholder="Décrivez clairement votre annonce..."></textarea></label>
    <label>Localisation<input id="mLoc" maxlength="120" placeholder="Antananarivo"></label>
    <label>Photo<input id="mFile" type="file" accept="image/*" required></label>
    <button class="btn primary wide" type="submit">Publier l'annonce</button>
  </form>`);
  const form=$("marketForm");
  form.onsubmit=async e=>{
    e.preventDefault();
    const btn=form.querySelector('button[type="submit"]');
    btn.disabled=true; btn.textContent="Publication...";
    try{
      const {data:{user},error:userError}=await SB.auth.getUser();
      if(userError) throw userError;
      if(!user?.id) throw new Error("Session Supabase introuvable.");
      const file=$("mFile").files[0];
      if(!file) throw new Error("Ajoutez une photo.");
      const image=await uploadMarketplaceImage(file);
      const id=crypto.randomUUID();
      const payload={
        id,
        owner_id:user.id,
        kind:$("mKind").value,
        title:$("mTitle").value.trim(),
        price:$("mPrice").value.trim(),
        description:$("mDesc").value.trim(),
        location:$("mLoc").value.trim()||"Madagascar",
        image_url:image||null
      };
      const {error}=await SB.from("marketplace_listings").insert(payload);
      if(error) throw error;
      await loadSupabaseMarketplace();
      closeModal(); render(); toast("Annonce publiée ✓");
    }catch(err){
      console.error("Marketplace:",err);
      toast("Publication impossible : "+(err.message||"erreur Supabase"));
    }finally{
      btn.disabled=false; btn.textContent="Publier l'annonce";
    }
  };
}
function createPage(){modal("Créer une Page",`<form id="pageForm"><label>Nom de la Page<input id="pName" required></label><label>Catégorie<select id="pCat">${PAGE_CATS.map(x=>`<option>${x}</option>`).join("")}</select></label><label>Username<input id="pUser" required placeholder="ma_page"></label><label>Description<textarea id="pDesc"></textarea></label><label>E-mail<input id="pEmail" type="email"></label><label>Téléphone<input id="pPhone"></label><label>Site web<input id="pWeb"></label><label>Adresse<input id="pAddress"></label><label>Horaires<input id="pHours"></label><label>Services / produits<textarea id="pServices"></textarea></label><button class="btn primary wide">Créer la Page</button></form>`);
  $("pageForm").onsubmit=e=>{e.preventDefault();const p={id:uid("page"),ownerId:state.current,name:$("pName").value.trim(),category:$("pCat").value,username:$("pUser").value.trim(),description:$("pDesc").value.trim(),email:$("pEmail").value.trim(),phone:$("pPhone").value.trim(),website:$("pWeb").value.trim(),address:$("pAddress").value.trim(),hours:$("pHours").value.trim(),services:$("pServices").value.trim(),followers:0,verified:false,type:"page",avatar:"",cover:"",createdAt:new Date().toISOString()};state.pages.push(p);save();closeModal();render();toast("Page créée");};
}
function editPage(id){const p=findPage(id);if(!p)return;modal("Modifier ma Page",`<form id="editPageForm"><label>Nom<input id="epName" value="${esc(p.name)}"></label><label>Description<textarea id="epDesc">${esc(p.description||"")}</textarea></label><label>Catégorie<select id="epCat">${PAGE_CATS.map(x=>`<option ${x===p.category?"selected":""}>${x}</option>`).join("")}</select></label><button class="btn primary wide">Enregistrer</button></form>`);$("editPageForm").onsubmit=e=>{e.preventDefault();p.name=$("epName").value;p.description=$("epDesc").value;p.category=$("epCat").value;save();closeModal();render();};}

async function loadSupabaseGroups(){
  if(!supabaseReady() || !state.current) return;
  try{
    const {data:groups,error}=await SB.from("groups").select("*").order("created_at",{ascending:false});
    if(error) throw error;

    const {data:members,error:meErr}=await SB.from("group_members").select("*");
    if(meErr) console.warn("group_members:",meErr.message);

    const rows=groups||[];
    const mems=members||[];
    const userIds=[...new Set(mems.map(m=>m.user_id).filter(Boolean))];
    if(userIds.length){
      const {data:profiles}=await SB.from("profiles").select("*").in("id",userIds);
      const map=new Map((state.users||[]).map(u=>[u.id,u]));
      (profiles||[]).forEach(p=>map.set(p.id,profileFromRow(p)));
      state.users=[...map.values()];
    }

    state.groups=rows.map(g=>{
      const gm=mems.filter(m=>String(m.group_id)===String(g.id));
      return {
        id:g.id,name:g.name,category:g.category,privacy:g.privacy,
        description:g.description||"",rules:g.rules||"",
        avatar_url:g.avatar_url||"",cover_url:g.cover_url||"",
        member_count:Number(g.member_count||0),owner_id:g.owner_id,
        created_at:g.created_at,updated_at:g.updated_at,
        ownerId:g.owner_id,
        members:gm.filter(m=>m.status==="active").map(m=>m.user_id),
        memberRows:gm,
        is_member:gm.some(m=>String(m.user_id)===String(state.current)&&m.status==="active"),
        my_role:(gm.find(m=>String(m.user_id)===String(state.current))||{}).role||null
      };
    });
    save();
  }catch(e){ console.warn("Supabase groups:",e?.message||e); }
}

async function loadSupabaseGroupPolls(groupId){
  if(!supabaseReady()||!groupId) return;
  try{
    const {data:polls,error}=await SB.from("group_polls").select("*").eq("group_id",groupId).order("created_at",{ascending:false});
    if(error) throw error;
    const ids=(polls||[]).map(p=>p.id);
    let options=[];
    if(ids.length){
      const {data:opts,error:oe}=await SB.from("group_poll_options").select("*").in("poll_id",ids).order("position",{ascending:true});
      if(!oe) options=opts||[];
    }
    let votes=[];
    if(ids.length){
      const {data:vs,error:ve}=await SB.from("group_poll_votes").select("*").in("poll_id",ids);
      if(!ve) votes=vs||[];
    }
    state.groupPolls=(polls||[]).map(p=>({
      ...p,
      options:options.filter(o=>String(o.poll_id)===String(p.id)),
      votes:votes.filter(v=>String(v.poll_id)===String(p.id))
    }));
    save();
  }catch(e){ console.warn("Supabase group polls:",e?.message||e); }
}

async function createSupabaseGroup(name,privacy,description){
  if(!supabaseReady()||!state.current) throw new Error("Session Supabase introuvable.");
  const auth=(await SB.auth.getUser()).data?.user;
  if(!auth?.id) throw new Error("Session Supabase introuvable.");
  const {data:g,error}=await SB.from("groups").insert({
    owner_id:auth.id,name,privacy,description:description||"",category:"Général",rules:""
  }).select("*").single();
  if(error) throw error;
  const {error:memberError}=await SB.from("group_members").insert({
    group_id:g.id,user_id:auth.id,role:"owner",status:"active"
  });
  if(memberError){
    try{await SB.from("groups").delete().eq("id",g.id);}catch(_){}
    throw memberError;
  }
  await loadSupabaseGroups();
  return g;
}

async function joinSupabaseGroup(id){
  if(!supabaseReady()||!state.current) throw new Error("Session Supabase introuvable.");
  const g=(state.groups||[]).find(x=>String(x.id)===String(id));
  if(!g) throw new Error("Groupe introuvable.");
  if(g.is_member) return;
  if(String(g.privacy)==="Privé"){
    const {error}=await SB.from("group_join_requests").upsert(
      {group_id:id,user_id:state.current,status:"pending",updated_at:new Date().toISOString()},
      {onConflict:"group_id,user_id"}
    );
    if(error) throw error;
    toast("Demande envoyée au propriétaire.");
  }else{
    const {error}=await SB.from("group_members").upsert(
      {group_id:id,user_id:state.current,role:"member",status:"active"},
      {onConflict:"group_id,user_id"}
    );
    if(error) throw error;
    toast("Vous avez rejoint le groupe.");
  }
  await loadSupabaseGroups(); render();
}

async function leaveSupabaseGroup(id){
  if(!supabaseReady()||!state.current) throw new Error("Session Supabase introuvable.");
  const g=(state.groups||[]).find(x=>String(x.id)===String(id));
  if(g?.owner_id===state.current) throw new Error("Le propriétaire ne peut pas quitter son groupe.");
  const {error}=await SB.from("group_members").delete().eq("group_id",id).eq("user_id",state.current);
  if(error) throw error;
  await loadSupabaseGroups(); render();
  toast("Vous avez quitté le groupe.");
}

async function deleteSupabaseGroup(id){
  if(!supabaseReady()||!state.current) throw new Error("Session Supabase introuvable.");
  const {error}=await SB.from("groups").delete().eq("id",id).eq("owner_id",state.current);
  if(error) throw error;
  await loadSupabaseGroups(); selectedGroupId=null; route="groups"; render();
  toast("Groupe supprimé.");
}

async function createGroupPost(groupId,text,file){
  if(!supabaseReady()||!state.current) throw new Error("Session Supabase introuvable.");
  const g=(state.groups||[]).find(x=>String(x.id)===String(groupId));
  if(!g?.is_member) throw new Error("Vous devez être membre du groupe.");

  let media_url=null, media_type="text";
  if(file){
    const uploaded=await uploadMessageFile(file,(p)=>{});
    media_url=uploaded.url;
    const mime=String(uploaded.type||"").toLowerCase();
    media_type=mime.startsWith("image/")?"image":mime.startsWith("video/")?"video":mime.startsWith("audio/")?"audio":"file";
  }
  const payload={
    id:crypto.randomUUID(),user_id:state.current,owner_id:state.current,
    content:String(text||""),media_url,media_type,
    visibility:"Public",group_id:groupId
  };
  const {data,error}=await SB.from("posts").insert(payload).select("*").single();
  if(error) throw error;
  return data;
}

async function createGroupPoll(groupId,question,options){
  if(!supabaseReady()||!state.current) throw new Error("Session Supabase introuvable.");
  const g=(state.groups||[]).find(x=>String(x.id)===String(groupId));
  if(!g?.is_member) throw new Error("Vous devez être membre du groupe.");
  const clean=options.map(x=>String(x).trim()).filter(Boolean).slice(0,8);
  if(!String(question||"").trim()||clean.length<2) throw new Error("Un sondage nécessite une question et au moins 2 choix.");
  const {data:poll,error}=await SB.from("group_polls").insert({
    group_id:groupId,creator_id:state.current,question:String(question).trim()
  }).select("*").single();
  if(error) throw error;
  const {error:oe}=await SB.from("group_poll_options").insert(
    clean.map((option,i)=>({poll_id:poll.id,option_text:option,position:i}))
  );
  if(oe) throw oe;
  await loadSupabaseGroupPolls(groupId);
}

async function voteGroupPoll(pollId,optionId){
  if(!supabaseReady()||!state.current) return;
  const {error}=await SB.from("group_poll_votes").upsert(
    {poll_id:pollId,option_id:optionId,user_id:state.current},
    {onConflict:"poll_id,user_id"}
  );
  if(error) throw error;
  const p=(state.groupPolls||[]).find(x=>String(x.id)===String(pollId));
  if(p) await loadSupabaseGroupPolls(p.group_id);
  render();
}

function renderGroups(){
  const groups=(state.groups||[]);
  return `${routeBackBar("Menu","menu")}<section class="groups-hub premium-page">
    <div class="groups-hub-head"><div><span class="eyebrow">TAFAß · COMMUNAUTÉS</span><h1>Groupes</h1><p>Vos communautés synchronisées en temps réel.</p></div>
      <button type="button" class="btn primary" data-action="createGroup">＋ Créer un groupe</button></div>
    <div class="groups-grid">
      ${groups.map(g=>`<article class="group-list-card">
        <div class="group-list-cover" ${g.cover_url?`style="background-image:url('${esc(g.cover_url)}')"`:""}><span>${g.privacy==="Privé"?"🔒":"🌐"}</span></div>
        <div class="group-list-body"><h3>${esc(g.name)}</h3><p>${esc(g.description||"Communauté Tafaß")}</p><small>👥 ${Number(g.member_count||g.members?.length||0)} membres · ${esc(g.category||"Général")}</small>
        <button type="button" class="btn primary wide" data-action="viewGroup" data-group-open="1" data-group-id="${esc(g.id)}" data-id="${esc(g.id)}">Voir le groupe</button></div>
      </article>`).join("") || `<div class="card empty"><b>Aucun groupe</b><p>Créez votre première communauté.</p></div>`}
    </div>
  </section>`;
}
function createGroup(){
  modal("Créer un groupe",`<form id="groupForm" class="premium-form">
    <label>Nom<input id="gName" maxlength="80" required></label>
    <label>Confidentialité<select id="gPrivacy"><option value="Public">Public</option><option value="Privé">Privé</option></select></label>
    <label>Description<textarea id="gDesc" maxlength="1000" placeholder="Décrivez votre groupe"></textarea></label>
    <button type="submit" class="btn primary wide">Créer le groupe</button>
  </form>`);
  $("groupForm").onsubmit=async e=>{
    e.preventDefault();
    const name=$("gName").value.trim(), privacy=$("gPrivacy").value, desc=$("gDesc").value.trim();
    if(!name)return toast("Le nom du groupe est obligatoire.");
    try{
      await createSupabaseGroup(name,privacy,desc);
      closeModal(); route="groups"; render(); toast("Groupe créé avec succès.");
    }catch(err){toast("Création impossible : "+(err?.message||"erreur Supabase"));}
  };
}
async function joinGroup(id){try{await joinSupabaseGroup(id);}catch(e){toast("Impossible : "+(e?.message||"erreur"));}}
async function leaveGroup(id){try{await leaveSupabaseGroup(id);}catch(e){toast("Impossible : "+(e?.message||"erreur"));}}
function viewGroup(id){
  const gid=String(id||"").trim();
  if(!gid){ toast("ID du groupe manquant."); return; }

  selectedGroupId=gid;
  route="groupView";

  const show=()=>{
    if(route!=="groupView" || String(selectedGroupId)!==gid) return;
    try{
      render();
    }catch(err){
      console.error("Erreur affichage groupe:",err);
      try{
        const main=document.getElementById("mainContent");
        if(main) main.innerHTML=renderGroup(gid);
        bindPageEvents();
      }catch(fallbackErr){
        console.error("Erreur affichage groupe fallback:",fallbackErr);
        toast("Impossible d'afficher ce groupe.");
      }
    }
  };

  // Render immediately from the current realtime state.
  show();

  // Refresh the group/member snapshot without changing the existing Supabase schema.
  if(supabaseReady() && typeof loadSupabaseGroups==="function"){
    loadSupabaseGroups().then(()=>{
      if(route==="groupView" && String(selectedGroupId)===gid){
        if(typeof loadSupabaseGroupPolls==="function") return loadSupabaseGroupPolls(gid).catch(()=>{});
      }
    }).then(show).catch(err=>{
      console.error("Actualisation groupe:",err);
    });
  }
}
function manageGroup(id){
  const g=(state.groups||[]).find(x=>String(x.id)===String(id));
  if(!g||String(g.owner_id)!==String(state.current))return toast("Accès refusé.");
  modal("Gérer le groupe",`<div class="premium-options">
    <button class="menu-card-premium" data-action="groupManageMembers" data-id="${esc(id)}"><span>👥</span><strong>Membres et rôles</strong></button>
    <button class="menu-card-premium" data-action="deleteGroup" data-id="${esc(id)}"><span>🗑</span><strong>Supprimer le groupe</strong></button>
    <button class="btn secondary wide" data-action="closeModal">Fermer</button>
  </div>`);
}
async function deleteGroup(id){
  if(!confirm("Supprimer définitivement ce groupe ?")) return;
  try{await deleteSupabaseGroup(id);}catch(e){toast("Suppression impossible : "+(e?.message||"erreur"));}
}
async function changePassword(){
  modal("Mot de passe",`<form id="passwordChangeForm" class="premium-form"><div class="form-note-v91">Votre mot de passe est géré directement par Supabase Auth. Il n'est jamais enregistré dans le navigateur.</div><label>Mot de passe actuel<input id="oldPass" type="password" autocomplete="current-password" required></label><label>Nouveau mot de passe<input id="newPass" type="password" autocomplete="new-password" minlength="6" required></label><label>Confirmer le nouveau mot de passe<input id="newPass2" type="password" autocomplete="new-password" minlength="6" required></label><button class="btn primary wide">Enregistrer le nouveau mot de passe</button></form>`);
  $("passwordChangeForm").onsubmit=async e=>{
    e.preventDefault();
    const btn=e.currentTarget.querySelector('button[type="submit"]');
    const b=$("newPass").value,c=$("newPass2").value;
    if(b.length<6)return toast("Le nouveau mot de passe doit contenir au moins 6 caractères.");
    if(b!==c)return toast("Les mots de passe ne correspondent pas.");
    if(!supabaseReady())return toast("Supabase n'est pas configuré.");
    try{
      if(btn){btn.disabled=true;btn.textContent="Vérification...";}
      const {data:{user},error:userError}=await SB.auth.getUser();
      if(userError||!user?.email)throw userError||new Error("Session Supabase introuvable.");
      const {error:verifyError}=await SB.auth.signInWithPassword({email:user.email,password:$("oldPass").value});
      if(verifyError)return toast("Mot de passe actuel incorrect.");
      if(btn)btn.textContent="Enregistrement...";
      const {error:updateError}=await SB.auth.updateUser({password:b});
      if(updateError)throw updateError;
      closeModal();
      toast("Mot de passe modifié avec succès.");
    }catch(err){
      console.error("Changement mot de passe Supabase:",err);
      toast(err?.message||"Impossible de modifier le mot de passe.");
    }finally{
      if(btn){btn.disabled=false;btn.textContent="Enregistrer le nouveau mot de passe";}
    }
  };
}

async function uploadProfileImage(file, kind){
  if(!file) return null;
  if(!supabaseReady()) throw new Error("Supabase non configuré");
  if(!file.type.startsWith("image/")) throw new Error("Fichier image requis.");
  if(file.size > 8 * 1024 * 1024) throw new Error("Image trop volumineuse (8 Mo maximum).");
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
  const path=`${state.current}/${kind}-${Date.now()}.${ext}`;
  const {error:upErr}=await SB.storage.from("profiles").upload(path,file,{upsert:true,contentType:file.type});
  if(upErr) throw upErr;
  const {data}=SB.storage.from("profiles").getPublicUrl(path);
  return data?.publicUrl||"";
}
async function saveCurrentProfileToSupabase(u){
  if(!supabaseReady()||!u?.id) throw new Error("Session Supabase introuvable.");
  const payload={
    id:u.id,
    first_name:u.firstName||"",
    last_name:u.lastName||"",
    birth:u.birth||null,
    gender:u.gender||"",
    username:(u.username||"").trim()||null,
    country:u.country||"Madagascar",
    phone_code:u.code||"",
    phone:u.phone||"",
    email:u.email||"",
    bio:u.bio||"",
    location:u.location||"",
    avatar_url:u.avatar||null,
    cover_url:u.cover||null,
    pseudo:u.pseudo||"",
    relationship_status:u.relationshipStatus||"",
    privacy:u.privacy||{}
  };
  const {data,error}=await SB.from("profiles").upsert(payload,{onConflict:"id"}).select("*").single();
  if(error) throw error;
  const fresh=profileFromRow(data);
  state.users=[fresh];
  state.current=fresh.id;
  save();
  return fresh;
}
function editProfile(){
  const u=me(); u.privacy=u.privacy||{};
  const opts=(key,selected)=>`<select id="${key}Privacy"><option ${selected==="Public"?"selected":""}>Public</option><option ${selected==="Amis"?"selected":""}>Amis</option><option ${selected==="Moi uniquement"?"selected":""}>Moi uniquement</option></select>`;
  modal("Modifier le profil",`<form id="profileForm" class="premium-form profile-edit-premium">
    <div class="profile-edit-section"><h3>Identité</h3><div class="edit-grid">
      <label>Prénom<input id="eFirst" value="${esc(u.firstName||"")}"></label>
      <label>Nom<input id="eLast" value="${esc(u.lastName||"")}"></label>
      <label>Pseudo<input id="ePseudo" value="${esc(u.pseudo||"")}" placeholder="Votre pseudo"></label>
      <label>Nom d'utilisateur<input id="eUser" value="${esc(u.username||"")}" required></label>
      <label>Date de naissance<input id="eBirth" type="date" value="${esc(u.birth||"")}"></label>
      <label>Genre<select id="eGender"><option value="">Non renseigné</option><option ${u.gender==="Homme"?"selected":""}>Homme</option><option ${u.gender==="Femme"?"selected":""}>Femme</option><option ${u.gender==="Autre"?"selected":""}>Autre</option></select></label>
      <label>Pays<input id="eCountry" value="${esc(u.country||"Madagascar")}"></label>
      <label>Code téléphone<input id="eCode" value="${esc(u.code||"")}" placeholder="+261"></label>
      <label>Téléphone<input id="ePhone" value="${esc(u.phone||"")}"></label>
      <label>E-mail<input id="eEmail" type="email" value="${esc(u.email||"")}"></label>
    </div></div>
    <div class="profile-edit-section"><h3>À propos</h3>
      <label>Bio<textarea id="eBio">${esc(u.bio||"")}</textarea>${opts("bio",u.privacy.bio||"Public")}</label>
      <label>Localisation<input id="eLoc" value="${esc(u.location||"")}">${opts("location",u.privacy.location||"Public")}</label>
      <label>Situation amoureuse<select id="eRelationship">
        <option value="" ${!u.relationshipStatus?"selected":""}>Non renseignée</option>
        <option ${u.relationshipStatus==="Célibataire"?"selected":""}>Célibataire</option>
        <option ${u.relationshipStatus==="En couple"?"selected":""}>En couple</option>
        <option ${u.relationshipStatus==="Marié(e)"?"selected":""}>Marié(e)</option>
        <option ${u.relationshipStatus==="C'est compliqué"?"selected":""}>C'est compliqué</option>
      </select>${opts("relationshipStatus",u.privacy.relationshipStatus||"Public")}</label>
    </div>
    <div class="profile-edit-section"><h3>Photos</h3>
      <label>Photo de profil<input id="eAvatar" type="file" accept="image/*"></label>
      <label>Photo de couverture<input id="eCover" type="file" accept="image/*"></label>
      <p class="field-help">Les images sont envoyées dans Supabase Storage. Elles ne sont plus stockées en local.</p>
    </div>
    <div class="profile-edit-section"><h3>Confidentialité</h3><div class="privacy-grid">
      <div>Nom d'utilisateur${opts("username",u.privacy.username||"Public")}</div>
      <div>Situation amoureuse${opts("relationshipStatus2",u.privacy.relationshipStatus||"Public")}</div>
      <div>Localisation${opts("location2",u.privacy.location||"Public")}</div>
      <div>Bio${opts("bio2",u.privacy.bio||"Public")}</div>
    </div></div>
    <button class="btn primary wide" id="saveProfileBtn">Enregistrer les modifications</button>
  </form>`);
  $("profileForm").onsubmit=async e=>{
    e.preventDefault();
    const btn=$("saveProfileBtn"); btn.disabled=true; btn.textContent="Enregistrement...";
    try{
      u.firstName=$("eFirst").value.trim();
      u.lastName=$("eLast").value.trim();
      u.name=[u.firstName,u.lastName].filter(Boolean).join(" ");
      u.pseudo=$("ePseudo").value.trim();
      u.username=$("eUser").value.trim();
      u.birth=$("eBirth").value||"";
      u.gender=$("eGender").value||"";
      u.country=$("eCountry").value.trim()||"Madagascar";
      u.code=$("eCode").value.trim();
      u.phone=$("ePhone").value.trim();
      u.email=$("eEmail").value.trim();
      u.bio=$("eBio").value;
      u.location=$("eLoc").value;
      u.relationshipStatus=$("eRelationship").value;
      u.privacy={...(u.privacy||{}),
        bio:$("bioPrivacy").value,
        location:$("locationPrivacy").value,
        relationshipStatus:$("relationshipStatusPrivacy").value,
        username:$("usernamePrivacy").value
      };
      const af=$("eAvatar").files[0], cf=$("eCover").files[0];
      if(af) u.avatar=await uploadProfileImage(af,"avatar");
      if(cf) u.cover=await uploadProfileImage(cf,"cover");

      // Keep Supabase Auth email and the public profile synchronized.
      const {data:{user:authUser},error:authUserError}=await SB.auth.getUser();
      if(authUserError||!authUser?.id) throw authUserError||new Error("Session Supabase introuvable.");
      const currentAuthEmail=(authUser.email||"").trim().toLowerCase();
      const nextAuthEmail=(u.email||"").trim().toLowerCase();
      if(nextAuthEmail && nextAuthEmail!==currentAuthEmail){
        const {error:emailError}=await SB.auth.updateUser({email:nextAuthEmail});
        if(emailError) throw emailError;
        toast("Un e-mail de confirmation peut être demandé pour le nouvel e-mail.");
      }
      await saveCurrentProfileToSupabase(u);
      closeModal(); render(); toast("Profil enregistré sur Supabase.");
    }catch(err){
      console.error(err);
      toast(err?.message||"Impossible d'enregistrer le profil.");
      btn.disabled=false; btn.textContent="Enregistrer les modifications";
    }
  };
}
function editCover(){
  modal("Photo de couverture",`<form id="coverForm"><label>Choisir une image<input id="coverFile" type="file" accept="image/*" required></label><button class="btn primary wide">Enregistrer</button></form>`);
  $("coverForm").onsubmit=async e=>{
    e.preventDefault();
    try{
      const f=$("coverFile").files[0];
      const url=await uploadProfileImage(f,"cover");
      const u=me(); u.cover=url; await saveCurrentProfileToSupabase(u);
      closeModal(); render(); toast("Photo de couverture enregistrée.");
    }catch(err){toast(err?.message||"Erreur d'enregistrement.");}
  };
}
function openFindFriends(){modal("Trouver des amis",`<input id="friendSearch" placeholder="Rechercher un nom ou @username"><div id="friendResults" style="margin-top:10px">${renderSuggestions(10)}</div>`);$("friendSearch").oninput=()=>{$("friendResults").innerHTML=state.users.filter(u=>u.id!==state.current&&(displayName(u)+" "+u.username).toLowerCase().includes($("friendSearch").value.toLowerCase())).map(friendSuggestion).join("")};}
function createEvent(){modal("Créer un événement",`<form id="eventForm"><label>Nom<input id="eventName" required></label><label>Date<input id="eventDate" type="datetime-local" required></label><label>Description<textarea id="eventDesc"></textarea></label><button class="btn primary wide">Créer</button></form>`);$("eventForm").onsubmit=e=>{e.preventDefault();state.events.push({id:uid("event"),ownerId:state.current,name:$("eventName").value,date:$("eventDate").value,description:$("eventDesc").value});save();closeModal();render();};}
function renderBadge(){
  const u=me();
  if(isAdminAccount(u)){
    return `${routeBackBar("Menu","menu")}<section class="badge-page-v94">
      <div class="badge-hero-v94">
        <div class="badge-hero-icon-v94">✓</div>
        <div><span class="eyebrow">TAFAß · COMPTE OFFICIEL</span><h1>Badge bleu</h1><p>Le compte officiel Tafaß bénéficie automatiquement de la vérification.</p></div>
        <span class="badge-status-v94 approved">Badge actif</span>
      </div>
      <div class="badge-info-card-v94"><div><b>Compte administrateur</b><small>Accès aux fonctions d’administration et de modération.</small></div><strong>OFFICIEL</strong></div>
      <div class="card"><h3>✓ Vérification permanente</h3><p>Le badge bleu du compte officiel ne nécessite pas de demande ni de paiement.</p></div>
    </section>`;
  }
  const mine=(state.badgeRequests||[]).filter(r=>r.userId===state.current).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const latest=mine[0];
  const statusLabel=latest?.status==="approved"?"Badge approuvé":latest?.status==="rejected"?"Demande refusée":latest?"Demande en attente":"Aucune demande";
  const statusClass=latest?.status==="approved"?"approved":latest?.status==="rejected"?"rejected":latest?"pending":"empty";
  const steps=[
    ["01","Identité","Vérifier votre nom légal"],
    ["02","Catégorie","Choisir votre catégorie"],
    ["03","Justificatifs","Ajouter une preuve"],
    ["04","Paiement","Renseigner la transaction"],
    ["05","Confirmation","Envoyer la demande"]
  ];
  return `${routeBackBar("Menu","menu")}<section class="badge-page-v94">
    <div class="badge-hero-v94">
      <div class="badge-hero-icon-v94">✓</div>
      <div><span class="eyebrow">TAFAß · VÉRIFICATION</span><h1>Badge bleu</h1><p>Suivez les 5 étapes de vérification de votre compte.</p></div>
      <span class="badge-status-v94 ${statusClass}">${statusLabel}</span>
    </div>
    <div class="badge-steps-preview-v94">${steps.map(([n,t,d],i)=>`<article><span>${n}</span><div><b>${t}</b><small>${d}</small></div>${i<4?'<i>›</i>':''}</article>`).join("")}</div>
    <div class="badge-info-card-v94"><div><b>Vérification mensuelle</b><small>25 000 Ar / mois · Yas Money, Airtel Money ou Orange Money</small></div><strong>25 000 Ar</strong></div>
    ${latest?`<div class="badge-request-card-v94"><span>Dernière demande</span><b>${esc(latest.category||"Catégorie non définie")}</b><small>Statut : ${esc(latest.status||"pending")} · ${esc(latest.createdAt?.slice(0,10)||"")}</small></div>`:""}
    <button type="button" class="btn primary wide badge-start-v94" data-action="startBadge">${latest?.status==="pending"?"Voir / reprendre la demande":"Commencer les 5 étapes"}</button>
  </section>`;
}
function badgeWizard(){
  let step=1,data={};
  const titles=["Identité","Catégorie","Justificatifs","Paiement","Confirmation"];
  const categories=["Personnalité publique","Président de la République","Personne publique","Créateur de contenu","Artiste","Entreprise","Page","Influenceur","Journaliste","Sportif","Institution","Organisation","Marque","Média","Professionnel","Autre"];
  const show=()=>{
    let body="";
    if(step===1)body=`<div class="badge-step-card-v90"><div class="badge-step-icon-v90">◎</div><h3>Vérifier votre identité</h3><p>Ces informations seront transmises à l'administrateur pour examen.</p><label>Nom légal<input id="bIdentity" value="${esc(data.identity||"")}" required placeholder="Nom complet"></label><label>Identifiant Tafaß<input value="@${esc(me()?.username||"")}" readonly></label></div>`;
    if(step===2)body=`<div class="badge-step-card-v90"><div class="badge-step-icon-v90">✓</div><h3>Votre catégorie</h3><p>Choisissez la catégorie qui décrit le mieux votre présence.</p><label>Catégorie<select id="bCategory">${categories.map(x=>`<option ${x===data.category?"selected":""}>${x}</option>`).join("")}</select></label></div>`;
    if(step===3)body=`<div class="badge-step-card-v90"><div class="badge-step-icon-v90">▣</div><h3>Justificatifs</h3><p>Ajoutez un document ou une preuve pertinente. Le fichier reste local dans ce prototype.</p><label>Justificatif<input id="bProof" type="file" accept="image/*,.pdf"></label><div class="badge-proof-note-v90">Formats recommandés : image ou PDF.</div></div>`;
    if(step===4)body=`<div class="badge-step-card-v90"><div class="badge-step-icon-v90">◇</div><h3>Paiement</h3><div class="badge-price-box-v90"><b>25 000 Ar</b><span>/ mois</span></div><div class="badge-money-list-v90"><div><b>Yas Money</b><span>+261 383 955 105</span></div><div><b>Airtel Money</b><span>+261 336 756 185</span></div><div><b>Orange Money</b><span>+261 379 594 257</span></div><small>Titulaire : <strong>Mahandry Hery RANDRIAMALALA</strong></small></div><label>Méthode<select id="bMethod"><option ${data.method==="Yas Money"?"selected":""}>Yas Money</option><option ${data.method==="Airtel Money"?"selected":""}>Airtel Money</option><option ${data.method==="Orange Money"?"selected":""}>Orange Money</option></select></label><label>Référence de transaction<input id="bRef" value="${esc(data.ref||"")}" required placeholder="Référence"></label></div>`;
    if(step===5)body=`<div class="badge-step-card-v90"><div class="badge-success-mark-v90">✓</div><h3>Vérifiez votre demande</h3><div class="badge-summary-v90"><span>Identité<strong>${esc(data.identity||"—")}</strong></span><span>Catégorie<strong>${esc(data.category||"—")}</strong></span><span>Paiement<strong>${esc(data.method||"—")}</strong></span><span>Référence<strong>${esc(data.ref||"—")}</strong></span></div><p>En envoyant cette demande, vous confirmez que les informations fournies sont exactes. Le badge est mensuel et le renouvellement est nécessaire pour le conserver.</p></div>`;
    modal(`Badge bleu · ${titles[step-1]}`,`<div class="badge-wizard-v90"><div class="badge-progress-v90">${titles.map((t,i)=>`<span class="${i+1<=step?"active":""}"><b>${i+1}</b><small>${t}</small></span>`).join("")}</div>${body}</div>`, `<button class="btn secondary" data-action="badgeBack">Retour</button><button class="btn primary" data-action="badgeNext">${step===5?"Envoyer la demande":"Continuer"}</button>`);
    document.querySelector("[data-action=badgeBack]").onclick=()=>{if(step>1){step--;show()}else closeModal()};
    document.querySelector("[data-action=badgeNext]").onclick=()=>{
      if(step===1){data.identity=$("bIdentity")?.value.trim();if(!data.identity)return toast("Indiquez votre nom légal.");}
      if(step===2)data.category=$("bCategory")?.value;
      if(step===3){const proof=$("bProof")?.files?.[0];if(!proof)return toast("Ajoutez votre justificatif.");data.proofName=proof.name;}
      if(step===4){data.method=$("bMethod")?.value;data.ref=$("bRef")?.value.trim();if(!data.method)return toast("Choisissez une méthode de paiement.");if(!data.ref)return toast("Ajoutez la référence de transaction.");}
      if(step<5){step++;show()}else{state.badgeRequests.push({id:uid("badge"),userId:state.current,identity:data.identity,category:data.category,method:data.method,ref:data.ref,proofName:data.proofName||"",status:"pending",createdAt:new Date().toISOString()});notify(ADMIN_ID,"badge",`${displayName(me())} a envoyé une demande de badge bleu.`);save();closeModal();render();toast("Demande envoyée à l'administrateur");}
    };
  };show();
}
function badgeDecision(id,ok){const r=state.badgeRequests.find(x=>x.id===id);if(!r)return;r.status=ok?"approved":"rejected";const u=findUser(r.userId);if(u)u.verified=ok;if(u&&ok)notify(u.id,"badge","Votre badge bleu a été accepté.");save();render();toast(ok?"Badge accordé":"Demande refusée");}
function forgot(){
  modal("Mot de passe oublié",`<div class="forgot-premium-v92">
    <div class="forgot-hero-v92"><span>↻</span><div><b>Réinitialiser votre mot de passe</b><small>Un lien sécurisé sera envoyé par e-mail.</small></div></div>
    <form id="forgotForm" class="premium-form">
      <label>Adresse e-mail<input id="forgotIdentifier" type="email" autocomplete="email" required placeholder="votre@email.com"></label>
      <button class="btn primary wide" type="submit">Envoyer le lien de réinitialisation</button>
    </form>
  </div>`);
  $("forgotForm").onsubmit=async e=>{
    e.preventDefault();
    const email=$("forgotIdentifier").value.trim().toLowerCase();
    if(!supabaseReady()) return toast("Supabase n'est pas configuré.");
    const {error}=await SB.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    if(error) return toast(error.message||"Impossible d'envoyer l'e-mail.");
    closeModal();
    toast("Lien de réinitialisation envoyé par e-mail.");
  };
}

function savedAccounts(){
  try{return JSON.parse(localStorage.getItem("tafass_saved_accounts")||"[]");}catch(_){return [];}
}
function saveLoginAccount(profile){
  if(!profile?.email)return;
  const list=savedAccounts().filter(a=>a.email.toLowerCase()!==String(profile.email).toLowerCase());
  list.unshift({email:profile.email,name:displayName(profile),avatar:profile.avatar||profile.avatar_url||""});
  localStorage.setItem("tafass_saved_accounts",JSON.stringify(list.slice(0,8)));
}
function removeSavedAccount(email){
  const list=savedAccounts().filter(a=>a.email.toLowerCase()!==String(email).toLowerCase());
  localStorage.setItem("tafass_saved_accounts",JSON.stringify(list));
  renderSavedAccounts();
}
function renderSavedAccounts(){
  const box=$("savedAccounts");if(!box)return;
  const list=savedAccounts();
  if(!list.length){box.innerHTML="";box.classList.remove("has-items");return;}
  box.classList.add("has-items");
  box.innerHTML=`<div class="saved-accounts-title">Comptes enregistrés sur cet appareil</div><div class="saved-accounts-list">${list.map(a=>`<div class="saved-account-row"><button type="button" class="saved-account-select" data-saved-email="${esc(a.email)}"><span class="saved-account-avatar">${a.avatar?`<img src="${esc(a.avatar)}" alt="">`:esc((a.name||a.email)[0].toUpperCase())}</span><span><b>${esc(a.name||a.email)}</b><small>${esc(a.email)}</small></span></button><button type="button" class="saved-account-delete" data-saved-delete="${esc(a.email)}" aria-label="Supprimer ce compte enregistré">×</button></div>`).join("")}</div>`;
  box.querySelectorAll("[data-saved-email]").forEach(btn=>btn.onclick=()=>{
    const input=$("loginIdentifier");if(input)input.value=btn.dataset.savedEmail;
    const pass=$("loginPassword");if(pass){pass.value="";pass.focus();}
    toast("Entrez le mot de passe pour vous reconnecter.");
  });
  box.querySelectorAll("[data-saved-delete]").forEach(btn=>btn.onclick=()=>removeSavedAccount(btn.dataset.savedDelete));
}

function initAuth(){
  countryData.forEach(([name,code])=>$("rCountry").insertAdjacentHTML("beforeend",`<option value="${esc(code)}" data-name="${esc(name)}">${esc(name)} (${esc(code)})</option>`));
  $("rCountry").value="+261";$("rCode").value="+261";
  $("rCountry").onchange=()=>{$("rCode").value=$("rCountry").value;};
  const showRegisterView=()=>{
    try{
      registerStep=1;
      showRegisterStep();
      const loginView=$("loginView"), registerView=$("registerView");
      if(loginView) loginView.classList.add("hidden");
      if(registerView) registerView.classList.remove("hidden");
    }catch(err){
      console.error("Ouverture inscription:",err);
      const loginView=$("loginView"), registerView=$("registerView");
      if(loginView) loginView.classList.add("hidden");
      if(registerView) registerView.classList.remove("hidden");
      toast("Impossible d'ouvrir l'inscription. Rechargez la page.");
    }
  };
  const showLoginView=()=>{
    const registerView=$("registerView"), loginView=$("loginView");
    if(registerView) registerView.classList.add("hidden");
    if(loginView) loginView.classList.remove("hidden");
  };
  renderSavedAccounts();
  const showRegisterBtn=$("showRegister");
  const showLoginBtn=$("showLogin");
  if(showRegisterBtn) showRegisterBtn.addEventListener("click",e=>{e.preventDefault();showRegisterView();});
  if(showLoginBtn) showLoginBtn.addEventListener("click",e=>{e.preventDefault();showLoginView();});
  document.querySelectorAll("[data-toggle-password]").forEach(b=>b.onclick=()=>{const i=$(b.dataset.togglePassword);i.type=i.type==="password"?"text":"password";b.textContent=i.type==="password"?"Afficher":"Masquer";});
  $("loginForm").onsubmit=async e=>{
    e.preventDefault();
    if(!supabaseReady()) return toast("Supabase n'est pas configuré.");
    const id=$("loginIdentifier").value.trim();
    const pass=$("loginPassword").value;
    let email=id.toLowerCase();
    if(!email.includes("@")){
      const {data:phoneProfile,error:phoneError}=await SB.from("profiles").select("email").eq("phone",$("loginIdentifier").value.trim()).maybeSingle();
      if(phoneError || !phoneProfile?.email) return toast("Compte introuvable. Utilisez votre e-mail.");
      email=phoneProfile.email;
    }
    const {data,error}=await SB.auth.signInWithPassword({email,password:pass});
    if(error) return toast("Identifiants incorrects.");
    if(!data.session) return toast("Connexion non disponible. Vérifiez votre e-mail.");
    await hydrateSupabaseSession();
    saveLoginAccount(me()||{email});
    renderSavedAccounts();
    render();
  };
  $("forgotBtn").onclick=forgot;
  $("rPass").oninput=updateStrength;
  $("changeAvatarBtn").onclick=()=>$("rAvatarFile").click();
  $("rAvatarFile").onchange=()=>{const f=$("rAvatarFile").files[0];fileToData(f).then(x=>{registerAvatar=x;$("registerAvatar").innerHTML=x?`<img src="${esc(x)}">`:"T";});};
  $("removeAvatarBtn").onclick=()=>{registerAvatar="";$("registerAvatar").textContent="T";};
  $("regBack").onclick=()=>{if(registerStep>1){registerStep--;showRegisterStep()}else{$("showLogin").click();}};
  $("regNext").onclick=()=>{if(validateRegStep(registerStep)){if(registerStep<5){registerStep++;showRegisterStep()}}};
  $("registerForm").onsubmit=async e=>{e.preventDefault();if(registerStep!==5)return;if(!validateRegStep(5))return;await createAccount();};
}
function showRegisterStep(){
  const current=Math.min(5,Math.max(1,Number(registerStep)||1));
  registerStep=current;

  // Une seule étape est rendue visible à la fois.
  // Les étapes futures restent totalement masquées jusqu'à validation de l'étape actuelle.
  document.querySelectorAll(".reg-step").forEach(x=>{
    const isCurrent=Number(x.dataset.step)===current;
    x.classList.toggle("hidden",!isCurrent);
    x.setAttribute("aria-hidden",String(!isCurrent));
  });

  const progress=$("registerProgress");
  if(progress){
    progress.style.width=(current*20)+"%";
    progress.setAttribute("aria-valuenow",String(current));
    progress.setAttribute("aria-label",`Étape ${current} sur 5`);
  }

  const titles=["Informations personnelles","Pays et téléphone","Compte","Photo de profil","Finalisation"];
  const title=$("registerStepTitle");
  if(title) title.textContent=`Étape ${current}/5 — ${titles[current-1]}`;

  const back=$("regBack"), next=$("regNext"), submit=$("regSubmit");
  // Le bouton Retour reste toujours présent, y compris à l'étape 1.
  if(back){
    back.textContent="Retour";
    back.setAttribute("aria-label",current===1?"Retour à la connexion":"Retour à l'étape précédente");
  }
  if(next) next.classList.toggle("hidden",current===5);
  if(submit) submit.classList.toggle("hidden",current!==5);
  if(current===5) buildSummary();
}
function validateRegStep(s){
  if(s===1){
    if(!$("rFirst").value.trim()||!$("rLast").value.trim()||!$("rBirth").value||!$("rUsername").value.trim())return toast("Complétez toutes les informations."),false;
  }
  if(s===2){if(!$("rPhone").value.trim())return toast("Entrez votre numéro."),false;}
  if(s===3){
    const p=$("rPass").value;
    if(p.length<6)return toast("Le mot de passe doit contenir au moins 6 caractères."),false;
    if(p!==$("rPass2").value)return toast("Les mots de passe ne correspondent pas."),false;
    if(!$("rEmail").value.trim())return toast("Entrez votre e-mail."),false;
  }
  if(s===5&&!$("rTerms").checked)return toast("Acceptez les conditions pour continuer."),false;
  return true;
}
function updateStrength(){const p=$("rPass").value;let score=0;if(p.length>=6)score++;if(/[A-Z]/.test(p))score++;if(/[0-9]/.test(p))score++;if(/[^A-Za-z0-9]/.test(p))score++;$("strengthBar").style.width=(score*25)+"%";$("strengthText").textContent=["Très faible","Faible","Moyen","Bon","Fort"][score];}
function buildSummary(){const country=$("rCountry").selectedOptions[0]?.textContent||"";$("registerSummary").innerHTML=`<b>${esc($("rFirst").value)} ${esc($("rLast").value)}</b><br>@${esc($("rUsername").value)}<br>${esc($("rEmail").value)}<br>${esc(country)} · ${esc($("rCode").value)} ${esc($("rPhone").value)}<br>Photo : ${registerAvatar?"Ajoutée":"Avatar par défaut"}`;}
async function createAccount(){
  const btn=$("regSubmit");
  const originalText=btn?.textContent||"Créer mon compte";

  const setButton=(text,disabled=true)=>{
    if(btn){
      btn.disabled=disabled;
      btn.textContent=text;
    }
  };

  const withTimeout=(promise,ms=20000)=>Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(
      ()=>reject(new Error("TIMEOUT_SUPABASE")),
      ms
    ))
  ]);

  try{
    if(!supabaseReady()){
      return toast("Supabase JS n'est pas chargé. Rechargez l'application.");
    }

    const email=$("rEmail").value.trim().toLowerCase();
    const password=$("rPass").value;
    const username=$("rUsername").value.trim().toLowerCase();
    const rawPhone=$("rPhone").value.trim().replace(/\s/g,"");
    const country=$("rCountry").selectedOptions[0]?.dataset.name||"Madagascar";
    const phoneCode=$("rCode").value;
    const phone=phoneCode+rawPhone;

    if(!email) return toast("Entrez votre e-mail.");
    if(password.length<6) return toast("Le mot de passe doit contenir au moins 6 caractères.");
    if(!/^[a-zA-Z0-9._-]{3,30}$/.test(username))
      return toast("Nom d'utilisateur invalide.");
    if(rawPhone.length<6) return toast("Numéro de téléphone invalide.");

    const metadata={
      first_name:$("rFirst").value.trim(),
      last_name:$("rLast").value.trim(),
      birth:$("rBirth").value||null,
      gender:$("rGender").value||"",
      username,
      country,
      phone_code:phoneCode,
      phone,
      email,
      location:country==="Madagascar"?"Madagascar":country
    };

    setButton("Création du compte...");

    // One and only one Auth signup call.
    const result=await withTimeout(
      SB.auth.signUp({
        email,
        password,
        options:{data:metadata}
      }),
      20000
    );

    const data=result?.data;
    const error=result?.error;

    if(error){
      console.error("Supabase Auth signup:",error);

      const msg=String(error.message||"");
      if(/already registered|already exists|user already/i.test(msg))
        return toast("Cet e-mail possède déjà un compte.");
      if(/database error|error saving new user|trigger|profiles/i.test(msg))
        return toast("Supabase Auth fonctionne, mais le profil n'a pas pu être créé.");
      if(/password/i.test(msg))
        return toast("Mot de passe invalide : 6 caractères minimum.");
      if(/email/i.test(msg))
        return toast("Adresse e-mail invalide.");
      return toast("Erreur Supabase : "+msg);
    }

    if(!data?.user){
      return toast("Supabase n'a pas créé l'utilisateur.");
    }

    registerAvatar="";

    if(data.session){
      try{
        await SB.auth.setSession(data.session);
        await hydrateSupabaseSession();
      }catch(sessionError){
        console.warn("Session après inscription:",sessionError);
      }
      saveLoginAccount(me()||{email,name:$('rFirst').value.trim()+" "+$('rLast').value.trim(),avatar:registerAvatar});
      renderSavedAccounts();
      render();
      toast("Compte créé avec succès !");
    }else{
      // Confirm email is enabled in the project.
      $("registerView").classList.add("hidden");
      $("loginView").classList.remove("hidden");
      toast("Compte créé ! Vérifiez votre e-mail pour l'activer.");
    }

  }catch(err){
    console.error("Création compte:",err);

    if(err?.message==="TIMEOUT_SUPABASE"){
      toast("Supabase ne répond pas. Vérifiez Internet et réessayez.");
    }else{
      toast("Erreur lors de la création : "+(err?.message||"erreur inconnue"));
    }
  }finally{
    setButton(originalText,false);
  }
}
document.addEventListener("click",async e=>{
  const publish=e.target.closest?.('[data-group-publish]');
  if(publish){
    e.preventDefault();
    const gid=publish.dataset.groupPublish;
    const box=document.querySelector(`[data-group-post-content][data-group-id="${CSS.escape(gid)}"]`);
    const input=document.querySelector(`[data-group-file-input][data-group-id="${CSS.escape(gid)}"]`);
    const file=input?.files?.[0]||null;
    publish.disabled=true;
    try{
      await createGroupPost(gid,box?.value?.trim()||"",file);
      if(box)box.value="";
      if(input)input.value="";
      await loadSupabasePosts(); render(); toast("Publication envoyée.");
    }catch(err){toast("Publication impossible : "+(err?.message||"erreur"));}
    finally{publish.disabled=false;}
    return;
  }
  const pick=e.target.closest?.('[data-group-pick]');
  if(pick){
    e.preventDefault();
    const input=document.querySelector(`[data-group-file-input][data-group-id="${CSS.escape(pick.dataset.groupId)}"]`);
    if(input) input.click();
    return;
  }
  const poll=e.target.closest?.('[data-group-poll]');
  if(poll){
    e.preventDefault();
    const gid=poll.dataset.groupPoll;
    modal("Créer un sondage",`<form id="groupPollForm" class="premium-form">
      <label>Question<textarea id="pollQuestion" required maxlength="300"></textarea></label>
      <label>Choix 1<input id="poll1" required></label>
      <label>Choix 2<input id="poll2" required></label>
      <label>Choix 3<input id="poll3"></label>
      <label>Choix 4<input id="poll4"></label>
      <button class="btn primary wide">Publier le sondage</button>
    </form>`);
    $("groupPollForm").onsubmit=async ev=>{
      ev.preventDefault();
      const opts=["poll1","poll2","poll3","poll4"].map(id=>$(id)?.value||"");
      try{await createGroupPoll(gid,$("pollQuestion").value,opts);closeModal();render();toast("Sondage publié en temps réel.");}
      catch(err){toast("Sondage impossible : "+(err?.message||"erreur"));}
    };
    return;
  }
  const vote=e.target.closest?.('[data-group-vote]');
  if(vote){
    e.preventDefault();
    try{await voteGroupPoll(vote.dataset.pollId,vote.dataset.groupVote);}catch(err){toast("Vote impossible : "+(err?.message||"erreur"));}
    return;
  }
});

/* GROUP VIEW — capture navigation
   Handles the card button before any generic data-action handler. */
document.addEventListener("click",function(e){
  const button=e.target.closest?.('[data-action="viewGroup"],[data-group-open]');
  if(!button) return;
  const gid=String(button.dataset.groupId||button.dataset.id||"").trim();
  if(!gid) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  try{ viewGroup(gid); }catch(err){
    console.error("Navigation Groupe:",err);
    toast("Impossible d'ouvrir le groupe.");
  }
},true);

/* GROUP TABS */
document.addEventListener("click",function(e){
  const tab=e.target.closest?.('[data-group-tab]');
  if(!tab) return;
  e.preventDefault();
  const gid=String(selectedGroupId||"");
  const kind=tab.dataset.groupTab;
  if(!gid) return;
  const g=(state.groups||[]).find(x=>String(x.id)===gid);
  if(!g) return;
  if(kind==="feed") return;
  if(kind==="about"){
    return modal("À propos du groupe",`<div class="group-tab-modal"><h3>${esc(g.name||"Groupe")}</h3><p>${esc(g.description||"Aucune description pour le moment.")}</p><p>${esc(g.rules||"Aucune règle renseignée.")}</p></div>`);
  }
  if(kind==="members"){
    const ids=(g.members||[]).map(String);
    const members=ids.map(id=>(state.users||[]).find(u=>String(u.id)===id)).filter(Boolean);
    return modal("Membres du groupe",members.length?members.map(u=>`<div class="list-item">${avatar(u,"avatar sm")}<div class="list-main"><b>${esc(displayName(u))}</b><small>@${esc(u.username||"")}</small></div></div>`).join(""):`<div class="empty">Aucun membre chargé.</div>`);
  }
  if(kind==="media"){
    const posts=(state.posts||[]).filter(p=>String(p.group_id||"")===gid && p.media_url);
    return modal("Médias du groupe",posts.length?posts.map(p=>`<div class="group-media-modal-item">${String(p.media_type||"").startsWith("image")?`<img src="${esc(p.media_url)}" alt="">`:String(p.media_type||"").startsWith("video")?`<video src="${esc(p.media_url)}" controls></video>`:`<a href="${esc(p.media_url)}" target="_blank" rel="noopener">📎 ${esc(p.file_name||"Fichier")} — Télécharger</a>`}</div>`).join(""):`<div class="empty">Aucun média.</div>`);
  }
},true);

async function boot(){
  try{applyTheme();}catch(e){console.error(e)}
  try{initAuth();}catch(e){console.error("initAuth:",e)}
  try{setupGlobal();}catch(e){console.error("setupGlobal:",e)}
  try{openDeepLink();}catch(e){console.error("deepLink:",e)}
  try{localizeApp();}catch(e){console.error("localize:",e)}
  const splash=$("splash");
  if(splash){
    const dots=[...splash.querySelectorAll(".splash-dots i")];
    dots.forEach((dot,i)=>setTimeout(()=>{dot.classList.add("active");setTimeout(()=>{dot.classList.remove("active");dot.classList.add("done");},260);},i*500));
  }
  await hydrateSupabaseSession();
  if(state.current){ try{ await loadSupabaseMessages(); }catch(e){} try{ await startTafaRealtime(); }catch(e){console.warn('Realtime init:',e)} }
  const leave=()=>{
    if(splash){splash.classList.add("hide");setTimeout(()=>splash.remove(),550);}
    if(!state.current){$("authScreen").classList.remove("hidden");$("appScreen").classList.add("hidden")}
    else render();
  };
  setTimeout(leave,3050);
}

window.addEventListener("error",e=>{console.error(e.error||e.message);if($("splash")){$("splash").classList.add("hide");$("authScreen").classList.remove("hidden");}});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();


// Delete button handler (delegated, so it also works for dynamically rendered feed items).
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="delete-post"]');
  if (!button) return;

  const postId = button.dataset.postId;
  if (!postId) return;

  if (!confirm('Supprimer cette publication ? Cette action est irréversible.')) return;

  button.disabled = true;
  try {
    let post = null;

    // Prefer an existing in-memory post list when available.
    const candidates = [
      window.posts,
      window.currentPosts,
      window.feedPosts,
      window.allPosts
    ];
    for (const list of candidates) {
      if (Array.isArray(list)) {
        post = list.find(p => String(p.id) === String(postId));
        if (post) break;
      }
    }

    // Fallback: fetch only the selected post.
    if (!post) {
      const client = window.supabaseClient;
      const { data, error } = await client.from('posts').select('*').eq('id', postId).single();
      if (error) throw error;
      post = data;
    }

    const ownerId = post.owner_id || post.user_id || post.ownerId;
    const currentUser = window.supabaseClient ? (await window.supabaseClient.auth.getUser()).data?.user : null;
    if (!currentUser?.id) throw new Error('Vous devez être connecté.');
    if (ownerId && String(ownerId) !== String(currentUser.id)) {
      throw new Error('Vous ne pouvez supprimer que vos propres publications.');
    }

    await tafasDeletePublication(post);

    const card = button.closest('[data-post-id], article, .post-card, .post');
    if (card) card.remove();

    // Refresh if the existing app exposes a feed loader.
    const refresh =
      window.loadPosts ||
      window.fetchPosts ||
      window.renderPosts ||
      window.loadFeed;
    if (typeof refresh === 'function') {
      try { await refresh(); } catch (e) { console.warn('Feed refresh:', e); }
    }
  } catch (error) {
    console.error('Delete publication:', error);
    alert(error?.message || 'Tsy voafafa ilay publication.');
  } finally {
    button.disabled = false;
  }
});


