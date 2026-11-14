const FRONTEND_VERSION='1.1.1';
const TEAM_COLORS={blue:'#2563EB',green:'#16A34A',red:'#DC2626'};
const UNCLAIMED='#D1D5DB'; const ACTIVE='#F59E0B';
let FIXED=null, GEO=null, CHALLENGES=null, GAME=null;
async function loadFixed(){
  if(FIXED)return;
  [FIXED,GEO,CHALLENGES,GAME]=await Promise.all([
    fetch('nil_data.json',{cache:'no-store'}).then(r=>r.json()),
    fetch('nil_data.geojson',{cache:'no-store'}).then(r=>r.json()),
    fetch('challenge_config.json',{cache:'no-store'}).then(r=>r.json()),
    fetch('game_config.json',{cache:'no-store'}).then(r=>r.json())
  ]);
}
function backendUrl(){const u=window.MILANO_BACKEND_URL||'';return u.includes('PASTE_')?'':u;}
function jsonp(action,params={}){
  return new Promise((resolve,reject)=>{
    const base=backendUrl();if(!base)return reject(new Error('Backend URL has not been configured.'));
    const cb='mqcb_'+Date.now()+'_'+Math.floor(Math.random()*1e6);const s=document.createElement('script');
    const u=new URL(base);u.searchParams.set('action',action);u.searchParams.set('callback',cb);Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null)u.searchParams.set(k,v);});
    const timer=setTimeout(()=>{cleanup();reject(new Error('Backend request timed out.'));},15000);
    function cleanup(){clearTimeout(timer);delete window[cb];s.remove();}
    window[cb]=(data)=>{cleanup();data&&data.ok?resolve(data):reject(new Error(data&&data.error||'Backend error'));};
    s.onerror=()=>{cleanup();reject(new Error('Could not reach backend.'));};s.src=u.toString();document.head.appendChild(s);
  });
}
async function postAction(params){
  const base=backendUrl();if(!base)throw new Error('Backend URL has not been configured.');
  const body=new URLSearchParams();Object.entries(params).forEach(([k,v])=>body.set(k,typeof v==='string'?v:JSON.stringify(v)));
  await fetch(base,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()});
}
function nilData(id){return FIXED.nils.find(n=>Number(n.id)===Number(id));}
function challengeData(id){return [...CHALLENGES.standard_challenges,...CHALLENGES.special_challenges].find(c=>c.id===id);}
function challengeLevelData(challengeId,levelId){const c=challengeData(challengeId);return c&&c.levels?c.levels.find(l=>l.id===levelId):null;}
function challengeLevelLabel(challengeId,levelId){const c=challengeData(challengeId),l=challengeLevelData(challengeId,levelId);return c&&l?`${c.title} ${l.label}`:(c?c.title:challengeId);}
function esc(x){return String(x??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function fmt(n,d=1){return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});}
function fmtTime(iso){if(!iso)return '—';return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function phaseLabel(p){return ({pre_game:'Pre-game',saturday_live:'Saturday live',saturday_rest:'Rest period',sunday_planning:'Sunday planning',sunday_live:'Sunday live',ended:'Game ended'})[p]||p;}
function renderVersionStatus(state,el){if(!el)return;const backend=state&&state.backendVersion?String(state.backendVersion):'unknown';const match=backend===FRONTEND_VERSION;el.className='pill '+(match?'ok':'error');el.textContent=`Frontend v${FRONTEND_VERSION} · Backend v${backend}${match?'':' ⚠'}`;}
function teamName(id){const t=GAME.teams.find(x=>x.id===id);return t?t.name:id;}
function ownerOf(state,id){const c=state.claims[String(Number(id))];return c?c.teamId:null;}
function activeCard(state,id){return state.board.find(c=>Number(c.nilId)===Number(id));}
function cardChallengeHtml(card,myTeam){
  const c=challengeData(card.challengeId);if(!c)return '<div class="challenge-title">Unknown challenge</div>';
  let html=`<div class="challenge-title">${esc(c.title)}</div>`;
  html+=`<div class="challenge-summary">${esc(c.description||'')}</div>`;
  const detailItems=c.items||c.options||[];
  const hasDetails=(c.levels&&c.levels.length)||detailItems.length||c.proof||c.reference_url;
  if(hasDetails){
    html+='<details class="challenge-details"><summary>Levels & details</summary>';
    if(c.description) html+=`<p class="detail-description">${esc(c.description)}</p>`;
    if(c.levels&&c.levels.length){
      html+='<div class="level-list">'+c.levels.map(l=>{
        let status='';
        if(myTeam&&myTeam.inventory&&myTeam.inventory.standard[c.id])status=myTeam.inventory.standard[c.id][l.id]||'';
        return `<div class="level ${esc(status)}"><strong>${esc(l.label)}</strong>: ${esc(l.requirement)}</div>`;
      }).join('')+'</div>';
    }
    if(detailItems.length) html+='<ul class="detail-list">'+detailItems.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';
    if(c.proof) html+=`<p class="section-note"><strong>Proof:</strong> ${esc(c.proof)}</p>`;
    if(c.reference_url) html+=`<p><a href="${esc(c.reference_url)}" target="_blank" rel="noopener">${esc(c.reference_label||'Reference guide')}</a></p>`;
    html+='</details>';
  }
  return html;
}
function renderScores(state,el){
  el.innerHTML=GAME.teams.map(t=>{const s=state.scores.teams[t.id];return `<div class="score-card"><span class="team-badge team-${t.id}">${esc(t.name)}</span><strong>${fmt(s.totalProvisionalScore,1)}</strong><small>${s.rawClaims} NILs · base ${fmt(s.baseScore,1)} + bonus ${fmt(s.provisionalBonusPoints,0)}</small></div>`;}).join('');
}
function renderBonus(state,el){
  const m=state.scores.teams;const b=state.scores.bonusLeaders;
  function cls(key,t){const x=b[key];return x.tied?'':(x.leaders[0]===t?'leader':'');}
  function val(metric,t){if(metric==='totalAreaKm2')return fmt(m[t][metric],2)+' km²';if(metric==='averageDensity')return Math.round(m[t][metric]).toLocaleString()+'/km²';return m[t][metric];}
  const rows=[['Municipi','municipiosRepresented','most_game_municipi'],['Area','totalAreaKm2','largest_total_area'],['Avg. density','averageDensity','highest_average_population_density'],['Extremes','extremeCompletions','most_extreme_completions']];
  let h='<div class="table-scroll"><table class="bonus-table"><thead><tr><th>Bonus</th>'+GAME.teams.map(t=>`<th>${esc(t.name.replace('Team ',''))}</th>`).join('')+'</tr></thead><tbody>';
  rows.forEach(([label,metric,key])=>{h+=`<tr><td>${label}${b[key].tied?' <span class="tied">TIED</span>':''}</td>`+GAME.teams.map(t=>`<td class="${cls(key,t.id)}">${val(metric,t.id)}</td>`).join('')+'</tr>';});h+='</tbody></table></div>';
  h+='<h3>Municipio coverage</h3><div class="municipio-grid"><div class="head">M</div>'+GAME.teams.map(t=>`<div class="head">${t.name.replace('Team ','')}</div>`).join('');
  for(let mun=1;mun<=9;mun++){h+=`<div class="head">${mun}</div>`+GAME.teams.map(t=>`<div>${m[t.id].municipioCounts[mun]||0}</div>`).join('');}h+='</div>';el.innerHTML=h;
}
function createMap(el,state){
  const map=L.map(el,{zoomControl:true}).setView([45.4642,9.19],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
  const layer=L.geoJSON(GEO,{style:f=>styleFeature(f,state),onEachFeature:(f,l)=>bindFeature(f,l,state)}).addTo(map);map.fitBounds(layer.getBounds(),{padding:[8,8]});setTimeout(()=>map.invalidateSize(),50);return {map,layer};
}
function styleFeature(f,state){const id=Number(f.properties.ID_NIL);const owner=ownerOf(state,id);const active=!!activeCard(state,id);return {fillColor:owner?TEAM_COLORS[owner]:UNCLAIMED,fillOpacity:owner ? .72 : .34,color:active?ACTIVE:'#6b7280',weight:active?4:1.2,opacity:1};}
function bindFeature(f,l,state){const id=Number(f.properties.ID_NIL),n=nilData(id),owner=ownerOf(state,id),card=activeCard(state,id);let h=`<strong>${esc(n.name)}</strong><br>Municipio ${n.game_municipio}<br>`;h+=owner?`Owner: ${esc(teamName(owner))}<br>`:'Unclaimed<br>';if(card)h+=`<strong>ACTIVE</strong>: ${esc(challengeData(card.challengeId).title)}<br>`;h+=`Area: ${fmt(n.area_km2,2)} km²<br>Population: ${Number(n.population_2025).toLocaleString()}<br>Density: ${Math.round(n.population_density_per_km2).toLocaleString()}/km²`;l.bindPopup(h);}
function updateMap(mapObj,state){mapObj.layer.eachLayer(l=>{l.setStyle(styleFeature(l.feature,state));bindFeature(l.feature,l,state);});setTimeout(()=>mapObj.map.invalidateSize(),10);}
function renderLog(state,el){el.innerHTML=(state.recentLog||[]).slice().reverse().map(x=>`<div class="log-row"><strong>${esc(fmtTime(x.at))}</strong> ${x.teamId?esc(teamName(x.teamId))+': ':''}${esc(x.text||x.type)}</div>`).join('')||'<div class="sub">No log entries yet.</div>';}
