let GM_KEY='',STATE=null,MAPOBJ=null,busy=false;
const GM_DRAFT={testClock:null};
async function init(){await loadFixed();const p=new URLSearchParams(location.search);GM_KEY=p.get('key')||localStorage.getItem('mq_gm_key')||'';if(p.get('key'))localStorage.setItem('mq_gm_key',p.get('key'));if(!backendUrl()){const w=document.getElementById('configWarning');w.classList.remove('hidden');w.textContent='Backend URL not configured. Paste the Apps Script /exec URL into backend-config.js.';return;}if(!GM_KEY){GM_KEY=prompt('Enter Game Master access key:')||'';if(GM_KEY)localStorage.setItem('mq_gm_key',GM_KEY);}if(!GM_KEY)return;await refresh();setInterval(()=>{if(!busy&&!document.querySelector('#gmActions input:focus,#gmActions select:focus'))refresh(true);},12000);}
function setConn(c,t){const e=document.getElementById('conn');e.className='pill '+c;e.textContent=t;}
async function refresh(silent=false){try{if(!silent)setConn('warn','Updating…');const x=await jsonp('gmState',{key:GM_KEY});STATE=x;render();setConn('ok','Live');}catch(e){setConn('error',e.message);}}
function render(){document.getElementById('phase').textContent=phaseLabel(STATE.phase);document.getElementById('serverTime').textContent=(STATE.fullState&&STATE.fullState.testNow?'TEST ':'Server ')+fmtTime(STATE.serverTime);document.getElementById('revision').textContent='Revision '+STATE.revision;renderVersionStatus(STATE,document.getElementById('version'));renderScores(STATE,document.getElementById('scores'));renderBonus(STATE,document.getElementById('bonus'));renderLog(STATE,document.getElementById('log'));renderBoard();renderActions();if(!MAPOBJ)MAPOBJ=createMap('map',STATE);else updateMap(MAPOBJ,STATE);}
function renderBoard(){
  const options=CHALLENGES.standard_challenges.map(x=>`<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')+`<option value="have_lunch">Have Lunch</option>`;
  document.getElementById('gmBoard').innerHTML=STATE.board.map(c=>`<div class="card active"><div class="card-title">${esc(nilData(c.nilId).name)}</div><div class="sub">Municipio ${nilData(c.nilId).game_municipio}</div>${cardChallengeHtml(c,null)}<div class="actions"><button class="btn secondary regen" data-id="${c.nilId}">Regenerate challenge</button></div><div class="controls-row" style="margin-top:7px"><select class="setChallenge" data-id="${c.nilId}">${options.replace(`value="${c.challengeId}"`,`value="${c.challengeId}" selected`)}</select><button class="btn secondary setChallengeBtn" data-id="${c.nilId}">Set exact challenge</button></div></div>`).join('');
  document.querySelectorAll('.regen').forEach(b=>b.onclick=()=>gmAct({action:'gmRegenerateChallenge',key:GM_KEY,nilId:b.dataset.id},true));
  document.querySelectorAll('.setChallengeBtn').forEach(b=>b.onclick=()=>{const sel=document.querySelector(`.setChallenge[data-id="${b.dataset.id}"]`);gmAct({action:'gmSetChallenge',key:GM_KEY,nilId:b.dataset.id,challengeId:sel.value},true);});
}

function openingProtectedBy(fs,nilId){for(const t of GAME.teams){const x=fs.teams[t.id];if(x.openingComplete)continue;const d=GAME.opening.directions.find(z=>z.id===x.openingDirection);if(d&&d.nil_ids.includes(Number(nilId)))return t.name;}return '';}
function occupancyProtectedBy(fs,nilId){const t=GAME.teams.find(x=>Number(fs.teams[x.id].occupancyNilId)===Number(nilId));return t?t.name:'';}
function refreshDiagnostics(fs){
  let h='<h3>Current hidden refresh votes</h3><div class="sub">Visible only to the Game Master. A NIL needs votes from two different teams and must not be protected.</div><div class="table-scroll"><table class="gm-table refresh-debug"><tr><th>NIL</th><th>Votes</th><th>Protection</th></tr>';
  STATE.board.forEach(c=>{
    const voters=GAME.teams.filter(t=>(fs.teams[t.id].refreshVotes||[]).map(Number).includes(Number(c.nilId))).map(t=>t.name.replace('Team ',''));
    const protections=[];const occ=occupancyProtectedBy(fs,c.nilId),op=openProtectedBySafe(fs,c.nilId);if(occ)protections.push('Occupied: '+occ);if(op)protections.push('Opening: '+op);
    h+=`<tr><td>${esc(nilData(c.nilId).name)}</td><td><strong>${voters.length}</strong>${voters.length?' ('+esc(voters.join(', '))+')':''}</td><td class="${protections.length?'protected':''}">${protections.length?esc(protections.join(' · ')):'—'}</td></tr>`;
  });
  h+='</table></div>';
  const r=STATE.lastRefreshResult;
  if(r){const removed=(r.removedNilIds||[]).map(id=>nilData(id).name),added=(r.addedNilIds||[]).map(id=>nilData(id).name),blocked=(r.blockedNilIds||[]).map(id=>nilData(id).name);let msg=removed.length?`Removed ${removed.join(', ')}; added ${added.join(', ')}.`:blocked.length?`No removal; protected despite enough votes: ${blocked.join(', ')}.`:'No NIL received two eligible votes.';h+=`<div class="saved-state saved"><strong>Last refresh:</strong> ${esc(msg)}</div>`;}
  return h;
}
function zombieDiagnostics(fs){
  const counts=STATE.scores.teams,leader=Math.max(...GAME.teams.map(t=>counts[t.id].rawClaims));
  let h='<h3>Zombie eligibility now</h3><div class="sub">A team tied for first gets nothing. A trailing team needs at least one used standard challenge level; Walking Tour and Lunch are not eligible.</div><div class="table-scroll"><table class="gm-table"><tr><th>Team</th><th>NILs</th><th>Used standard levels</th><th>If fired now</th></tr>';
  GAME.teams.forEach(t=>{const team=fs.teams[t.id];let used=0;CHALLENGES.standard_challenges.forEach(c=>(c.levels||[]).forEach(l=>{if(team.inventory.standard&&team.inventory.standard[c.id]&&team.inventory.standard[c.id][l.id]==='used')used++;}));const first=counts[t.id].rawClaims===leader;const outcome=first?'No restoration — tied for first':used?`Randomly restore 1 of ${used}`:'No restoration — no eligible used standard level';h+=`<tr><td>${esc(t.name)}</td><td>${counts[t.id].rawClaims}</td><td>${used}</td><td>${esc(outcome)}</td></tr>`;});
  h+='</table></div>';
  const z=STATE.lastZombieResult;
  if(z){const parts=(z.outcomes||[]).map(o=>{if(o.status==='restored')return `${teamName(o.teamId)}: ${challengeLevelLabel(o.challengeId,o.levelId)}`;if(o.status==='first_place')return `${teamName(o.teamId)}: first place`;return `${teamName(o.teamId)}: no eligible used standard level`;});h+=`<div class="saved-state saved"><strong>Last Zombie:</strong> ${esc(parts.join(' · ')||'No restorations')}</div>`;}
  return h;
}
function localInputFromIso(iso){if(!iso)return '';const d=new Date(iso);const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}

function openProtectedBySafe(fs,nilId){return openingProtectedBy(fs,nilId);}
function renderActions(){
  const fs=STATE.fullState;
  const testClockValue=GM_DRAFT.testClock!==null?GM_DRAFT.testClock:localInputFromIso(fs.testNow);
  let h=`<h3>Immediate controls</h3><div class="actions"><button id="runRefresh" class="btn">Run refresh now</button><button id="zombie" class="btn">Activate next Zombie</button><button id="undo" class="btn danger">Undo last saved action</button></div>${refreshDiagnostics(fs)}${zombieDiagnostics(fs)}`;
  h+=`<h3>Test clock</h3><div class="sub">For pre-game testing only. Your unsaved date/time is now preserved while this page auto-refreshes. When you set a future game time, all refreshes, Zombie events, Lunch expiry, or Sunday reset due by that time are processed immediately. Moving the clock backwards does not undo events already processed.</div><div class="controls-row"><input id="testClock" type="datetime-local" value="${esc(testClockValue)}"><button id="setClock" class="btn secondary">Set test clock</button><button id="clearClock" class="btn secondary">Use real time</button></div><div class="actions"><button type="button" class="btn secondary clockPreset" data-clock="${GAME.schedule.saturday_date}T09:59">Sat 09:59</button><button type="button" class="btn secondary clockPreset" data-clock="${GAME.schedule.saturday_date}T10:00">Sat 10:00</button><button type="button" class="btn secondary clockPreset" data-clock="${GAME.schedule.saturday_date}T11:00">Sat 11:00</button><button type="button" class="btn secondary clockPreset" data-clock="${GAME.schedule.saturday_date}T14:15">Sat 14:15</button><button type="button" class="btn secondary clockPreset" data-clock="${GAME.schedule.saturday_date}T15:00">Sat 15:00</button><button type="button" class="btn secondary clockPreset" data-clock="${GAME.schedule.sunday_date}T08:29">Sun 08:29</button><button type="button" class="btn secondary clockPreset" data-clock="${GAME.schedule.sunday_date}T08:30">Sun 08:30</button><button type="button" class="btn secondary clockPreset" data-clock="${GAME.schedule.sunday_date}T09:00">Sun 09:00</button><button type="button" class="btn secondary clockPreset" data-clock="${GAME.schedule.sunday_date}T12:00">Sun 12:00</button></div>${fs.testNow?`<div class="saved-state saved">TEST CLOCK ACTIVE: ${esc(new Date(fs.testNow).toLocaleString())}</div>`:''}`;
  h+=`<h3>Phase override</h3><div class="controls-row"><select id="phaseSel"><option value="">Automatic schedule</option>${['pre_game','saturday_live','saturday_rest','sunday_planning','sunday_live','ended'].map(p=>`<option value="${p}" ${fs.phaseOverride===p?'selected':''}>${phaseLabel(p)}</option>`).join('')}</select><button id="savePhase" class="btn secondary">Save</button></div>`;
  h+=`<h3>Transfer claimed NIL</h3><div class="controls-row"><select id="transferNil"><option value="">Choose claimed NIL</option>${Object.values(STATE.claims).sort((a,b)=>nilData(a.nilId).name.localeCompare(nilData(b.nilId).name)).map(c=>`<option value="${c.nilId}">${esc(nilData(c.nilId).name)} (${teamName(c.teamId)})</option>`).join('')}</select><select id="toTeam">${GAME.teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select><button id="transfer" class="btn secondary">Transfer</button></div>`;
  h+=`<h3>Opening status</h3><div class="table-scroll"><table class="gm-table"><tr><th>Team</th><th>Direction</th><th>Opened?</th></tr>${GAME.teams.map(t=>`<tr><td>${t.name}</td><td>${esc(fs.teams[t.id].openingDirection)}</td><td>${fs.teams[t.id].openingComplete?'Yes':'No'}</td></tr>`).join('')}</table></div>`;
  h+=`<h3>Hidden Zombie schedule</h3><div class="table-scroll"><table class="gm-table"><tr><th>Event</th><th>Scheduled</th><th>Fired</th></tr>${fs.zombieEvents.map(z=>`<tr><td>${esc(z.label)}</td><td>${new Date(z.scheduledAt).toLocaleString()}</td><td>${z.firedAt?new Date(z.firedAt).toLocaleString():'No'}</td></tr>`).join('')}</table></div>`;
  document.getElementById('gmActions').innerHTML=h;
  document.getElementById('runRefresh').onclick=()=>gmAct({action:'gmRunRefresh',key:GM_KEY},true);
  document.getElementById('zombie').onclick=()=>gmAct({action:'gmTriggerZombie',key:GM_KEY},true);
  document.getElementById('undo').onclick=()=>gmAct({action:'gmUndo',key:GM_KEY},true);
  document.getElementById('savePhase').onclick=()=>gmAct({action:'gmSetPhaseOverride',key:GM_KEY,phase:document.getElementById('phaseSel').value},false);
  const clockInput=document.getElementById('testClock');
  clockInput.oninput=()=>{GM_DRAFT.testClock=clockInput.value;};
  document.querySelectorAll('.clockPreset').forEach(b=>b.onclick=()=>{GM_DRAFT.testClock=b.dataset.clock;clockInput.value=b.dataset.clock;});
  document.getElementById('setClock').onclick=()=>{const v=clockInput.value;if(!v)return alert('Choose a test date/time.');GM_DRAFT.testClock=v;const d=new Date(v);if(isNaN(d.getTime()))return alert('Invalid test date/time.');gmAct({action:'gmSetTestClock',key:GM_KEY,testNow:d.toISOString()},true);};
  document.getElementById('clearClock').onclick=()=>{GM_DRAFT.testClock=null;gmAct({action:'gmSetTestClock',key:GM_KEY,testNow:''},true);};
  document.getElementById('transfer').onclick=()=>{const n=document.getElementById('transferNil').value;if(!n)return alert('Choose a claimed NIL.');gmAct({action:'gmTransferNil',key:GM_KEY,nilId:n,toTeam:document.getElementById('toTeam').value},true);};
}

async function gmAct(params,confirmFirst){
  if(confirmFirst&&!confirm('Apply this Game Master action to live state?'))return;
  try{
    busy=true;setConn('warn','Saving…');

    if(params.action==='gmSetTestClock'){
      // The test clock uses a JSONP mutation endpoint so the browser receives a
      // direct authoritative response. This avoids the unreliable no-cors POST
      // confirmation path that caused v0.4 test-clock failures.
      const expected=params.testNow?new Date(params.testNow).toISOString():'';
      const result=await jsonp('gmSetTestClock',{key:GM_KEY,testNow:params.testNow||''});
      const returned=result.testNow?new Date(result.testNow).toISOString():'';
      if(returned!==expected)throw new Error('The backend did not confirm the requested test time.');
      STATE=await jsonp('gmState',{key:GM_KEY});
      GM_DRAFT.testClock=null;
      render();setConn('ok','Live');
      return;
    }

    const beforeRevision=STATE?Number(STATE.revision||0):0;
    await postAction(params);
    let latest=null,confirmed=false;
    // Other Apps Script POSTs remain no-cors, so poll authoritative state until the
    // revision changes rather than relying on a fixed delay.
    for(let i=0;i<12;i++){
      await new Promise(r=>setTimeout(r,i===0?500:350));
      latest=await jsonp('gmState',{key:GM_KEY});
      confirmed=Number(latest.revision||0)>beforeRevision;
      if(confirmed)break;
    }
    if(!latest||!confirmed)throw new Error('The backend did not confirm this Game Master change. Please try again.');
    STATE=latest;render();setConn('ok','Live');
  }catch(e){alert(e.message);setConn('error',e.message);}finally{busy=false;}
}

init();
