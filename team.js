let TEAM_ID=null, TEAM_KEY=null, STATE=null, MAPOBJ=null, busy=false,actionTimer=null;
function getParams(){return new URLSearchParams(location.search);}
function initIdentity(){const p=getParams();TEAM_ID=(p.get('team')||localStorage.getItem('mq_team')||'').toLowerCase();if(!['blue','green','red'].includes(TEAM_ID)){document.body.innerHTML='<div class="landing"><div class="panel"><h2>Choose team</h2><div class="link-grid"><a class="link-card" href="team.html?team=blue">Team Blue</a><a class="link-card" href="team.html?team=green">Team Green</a><a class="link-card" href="team.html?team=red">Team Red</a></div></div></div>';return false;}TEAM_KEY=p.get('key')||localStorage.getItem('mq_key_'+TEAM_ID)||'';if(p.get('key'))localStorage.setItem('mq_key_'+TEAM_ID,p.get('key'));localStorage.setItem('mq_team',TEAM_ID);return true;}
function ensureKey(){if(TEAM_KEY)return true;TEAM_KEY=prompt('Enter the access key for '+teamName(TEAM_ID)+':')||'';if(TEAM_KEY)localStorage.setItem('mq_key_'+TEAM_ID,TEAM_KEY);return !!TEAM_KEY;}
async function init(){await loadFixed();if(!initIdentity())return;document.getElementById('teamBadge').className='team-badge team-'+TEAM_ID;document.getElementById('teamBadge').textContent=teamName(TEAM_ID);if(!backendUrl()){const w=document.getElementById('configWarning');w.classList.remove('hidden');w.textContent='Backend URL not configured yet. Paste the Apps Script /exec URL into backend-config.js.';return;}if(!ensureKey())return;await refresh();setInterval(()=>{if(!busy)refresh(true);},15000);}
async function refresh(silent=false){try{if(!silent)setConn('warn','Updating…');const s=await jsonp('teamState',{team:TEAM_ID,key:TEAM_KEY});STATE=s;renderAll();setConn('ok','Live');}catch(e){setConn('error',e.message);if(String(e.message).includes('access key')){localStorage.removeItem('mq_key_'+TEAM_ID);TEAM_KEY='';}}}
function setConn(cls,text){const e=document.getElementById('conn');e.className='pill '+cls;e.textContent=text;}
function renderAll(){document.getElementById('phase').textContent=phaseLabel(STATE.phase);document.getElementById('serverTime').textContent='Server '+fmtTime(STATE.serverTime);document.getElementById('nextRefresh').textContent=STATE.nextRefreshAt?'Next refresh '+fmtTime(STATE.nextRefreshAt):'No more refreshes';renderEventBanner();renderScores(STATE,document.getElementById('scores'));renderBonus(STATE,document.getElementById('bonus'));renderBoard();renderRefresh();renderInventory();renderLunch();renderLog(STATE,document.getElementById('log'));if(!MAPOBJ)MAPOBJ=createMap('map',STATE);else updateMap(MAPOBJ,STATE);}

function openingDirectionConfig(id){return GAME.opening.directions.find(d=>d.id===id);}
function canClaimCardNow(nilId){
  const my=STATE.myTeam,n=Number(nilId);
  if(!STATE.phase.includes('live')) return false;
  if(!my.openingComplete){const d=openingDirectionConfig(my.openingDirection);return d.nil_ids.includes(n);}
  for(const t of Object.values(STATE.teams)){if(t.id===TEAM_ID||t.openingComplete)continue;const d=openingDirectionConfig(t.openingDirection);if(d.nil_ids.includes(n))return false;}
  return true;
}
function openingProtectionLabel(nilId){for(const t of Object.values(STATE.teams)){if(t.openingComplete)continue;const d=openingDirectionConfig(t.openingDirection);if(d.nil_ids.includes(Number(nilId)))return `Opening: ${t.name}`;}return '';}
function occupancyOwner(nilId){return Object.values(STATE.teams).find(t=>Number(t.occupancyNilId)===Number(nilId));}
function renderBoard(){
  const el=document.getElementById('board'),my=STATE.myTeam;let intro='';
  if(!my.openingComplete){const d=openingDirectionConfig(my.openingDirection);intro=`<div class="warning-box board-intro"><strong>Opening direction: ${esc(d.label)}</strong><br>Your first claim must be ${d.nil_ids.map(id=>esc(nilData(id).name)).join(' or ')}. Other teams cannot claim these until you open.</div>`;}
  el.innerHTML=intro+STATE.board.map(card=>{
    const n=nilData(card.nilId),protectedBy=occupancyOwner(card.nilId),allowed=canClaimCardNow(card.nilId),openingProtected=openingProtectionLabel(card.nilId);
    const markers=[protectedBy?'🛡 occupied':'',openingProtected].filter(Boolean).join(' · ');
    return `<div class="card active"><div class="card-title">${esc(n.name)}</div><div class="sub">Municipio ${n.game_municipio}${markers?' · '+esc(markers):''}</div>${cardChallengeHtml(card,my)}<div class="actions"><button class="btn team-${TEAM_ID}" data-claim="${card.nilId}" ${allowed?'':'disabled'}>${allowed?'Claim NIL':'Opening protected'}</button></div></div>`;
  }).join('');
  el.querySelectorAll('[data-claim]:not([disabled])').forEach(b=>b.onclick=()=>openClaim(Number(b.dataset.claim)));
}
function openClaim(nilId){
  const card=activeCard(STATE,nilId),n=nilData(nilId),my=STATE.myTeam,c=challengeData(card.challengeId);document.getElementById('claimTitle').textContent='Claim '+n.name;let h=`<p><strong>Assigned challenge:</strong> ${esc(c.title)}</p><div class="section-note">Choose the challenge you actually completed. The backend validates availability and timing.</div><h3>${esc(c.title)}</h3>`;
  if(card.challengeId==='have_lunch'){h+=`<div class="choice"><label><input type="radio" name="claimChoice" value="have_lunch|"><span>Have Lunch — 45 continuous minutes</span></label></div>`;}else{h+=(c.levels||[]).map(l=>{const st=my.inventory.standard[c.id][l.id];const disabled=st==='used'?'disabled':'';return `<div class="choice"><label><input type="radio" name="claimChoice" value="${c.id}|${l.id}" ${disabled}><span><strong>${esc(l.label)}</strong> — ${esc(l.requirement)} ${st==='used'?'(used)':st==='zombie'?'(Zombie restored)':''}</span></label></div>`;}).join('');}
  h+='<h3>Walking Tour wildcard</h3>'+challengeData('walking_tour').levels.map(l=>{const st=my.inventory.walking[l.id];return `<div class="choice"><label><input type="radio" name="claimChoice" value="walking_tour|${l.id}" ${st==='used'?'disabled':''}><span><strong>${esc(l.label)}</strong> — ${esc(l.requirement)} ${st==='used'?'(used)':st==='zombie'?'(Zombie restored)':''}</span></label></div>`;}).join('');
  h+=`<div class="actions"><button id="confirmClaim" class="btn team-${TEAM_ID}">Submit successful claim</button></div>`;document.getElementById('claimBody').innerHTML=h;document.getElementById('claimModal').classList.add('open');document.getElementById('confirmClaim').onclick=()=>submitClaim(nilId);
}
async function submitClaim(nilId){const choice=document.querySelector('input[name="claimChoice"]:checked');if(!choice)return alert('Select the completed challenge/level.');if(!confirm('Submit this as a successful claim? This changes live game state.'))return;const [challengeId,levelId]=choice.value.split('|');await act({action:'submitClaim',team:TEAM_ID,key:TEAM_KEY,nilId,challengeId,levelId},{success:'Claim submitted successfully.'});document.getElementById('claimModal').classList.remove('open');}

function sameNumberSet(a,b){const x=(a||[]).map(Number).sort((m,n)=>m-n),y=(b||[]).map(Number).sort((m,n)=>m-n);return x.length===y.length&&x.every((v,i)=>v===y[i]);}
function renderRefresh(){
  const my=STATE.myTeam,el=document.getElementById('refreshControls'),saved=(my.refreshVotes||[]).map(Number);
  const savedNames=saved.map(id=>nilData(id)?.name).filter(Boolean);
  let h=`<div class="sub">Select up to two different active NILs. Votes stay hidden from the other teams until the refresh.</div>`;
  h+=`<div class="saved-state ${saved.length?'saved':'empty'}">${saved.length?'✓ Saved votes: '+esc(savedNames.join(' · ')):'No refresh votes currently saved.'}</div>`;
  h+='<div class="vote-list">'+STATE.board.map(c=>{
    const occupied=occupancyOwner(c.nilId),opening=openingProtectionLabel(c.nilId),note=occupied?' (occupied/protected)':opening?' (opening protected)':'';
    return `<label class="vote-item"><input type="checkbox" class="voteBox" value="${c.nilId}" ${saved.includes(Number(c.nilId))?'checked':''}> <span>${esc(nilData(c.nilId).name)}${esc(note)}</span></label>`;
  }).join('')+'</div>';
  h+='<div class="actions"><button id="saveVotes" class="btn secondary">Save refresh votes</button></div>';
  h+='<h3>Protect NIL by occupancy</h3><div class="sub">Only use this if your team will physically be inside the NIL at the refresh time.</div><div class="controls-row"><select id="occ"><option value="">No occupancy protection</option>'+STATE.board.map(c=>`<option value="${c.nilId}" ${Number(my.occupancyNilId)===Number(c.nilId)?'selected':''}>${esc(nilData(c.nilId).name)}</option>`).join('')+'</select><button id="saveOcc" class="btn secondary">Save occupancy</button></div>';
  if(my.occupancyNilId)h+=`<div class="saved-state saved">✓ Occupancy saved: ${esc(nilData(my.occupancyNilId).name)}</div>`;
  el.innerHTML=h;
  document.querySelectorAll('.voteBox').forEach(x=>x.onchange=()=>{const checked=[...document.querySelectorAll('.voteBox:checked')];if(checked.length>2){x.checked=false;alert('Maximum two votes.');}});
  document.getElementById('saveVotes').onclick=()=>{
    const ids=[...document.querySelectorAll('.voteBox:checked')].map(x=>Number(x.value));
    const label=ids.length?ids.map(id=>nilData(id).name).join(' · '):'no NILs';
    act({action:'setRefreshVotes',team:TEAM_ID,key:TEAM_KEY,nilIds:ids},{success:`Refresh votes saved: ${label}.`,verify:()=>sameNumberSet(STATE.myTeam.refreshVotes,ids),verifyError:'The backend did not retain the selected refresh votes. Please try again.'});
  };
  document.getElementById('saveOcc').onclick=()=>{
    const value=document.getElementById('occ').value,expected=value?Number(value):null;
    act({action:'setOccupancy',team:TEAM_ID,key:TEAM_KEY,nilId:value},{success:expected?`Occupancy protection saved for ${nilData(expected).name}.`:'Occupancy protection cleared.',verify:()=>Number(STATE.myTeam.occupancyNilId||0)===Number(expected||0),verifyError:'The backend did not retain the occupancy setting. Please try again.'});
  };
}
function renderInventory(){const my=STATE.myTeam;let h='<div class="table-scroll"><table class="inventory-table"><thead><tr><th>Challenge</th><th>Levels</th></tr></thead><tbody>';CHALLENGES.standard_challenges.forEach(c=>{h+=`<tr><td>${esc(c.title)}</td><td>`+c.levels.map(l=>{const st=my.inventory.standard[c.id][l.id];return `<span class="level-chip ${st}">${esc(l.label)}${st==='zombie'?' ↻':''}</span>`;}).join('')+'</td></tr>';});h+=`<tr><td>Walking Tour</td><td>`+challengeData('walking_tour').levels.map(l=>{const st=my.inventory.walking[l.id];return `<span class="level-chip ${st}">${esc(l.label)}${st==='zombie'?' ↻':''}</span>`;}).join('')+'</td></tr></tbody></table></div>';document.getElementById('inventory').innerHTML=h;}
function renderLunch(){const my=STATE.myTeam;document.getElementById('lunch').innerHTML=`<div>Mandatory break: <strong>${my.lunchBreakComplete?'complete':'not yet recorded'}</strong></div><div>Have Lunch claim: <strong>${my.haveLunchComplete?'used':'available'}</strong></div>${!my.lunchBreakComplete?'<div class="actions"><button id="markLunch" class="btn secondary">Mark normal 30-minute lunch complete</button></div>':''}`;const b=document.getElementById('markLunch');if(b)b.onclick=()=>{if(confirm('Mark your mandatory normal lunch break complete?'))act({action:'markLunchBreak',team:TEAM_ID,key:TEAM_KEY},{success:'Lunch break marked complete.'});};}

function seenNoticeIds(){try{return JSON.parse(localStorage.getItem('mq_seen_notices_'+TEAM_ID)||'[]');}catch(_e){return [];}}
function markNoticeSeen(id){const seen=seenNoticeIds();if(!seen.includes(id))seen.push(id);localStorage.setItem('mq_seen_notices_'+TEAM_ID,JSON.stringify(seen.slice(-60)));}
function noticeFromServer(n){
  if(n.kind==='refresh'){
    const removed=(n.removedNilIds||[]).map(id=>nilData(id)?.name).filter(Boolean),added=(n.addedNilIds||[]).map(id=>nilData(id)?.name).filter(Boolean),blocked=(n.blockedNilIds||[]).map(id=>nilData(id)?.name).filter(Boolean);
    let text='Board refresh processed. ';
    if(removed.length) text+=`Removed ${removed.join(', ')}. New ${added.join(', ')}.`;
    else if(blocked.length) text+=`No NIL was removed because ${blocked.join(', ')} was protected.`;
    else text+='No NIL received two eligible team votes, so the board did not change.';
    return {id:n.id,at:n.at,kind:'refresh',title:'↻ Board refresh',text};
  }
  if(n.kind==='zombie'){
    const mine=(n.outcomes||[]).find(x=>x.teamId===TEAM_ID);
    let text='';
    if(mine&&mine.status==='restored') text=`Your team resurrected ${challengeLevelLabel(mine.challengeId,mine.levelId)}. It is available again in My challenge inventory.`;
    else if(mine&&mine.status==='first_place') text='Your team received no restoration because it was tied for first place when the event fired.';
    else if(mine&&mine.status==='no_eligible_used_standard_level') text='Your team was eligible to catch up, but had no used standard challenge level to resurrect. Walking Tour and Have Lunch do not count.';
    else text='Night of the Living Challenges fired.';
    const others=(n.restorations||[]).filter(x=>x.teamId!==TEAM_ID).map(x=>`${teamName(x.teamId)} resurrected ${challengeLevelLabel(x.challengeId,x.levelId)}`);
    if(others.length) text+=' '+others.join(' · ')+'.';
    return {id:n.id,at:n.at,kind:'zombie',title:'🧟 Night of the Living Challenges!',text};
  }
  return null;
}
function noticeCandidates(){
  const server=(STATE.notices||[]).map(noticeFromServer).filter(Boolean);
  if(server.length) return server.sort((a,b)=>new Date(b.at)-new Date(a.at));
  // Backward-compatible fallback for state created before v0.3 notices existed.
  const out=[];
  const r=STATE.lastRefreshResult;
  if(r&&r.processedAt){
    const removed=(r.removedNilIds||[]).map(id=>nilData(id)?.name).filter(Boolean),added=(r.addedNilIds||[]).map(id=>nilData(id)?.name).filter(Boolean),blocked=(r.blockedNilIds||[]).map(id=>nilData(id)?.name).filter(Boolean);
    let text='Board refresh processed. ';
    if(removed.length)text+=`Removed ${removed.join(', ')}. New ${added.join(', ')}.`;
    else if(blocked.length)text+=`No NIL was removed because ${blocked.join(', ')} was protected.`;
    else text+='No NIL received two eligible team votes, so the board did not change.';
    out.push({id:'refresh:'+r.id,at:r.processedAt,kind:'refresh',title:'↻ Board refresh',text});
  }
  (STATE.zombieEvents||[]).filter(z=>z.firedAt).forEach(z=>{
    const n=noticeFromServer({id:'zombie:'+z.id+':'+z.firedAt,at:z.firedAt,kind:'zombie',restorations:z.restorations||[],outcomes:z.outcomes||[]});
    if(n)out.push(n);
  });
  return out.sort((a,b)=>new Date(b.at)-new Date(a.at));
}
function renderEventBanner(){
  const el=document.getElementById('eventBanner'),seen=seenNoticeIds();
  const notices=noticeCandidates().filter(n=>!seen.includes(n.id)).slice(0,3);
  if(!notices.length){el.className='event-banner-stack hidden';el.innerHTML='';return;}
  el.className='event-banner-stack';
  el.innerHTML=notices.map(n=>`<div class="event-banner ${esc(n.kind)}" data-notice="${esc(n.id)}"><div><strong>${esc(n.title)}</strong><div>${esc(n.text)}</div></div><button type="button" class="notice-close" data-dismiss="${esc(n.id)}" aria-label="Dismiss">×</button></div>`).join('');
  el.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=()=>{markNoticeSeen(b.dataset.dismiss);renderEventBanner();});
}
function showActionMessage(text){const el=document.getElementById('actionMessage');el.textContent='✓ '+text;el.className='action-message';clearTimeout(actionTimer);actionTimer=setTimeout(()=>{el.className='action-message hidden';},4500);}
async function act(params,opts={}){try{busy=true;setConn('warn','Saving…');await postAction(params);await new Promise(r=>setTimeout(r,800));await refresh();if(opts.verify&&!opts.verify())throw new Error(opts.verifyError||'The change could not be confirmed.');if(opts.success)showActionMessage(opts.success);}catch(e){setConn('error',e.message);alert(e.message);}finally{busy=false;}}
document.getElementById('closeModal').onclick=()=>document.getElementById('claimModal').classList.remove('open');document.getElementById('claimModal').onclick=e=>{if(e.target.id==='claimModal')e.currentTarget.classList.remove('open');};init();
