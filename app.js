// ── PALETTE ──────────────────────────────────────────────────────────────
const PAL = ['rgba(221,0,49,.75)','rgba(64,196,255,.75)','rgba(0,230,118,.75)',
             'rgba(255,171,64,.75)','rgba(179,136,255,.75)','rgba(255,82,82,.65)',
             'rgba(129,212,250,.75)','rgba(165,214,167,.75)','rgba(255,204,128,.75)','rgba(206,147,216,.75)'];

Chart.defaults.color='#555566';
Chart.defaults.borderColor='#1e1e2e';
Chart.defaults.font.family="'JetBrains Mono',monospace";
Chart.defaults.font.size=11;

// ── STATE ─────────────────────────────────────────────────────────────────
let cfg={org:'',token:''};
let currentProject=null;
let data={commits:[],prs:[],tasks:[],repos:[],members:[]};
let charts={};

// ── INIT ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  const saved=localStorage.getItem('ado_cfg2');
  if(saved){cfg=JSON.parse(saved);autoLogin();}
  setDefaultDates();
});

function setDefaultDates(){
  const to=new Date(), from=new Date();
  from.setDate(from.getDate()-30);
  document.getElementById('fTo').value=fmt(to);
  document.getElementById('fFrom').value=fmt(from);
}
const fmt=d=>d.toISOString().split('T')[0];

async function autoLogin(){
  showLoading('Reconectando...');
  try{
    await loadProjects();
    showHeader();
  }catch(e){
    show('login');
  }finally{
    hideLoading();
  }
}

// ── AUTH ──────────────────────────────────────────────────────────────────
async function doLogin(){
  cfg.org=document.getElementById('l-org').value.trim();
  cfg.token=document.getElementById('l-token').value.trim();
  if(!cfg.org||!cfg.token){toast('Ingresa organización y token',true);return;}
  document.getElementById('loginBtn').disabled=true;
  showLoading('Verificando credenciales...');
  try{
    await loadProjects();
    localStorage.setItem('ado_cfg2',JSON.stringify(cfg));
    showHeader();
  }catch(e){
    toast('Error: '+e.message+' — verifica organización y token',true);
  }
  document.getElementById('loginBtn').disabled=false;
  hideLoading();
}

function showHeader(){
  document.getElementById('orgBadge').style.display='flex';
  document.getElementById('orgName').textContent=cfg.org;
  document.getElementById('cfgBtn').style.display='block';
  document.getElementById('liveDot').classList.add('on');
}

// ── API ───────────────────────────────────────────────────────────────────
const b64=s=>btoa(':'+s);
async function adoGet(url){
  const r=await fetch(url,{headers:{'Authorization':'Basic '+b64(cfg.token),'Content-Type':'application/json'}});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function adoPost(url,body){
  const r=await fetch(url,{method:'POST',headers:{'Authorization':'Basic '+b64(cfg.token),'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const base=(proj)=>`https://dev.azure.com/${cfg.org}/${encodeURIComponent(proj)}`;

// ── PROJECTS ──────────────────────────────────────────────────────────────
async function loadProjects(){
  const d=await adoGet(`https://dev.azure.com/${cfg.org}/_apis/projects?api-version=7.1`);
  const projects=d.value||[];
  if(!projects.length)throw new Error('Sin proyectos');

  // get repo counts per project (best effort)
  document.getElementById('projSubtitle').textContent=`${projects.length} proyecto(s) encontrado(s) en ${cfg.org}`;
  document.getElementById('projectsGrid').innerHTML=projects.map(p=>`
    <div class="proj-card" onclick="enterProject('${p.id}','${esc(p.name)}')">
      <div class="proj-icon">📁</div>
      <div class="proj-name">${esc(p.name)}</div>
      <div class="proj-desc">${esc(p.description||'Sin descripción')}</div>
      <div class="proj-meta">
        <span class="proj-tag">${esc(p.state||'')}</span>
        <span class="proj-tag">${p.visibility||'private'}</span>
      </div>
    </div>`).join('');
  show('projects');
}

async function enterProject(id,name){
  currentProject={id,name};
  document.getElementById('projLabel').textContent=name;
  show('dashboard');
  showLoading('Cargando repositorios y miembros...');
  try{
    // repos
    const rd=await adoGet(`${base(name)}/_apis/git/repositories?api-version=7.1`);
    data.repos=rd.value||[];
    populateRepoFilter();
    // team members from commits later
    hideLoading();
    toast(`✓ ${data.repos.length} repositorios cargados — selecciona filtros y carga datos`);
  }catch(e){hideLoading();toast('Error cargando repos: '+e.message,true);}
}

function populateRepoFilter(){
  buildCsel('fRepo','all','Todos los repos',
    data.repos.map(r=>({value:r.id,label:r.name})));
}


function goProjects(){show('projects');}

// ── LOAD DASHBOARD DATA ───────────────────────────────────────────────────
async function loadDashboard(){
  if(!currentProject){toast('Selecciona un proyecto primero',true);return;}
  const from=document.getElementById('fFrom').value;
  const to=document.getElementById('fTo').value;
  if(!from||!to){toast('Selecciona un rango de fechas',true);return;}
 
  showLoading('Cargando...');
  document.getElementById('loadBtn').disabled=true;
  data={commits:[],prs:[],tasks:[],repos:data.repos};

  const repoSel=getCselValue('fRepo');
  const repos=repoSel==='all'?data.repos:data.repos.filter(r=>r.id===repoSel);
  const proj=currentProject.name;

  try{
    // ── COMMITS ──
    for(const repo of repos){
      setLoadTxt(`Commits: ${repo.name}...`);
      try{
        const d=await adoGet(`${base(proj)}/_apis/git/repositories/${repo.id}/commits?searchCriteria.fromDate=${from}&searchCriteria.toDate=${to}&searchCriteria.$top=300&api-version=7.1`);
        (d.value||[]).forEach(c=>data.commits.push({...c,repoName:repo.name,repoId:repo.id}));
      }catch(e){console.warn('commits',repo.name,e.message);}
    }

    // ── PRs (with threads for comments) ──
    for(const repo of repos){
      setLoadTxt(`Pull Requests: ${repo.name}...`);
      try{
        const d=await adoGet(`${base(proj)}/_apis/git/repositories/${repo.id}/pullrequests?searchCriteria.status=all&searchCriteria.$top=150&api-version=7.1`);
        const filtered=(d.value||[]).filter(pr=>{
          const dt=new Date(pr.creationDate);
          return dt>=new Date(from)&&dt<=new Date(to+'T23:59:59');
        });
        // get thread count per PR (comment count)
        for(const pr of filtered){
          try{
            const td=await adoGet(`${base(proj)}/_apis/git/repositories/${repo.id}/pullRequests/${pr.pullRequestId}/threads?api-version=7.1`);
            pr._commentCount=(td.value||[]).filter(t=>!t.isDeleted&&t.comments?.length).reduce((s,t)=>s+t.comments.filter(c=>c.commentType==='text').length,0);
            // work item links
            const wl=await adoGet(`${base(proj)}/_apis/git/repositories/${repo.id}/pullRequests/${pr.pullRequestId}/workitems?api-version=7.1`);
            pr._workItems=(wl.value||[]);
          }catch(e){pr._commentCount=0;pr._workItems=[];}
          data.prs.push({...pr,repoName:repo.name});
        }
      }catch(e){console.warn('prs',repo.name,e.message);}
    }

    // ── WORK ITEMS (WIQL) ──
    setLoadTxt(`Work items del proyecto ${proj}...`);
    try{
      const wiql={query:`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject]='${proj}' AND [System.ChangedDate]>='${from}' ORDER BY [System.ChangedDate] DESC`};
      const wr=await adoPost(`https://dev.azure.com/${cfg.org}/${encodeURIComponent(proj)}/_apis/wit/wiql?api-version=7.1`,wiql);
      const ids=(wr.workItems||[]).slice(0,500).map(w=>w.id);
      for(let i=0;i<ids.length;i+=50){
        const batch=ids.slice(i,i+50);
        const wd=await adoGet(`https://dev.azure.com/${cfg.org}/_apis/wit/workitems?ids=${batch.join(',')}&fields=System.Id,System.Title,System.WorkItemType,System.State,System.AssignedTo,System.Priority,System.ChangedDate,System.CreatedDate,Microsoft.VSTS.Common.ClosedDate&api-version=7.1`);
        (wd.value||[]).forEach(w=>data.tasks.push({...w.fields,_id:w.id}));
      }
    }catch(e){console.warn('tasks',e.message);}

    // ── BUILD MEMBERS FROM DATA ──
    buildMembers();
    populateUserFilter();

    hideLoading();
    document.getElementById('loadBtn').disabled=false;
    renderAll(from,to);
    toast(`✓ ${data.commits.length} commits · ${data.prs.length} PRs · ${data.tasks.length} work items`);

  }catch(err){
    hideLoading();
    document.getElementById('loadBtn').disabled=false;
    toast('Error: '+err.message,true);
    console.error(err);
  }
}

function buildMembers(){
  const map={};
  data.commits.forEach(c=>{
    const k=c.author?.email||c.author?.name||'?';
    if(!map[k])map[k]={name:c.author?.name||k,email:k,commits:0,linesAdd:0,linesDel:0,prs:0,tasks:0,tasksOk:0};
    map[k].commits++;
    map[k].linesAdd+=(c.changeCounts?.Add||0);
    map[k].linesDel+=(c.changeCounts?.Delete||0);
  });
  data.prs.forEach(pr=>{
    const k=pr.createdBy?.uniqueName||pr.createdBy?.displayName||'?';
    if(!map[k])map[k]={name:pr.createdBy?.displayName||k,email:k,commits:0,linesAdd:0,linesDel:0,prs:0,tasks:0,tasksOk:0};
    map[k].prs++;
  });
  data.tasks.forEach(t=>{
    const a=t['System.AssignedTo'];
    const k=(a?.uniqueName||a?.displayName||String(a)||'Sin asignar');
    const name=a?.displayName||k;
    if(!map[k])map[k]={name,email:k,commits:0,linesAdd:0,linesDel:0,prs:0,tasks:0,tasksOk:0};
    map[k].tasks++;
    if(['Closed','Done','Resolved'].includes(t['System.State']))map[k].tasksOk++;
  });
  data.members=Object.values(map).filter(m=>m.name&&m.name!=='?').sort((a,b)=>b.commits-a.commits);
}

function populateUserFilter(){
  buildCsel('fUser','all','Todo el equipo',
    data.members.map(m=>({value:m.email,label:m.name})));
}


// ── FILTERS ───────────────────────────────────────────────────────────────
function getFiltered(){
  const user=getCselValue('fUser');
  const taskType=document.getElementById('fTaskType').value;

  const commits=user==='all'?data.commits:data.commits.filter(c=>(c.author?.email||'')==user||(c.author?.name||'').toLowerCase().includes(user.split('@')[0]));
  const prs=user==='all'?data.prs:data.prs.filter(pr=>(pr.createdBy?.uniqueName||'')==user);
  const tasks=data.tasks.filter(t=>{
    const a=t['System.AssignedTo'];
    const k=a?.uniqueName||a?.displayName||String(a)||'';
    const matchUser=user==='all'||k===user;
    const matchType=taskType==='all'||t['System.WorkItemType']===taskType;
    return matchUser&&matchType;
  });
  return{commits,prs,tasks};
}

// ── RENDER ALL ────────────────────────────────────────────────────────────
function renderAll(from,to){
  const{commits,prs,tasks}=getFiltered();
  const bugs=tasks.filter(t=>t['System.WorkItemType']==='Bug'&&!['Closed','Done'].includes(t['System.State']));
  const reviews=data.prs.filter(pr=>{
    const user=getCselValue('fUser');
    if(user==='all')return false;
    return(pr.reviewers||[]).some(r=>r.uniqueName===user);
  });

  // KPIs
  const totAdd=commits.reduce((s,c)=>s+(c.changeCounts?.Add||0),0);
  const totDel=commits.reduce((s,c)=>s+(c.changeCounts?.Delete||0),0);
  set('kCommits',commits.length);
  set('kLines',`+${totAdd}`);
  set('kLinesSub',`+${totAdd} añadidas / -${totDel} eliminadas`);
  set('kPRs',prs.length);
  set('kPRsSub',`${prs.filter(p=>p.status==='completed').length} completados`);
  set('kTasks',tasks.length);
  set('kTasksSub',`${tasks.filter(t=>['Closed','Done'].includes(t['System.State'])).length} completados`);
  set('kReviews',reviews.length||'—');
  set('kBugs',bugs.length);
  set('cnt-commits',commits.length);
  set('cnt-prs',prs.length);
  set('cnt-tasks',tasks.length);

  renderTeam();
  renderCommits(commits,from,to);
  renderPRs(prs);
  renderTasks(tasks);
  renderTrace(commits,prs,tasks);
}

// ── TEAM ──────────────────────────────────────────────────────────────────
function renderTeam(){
  const list=data.members.slice(0,16);
  if(!list.length){document.getElementById('memberGrid').innerHTML='<div class="empty">Sin datos</div>';return;}
  const maxC=Math.max(...list.map(m=>m.commits),1);
  document.getElementById('memberGrid').innerHTML=list.map((m,i)=>`
    <div class="mcard" onclick="filterByMember('${m.email}',this)">
      <div class="mcard-top">
        <div class="avatar" style="background:${PAL[i%PAL.length].replace('.75','1').replace('rgba','rgba')}">${initials(m.name)}</div>
        <div style="min-width:0">
          <div class="mname">${esc(m.name)}</div>
          <div class="memail">${esc(m.email)}</div>
        </div>
      </div>
      <div class="mstats">
        <div class="ms"><div class="v" style="color:var(--accent)">${m.commits}</div><div class="l">COMMITS</div></div>
        <div class="ms"><div class="v" style="color:var(--purple)">${m.prs}</div><div class="l">PRs</div></div>
        <div class="ms"><div class="v" style="color:var(--ok)">${m.tasksOk}/${m.tasks}</div><div class="l">TASKS OK</div></div>
        <div class="ms"><div class="v" style="color:var(--info)">${m.linesAdd}</div><div class="l">+LÍNEAS</div></div>
      </div>
      <div class="prog"><div class="prog-f" style="width:${Math.round(m.commits/maxC*100)}%"></div></div>
    </div>`).join('');

  document.getElementById('teamCharts').style.display='block';
  const labels=list.map(m=>m.name.split(' ')[0]);

  mkChart('cTeamCommits','bar',labels,
    [{label:'Commits',data:list.map(m=>m.commits),backgroundColor:PAL}],
    {plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}});

  mkChart('cTeamPRs','bar',labels,
    [{label:'PRs',data:list.map(m=>m.prs),backgroundColor:PAL.map(c=>c.replace('.75','.6'))}],
    {plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}});

  mkChart('cTeamLines','bar',labels,[
    {label:'+Añadidas',data:list.map(m=>m.linesAdd),backgroundColor:'rgba(0,230,118,.65)'},
    {label:'-Eliminadas',data:list.map(m=>m.linesDel),backgroundColor:'rgba(255,82,82,.55)'}],
    {plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}});

  mkChart('cTeamTasks','bar',labels,
    [{label:'Completados',data:list.map(m=>m.tasksOk),backgroundColor:'rgba(0,230,118,.6)'}],
    {plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}});
}

function filterByMember(email,el){
  document.querySelectorAll('.mcard').forEach(c=>c.classList.remove('sel'));
  const cur=getCselValue('fUser');
  if(cur===email){
    selectCsel('fUser','all', cselState['fUser']?.defaultLabel||'Todo el equipo');
    el.classList.remove('sel');
  }else{
    const member=data.members.find(m=>m.email===email);
    selectCsel('fUser',email,member?.name||email);
    el.classList.add('sel');
  }
  const from=document.getElementById('fFrom').value;
  const to=document.getElementById('fTo').value;
  renderAll(from,to);
}

// ── COMMITS ───────────────────────────────────────────────────────────────
function renderCommits(commits,from,to){
  const days=dayRange(from,to);
  const byDay={};days.forEach(d=>byDay[d]=0);
  commits.forEach(c=>{const d=(c.author?.date||'').split('T')[0];if(byDay[d]!==undefined)byDay[d]++;});

  mkChart('cCommitsDay','bar',days.map(d=>d.slice(5)),
    [{label:'Commits',data:days.map(d=>byDay[d]),backgroundColor:'rgba(221,0,49,.7)',borderRadius:3}],
    {plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}}}});

  const repos=[...new Set(commits.map(c=>c.repoName))];
  mkChart('cLines','bar',repos,[
    {label:'+Add',data:repos.map(r=>commits.filter(c=>c.repoName===r).reduce((s,c)=>s+(c.changeCounts?.Add||0),0)),backgroundColor:'rgba(0,230,118,.65)'},
    {label:'-Del',data:repos.map(r=>commits.filter(c=>c.repoName===r).reduce((s,c)=>s+(c.changeCounts?.Delete||0),0)),backgroundColor:'rgba(255,82,82,.55)'}],
    {plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}});

  mkChart('cCommitsRepo','doughnut',repos,
    [{data:repos.map(r=>commits.filter(c=>c.repoName===r).length),backgroundColor:PAL}],
    {plugins:{legend:{position:'bottom'}}});

  // top files
  const fc={};
  commits.forEach(c=>(c.changes||[]).forEach(ch=>{const f=(ch.item?.path||'').split('/').pop();if(f)fc[f]=(fc[f]||0)+1;}));
  const tf=Object.entries(fc).sort((a,b)=>b[1]-a[1]).slice(0,8);
  document.getElementById('topFiles').innerHTML=tf.length
    ?tf.map(([f,n])=>`<div class="mli"><span class="k">${esc(f)}</span><span class="v">${n}</span></div>`).join('')
    :'<div class="empty">Sin datos de archivos</div>';

  document.getElementById('tCommits').innerHTML=commits.length
    ?commits.slice(0,100).map(c=>`<tr>
      <td style="color:var(--text3)">${(c.commitId||'').slice(0,7)}</td>
      <td><span class="b b-neu">${esc(c.repoName)}</span></td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.comment||'')}</td>
      <td style="color:var(--text2)">${esc(c.author?.name||'')}</td>
      <td style="color:var(--text3)">${fmtDate(c.author?.date)}</td>
      <td style="color:var(--ok)">+${c.changeCounts?.Add||0}</td>
      <td style="color:var(--danger)">-${c.changeCounts?.Delete||0}</td>
    </tr>`).join('')
    :'<tr><td colspan="7"><div class="empty">Sin commits en el período</div></td></tr>';
}

// ── PRs ───────────────────────────────────────────────────────────────────
function renderPRs(prs){
  // estado
  const byStatus={active:0,completed:0,abandoned:0};
  prs.forEach(p=>{byStatus[p.status]=(byStatus[p.status]||0)+1;});
  mkChart('cPrStatus','doughnut',['Activos','Completados','Abandonados'],
    [{data:[byStatus.active,byStatus.completed,byStatus.abandoned],
      backgroundColor:['rgba(64,196,255,.7)','rgba(0,230,118,.7)','rgba(255,82,82,.7)']}],
    {plugins:{legend:{position:'bottom'}}});

  // votos aprobados vs rechazados
  let approved=0,rejected=0;
  prs.forEach(pr=>(pr.reviewers||[]).forEach(r=>{
    if(r.vote===10||r.vote===5)approved++;
    if(r.vote===-10||r.vote===-5)rejected++;
  }));
  mkChart('cPrVotes','doughnut',['Aprobados','Rechazados/Cambios'],
    [{data:[approved,rejected],backgroundColor:['rgba(0,230,118,.7)','rgba(255,82,82,.7)']}],
    {plugins:{legend:{position:'bottom'}}});

  // avg time
  const closed=prs.filter(p=>p.closedDate&&p.status==='completed');
  const avgH=closed.length?Math.round(closed.reduce((s,p)=>s+(new Date(p.closedDate)-new Date(p.creationDate))/3600000,0)/closed.length):null;
  document.getElementById('prAvgTime').innerHTML=avgH!==null
    ?`<div class="big-stat"><div class="n" style="color:var(--purple)">${avgH<24?avgH+'h':Math.round(avgH/24)+'d'}</div><div class="s">promedio aprobación<br>${closed.length} PRs cerrados</div></div>`
    :'<div class="empty">Sin PRs cerrados</div>';

  // total comments
  const totalComments=prs.reduce((s,p)=>s+(p._commentCount||0),0);
  document.getElementById('prComments').innerHTML=`<div class="big-stat"><div class="n" style="color:var(--warn)">${totalComments}</div><div class="s">comentarios en ${prs.length} PRs<br>~${prs.length?Math.round(totalComments/prs.length):0} por PR</div></div>`;

  // tendencia semanal
  const weeks={};
  prs.forEach(p=>{const w=weekKey(p.creationDate);weeks[w]=(weeks[w]||0)+1;});
  const wk=Object.keys(weeks).sort();
  mkChart('cPrTrend','line',wk,
    [{label:'PRs',data:wk.map(w=>weeks[w]),borderColor:'rgba(179,136,255,.9)',backgroundColor:'rgba(179,136,255,.1)',fill:true,tension:.3,pointRadius:4}],
    {plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}});

  // por repo
  const repos=[...new Set(prs.map(p=>p.repoName))];
  mkChart('cPrRepo','bar',repos,
    [{label:'PRs',data:repos.map(r=>prs.filter(p=>p.repoName===r).length),backgroundColor:PAL}],
    {plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}});

  // tabla
  document.getElementById('tPRs').innerHTML=prs.length
    ?prs.slice(0,100).map(p=>`<tr>
      <td style="color:var(--text3)">!${p.pullRequestId}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title||'')}</td>
      <td><span class="b b-neu">${esc(p.repoName)}</span></td>
      <td style="color:var(--text2)">${esc(p.createdBy?.displayName||'')}</td>
      <td>${prBadge(p.status)}</td>
      <td style="text-align:center">${p._commentCount||0} 💬</td>
      <td style="color:var(--text3)">${fmtDate(p.creationDate)}</td>
      <td style="color:var(--text3)">${p.closedDate?fmtDate(p.closedDate):'—'}</td>
      <td>${(p._workItems||[]).length?p._workItems.map(w=>`<span class="b b-ok">#${w.id}</span>`).join(' '):'—'}</td>
    </tr>`).join('')
    :'<tr><td colspan="9"><div class="empty">Sin PRs en el período</div></td></tr>';
}

// ── TASKS ─────────────────────────────────────────────────────────────────
function renderTasks(tasks){
  const byState={};
  const byType={};
  tasks.forEach(t=>{
    const s=t['System.State']||'?'; byState[s]=(byState[s]||0)+1;
    const tp=t['System.WorkItemType']||'?'; byType[tp]=(byType[tp]||0)+1;
  });

  const sl=Object.keys(byState);
  mkChart('cTaskState','doughnut',sl,[{data:sl.map(s=>byState[s]),backgroundColor:PAL}],{plugins:{legend:{position:'bottom'}}});

  const tl=Object.keys(byType);
  mkChart('cTaskType','bar',tl,[{label:'Items',data:tl.map(t=>byType[t]),backgroundColor:PAL}],
    {plugins:{legend:{display:false}},indexAxis:'y',scales:{x:{beginAtZero:true}}});

  // completadas por semana
  const weeks={};
  tasks.filter(t=>['Closed','Done'].includes(t['System.State'])).forEach(t=>{
    const w=weekKey(t['System.ChangedDate']);weeks[w]=(weeks[w]||0)+1;
  });
  const wk=Object.keys(weeks).sort();
  mkChart('cTaskWeek','line',wk,
    [{label:'Completadas',data:wk.map(w=>weeks[w]),borderColor:'rgba(0,230,118,.9)',backgroundColor:'rgba(0,230,118,.1)',fill:true,tension:.3,pointRadius:4}],
    {plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}});

  // avg close time
  const closed=tasks.filter(t=>t['Microsoft.VSTS.Common.ClosedDate']&&t['System.CreatedDate']);
  const avgD=closed.length?Math.round(closed.reduce((s,t)=>{
    return s+(new Date(t['Microsoft.VSTS.Common.ClosedDate'])-new Date(t['System.CreatedDate']))/86400000;
  },0)/closed.length):null;
  document.getElementById('taskAvgClose').innerHTML=avgD!==null
    ?`<div class="big-stat"><div class="n" style="color:var(--ok)">${avgD}d</div><div class="s">tiempo promedio para cerrar<br>${closed.length} tareas cerradas</div></div>`
    :'<div class="empty">Sin tareas cerradas con fechas</div>';

  document.getElementById('tTasks').innerHTML=tasks.length
    ?tasks.slice(0,100).map(t=>`<tr>
      <td style="color:var(--text3)">#${t._id}</td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t['System.Title']||'')}</td>
      <td>${typeBadge(t['System.WorkItemType'])}</td>
      <td>${stateBadge(t['System.State'])}</td>
      <td style="text-align:center;color:var(--text2)">${t['System.Priority']||'—'}</td>
      <td style="color:var(--text2);font-size:10px">${esc((t['System.AssignedTo']?.displayName||String(t['System.AssignedTo'])||'Sin asignar'))}</td>
      <td style="color:var(--text3)">${fmtDate(t['System.ChangedDate'])}</td>
    </tr>`).join('')
    :'<tr><td colspan="7"><div class="empty">Sin work items</div></td></tr>';
}

// ── TRAZABILIDAD ──────────────────────────────────────────────────────────
function renderTrace(commits,prs,tasks){
  // PRs vinculados a tasks
  const linkedPRs=prs.filter(p=>(p._workItems||[]).length>0);
  set('traceLinkedPRs',linkedPRs.length);
  set('traceTotalPRs',prs.length);

  // Tasks con commits (buscar menciones en mensajes de commit)
  const taskIds=tasks.map(t=>t._id);
  const tasksWithCommits=new Set();
  commits.forEach(c=>{
    const msg=c.comment||'';
    taskIds.forEach(id=>{if(msg.includes('#'+id)||msg.includes(String(id)))tasksWithCommits.add(id);});
  });
  set('traceLinked',tasksWithCommits.size);
  set('traceTotalTasks',tasks.length);

  // Build trace cards: PR → workitems → commits mencionados
  const traceRows=[];

  // From PR links
  linkedPRs.slice(0,30).forEach(pr=>{
    const linkedTasks=pr._workItems||[];
    const relatedCommits=commits.filter(c=>{
      const msg=c.comment||'';
      return linkedTasks.some(w=>msg.includes('#'+w.id)||msg.includes(String(w.id)));
    });
    traceRows.push({pr,tasks:linkedTasks,commits:relatedCommits});
  });

  // From commit messages mentioning tasks
  tasks.filter(t=>tasksWithCommits.has(t._id)&&!linkedPRs.some(pr=>(pr._workItems||[]).some(w=>w.id===t._id))).slice(0,20).forEach(t=>{
    const relCommits=commits.filter(c=>{const msg=c.comment||'';return msg.includes('#'+t._id)||msg.includes(String(t._id));});
    traceRows.push({pr:null,tasks:[{id:t._id,title:t['System.Title'],state:t['System.State']}],commits:relCommits});
  });

  if(!traceRows.length){
    document.getElementById('traceContent').innerHTML='<div class="empty">No se encontraron vínculos tarea↔commit↔PR.<br>Asegúrate de referenciar #ID en los mensajes de commit o vincular work items en los PRs.</div>';
    return;
  }

  document.getElementById('traceContent').innerHTML=traceRows.map(row=>`
    <div class="trace-row">
      <div class="trace-head">
        ${row.pr?`<span class="b b-purple">PR !${row.pr.pullRequestId}</span><span style="color:var(--text2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(row.pr.title||'')}</span><span class="b ${row.pr.status==='completed'?'b-ok':'b-info'}">${row.pr.status}</span>`:''}
        ${row.tasks.map(w=>`<span class="b b-ok">#${w.id} ${esc((w.title||w['System.Title']||'').substring(0,40))}</span>`).join('')}
      </div>
      <div class="trace-commits">
        ${row.commits.length?row.commits.slice(0,5).map(c=>`<div class="trace-commit"><span>${(c.commitId||'').slice(0,7)}</span> · ${esc((c.comment||'').substring(0,70))} · <span style="color:var(--text3)">${esc(c.author?.name||'')}</span></div>`).join(''):'<div class="trace-commit" style="color:var(--text3)">Sin commits con referencia directa</div>'}
      </div>
    </div>`).join('');
}

// ── TABS ──────────────────────────────────────────────────────────────────
function showTab(name){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
}

// ── SETTINGS ──────────────────────────────────────────────────────────────
function openSettings(){document.getElementById('s-org').value=cfg.org;document.getElementById('s-token').value=cfg.token;document.getElementById('settingsModal').classList.add('open');}
function closeSettings(){document.getElementById('settingsModal').classList.remove('open');}
function saveSettings(){cfg.org=document.getElementById('s-org').value.trim();cfg.token=document.getElementById('s-token').value.trim();localStorage.setItem('ado_cfg2',JSON.stringify(cfg));closeSettings();toast('Configuración guardada ✓');}

// ── CHART HELPER ──────────────────────────────────────────────────────────
function mkChart(id,type,labels,datasets,options={}){
  if(charts[id]){charts[id].destroy();}
  charts[id]=new Chart(document.getElementById(id),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:true,...options}});
}

// ── CUSTOM SELECT ─────────────────────────────────────────────────────────
const cselState={};

function buildCsel(id, defaultVal, defaultLabel, options){
  cselState[id]={value:defaultVal,options,defaultVal,defaultLabel};
  renderCselList(id,'');
  setCselLabel(id,defaultVal,defaultLabel,options);
}

function getCselValue(id){
  return cselState[id]?.value??'all';
}

function toggleCsel(id){
  const wrap=document.getElementById('wrap-'+id);
  const isOpen=wrap.classList.contains('open');
  // close all
  document.querySelectorAll('.csel-wrap.open').forEach(w=>w.classList.remove('open'));
  if(!isOpen){
    wrap.classList.add('open');
    const inp=document.getElementById('search-'+id);
    inp.value='';
    renderCselList(id,'');
    setTimeout(()=>inp.focus(),50);
  }
}

function filterCsel(id){
  const q=document.getElementById('search-'+id).value;
  renderCselList(id,q);
}

function renderCselList(id,q){
  const s=cselState[id]; if(!s)return;
  const list=document.getElementById('list-'+id);
  const lq=q.toLowerCase();
  const filtered=s.options.filter(o=>o.label.toLowerCase().includes(lq));

  let html=q?'':
    `<div class="csel-opt all-opt${s.value==='all'?' selected':''}" onclick="selectCsel('${id}','all','${s.defaultLabel}')">${s.defaultLabel}</div>`;

  if(!filtered.length){
    html+='<div class="csel-empty">Sin resultados</div>';
  } else {
    filtered.forEach(o=>{
      const sel=s.value===o.value?' selected':'';
      html+=`<div class="csel-opt${sel}" onclick="selectCsel('${id}','${o.value.replace(/'/g,"\\'")}','${o.label.replace(/'/g,"\\'")}')">${esc(o.label)}</div>`;
    });
  }
  list.innerHTML=html;
}

function selectCsel(id,value,label){
  if(!cselState[id])return;
  cselState[id].value=value;
  document.getElementById('label-'+id).textContent=label;
  document.getElementById('wrap-'+id).classList.remove('open');
  renderCselList(id,'');
  // callbacks por select
  if(id==='fRepo') loadMembersForRepo(value);
}

function setCselLabel(id,value,defaultLabel,options){
  const found=options.find(o=>o.value===value);
  document.getElementById('label-'+id).textContent=found?found.label:defaultLabel;
}

// close on outside click
document.addEventListener('click',e=>{
  if(!e.target.closest('.csel-wrap')){
    document.querySelectorAll('.csel-wrap.open').forEach(w=>w.classList.remove('open'));
  }
});


// ── LOAD MEMBERS FOR REPO ─────────────────────────────────────────────────
async function loadMembersForRepo(repoId){
  // reset usuarios
  buildCsel('fUser','all','Todo el equipo',[]);
  document.getElementById('label-fUser').textContent='Cargando...';

  if(repoId==='all'){
    buildCsel('fUser','all','Todo el equipo',[]);
    return;
  }

  const repo=data.repos.find(r=>r.id===repoId);
  if(!repo||!currentProject)return;

  try{
    // traer los últimos 200 commits del repo para extraer autores únicos
    const d=await adoGet(`${base(currentProject.name)}/_apis/git/repositories/${repoId}/commits?searchCriteria.$top=200&api-version=7.1`);
    const commits=d.value||[];

    const memberMap={};
    commits.forEach(c=>{
      const key=c.author?.email||c.author?.name||'';
      const label=c.author?.name||key;
      if(key&&label&&!memberMap[key]){
        memberMap[key]={name:label,email:key};
      }
    });

    const members=Object.values(memberMap).sort((a,b)=>a.name.localeCompare(b.name));
    buildCsel('fUser','all','Todo el equipo', members.map(m=>({value:m.email,label:m.name})));
    toast(`✓ ${members.length} contribuidores en ${repo.name}`);
  }catch(e){
    buildCsel('fUser','all','Todo el equipo',[]);
    toast('Error cargando miembros del repo',true);
  }
}


// ── SCREEN HELPER ─────────────────────────────────────────────────────────
function show(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(name+'Screen').classList.add('active');
}

// ── UTILS ─────────────────────────────────────────────────────────────────
function set(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
function esc(s){return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function initials(n){return n.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();}
function fmtDate(d){if(!d)return'—';return new Date(d).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'2-digit'});}
function weekKey(ds){if(!ds)return'?';const d=new Date(ds),y=d.getFullYear(),s=new Date(y,0,1),w=Math.ceil((((d-s)/86400000)+s.getDay()+1)/7);return`${y}-W${String(w).padStart(2,'0')}`;}
function dayRange(from,to){const days=[],d=new Date(from),e=new Date(to);while(d<=e){days.push(d.toISOString().split('T')[0]);d.setDate(d.getDate()+1);}return days;}
function prBadge(s){const m={active:'b-info',completed:'b-ok',abandoned:'b-err'};return`<span class="b ${m[s]||'b-neu'}">${s}</span>`;}
function typeBadge(t){const m={Bug:'b-err','User Story':'b-ok',Task:'b-info',Feature:'b-purple',Epic:'b-warn'};return`<span class="b ${m[t]||'b-neu'}">${t||'?'}</span>`;}
function stateBadge(s){const m={'Active':'b-info','In Progress':'b-info','Resolved':'b-warn','Closed':'b-ok','Done':'b-ok','New':'b-neu','To Do':'b-neu'};return`<span class="b ${m[s]||'b-neu'}">${s||'?'}</span>`;}

let toastT;
function toast(msg,err=false){const el=document.getElementById('toast');el.textContent=msg;el.className='toast show'+(err?' err':'');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),4500);}
function showLoading(msg){setLoadTxt(msg);document.getElementById('loadingOverlay').classList.add('show');}
function hideLoading(){document.getElementById('loadingOverlay').classList.remove('show');}
function setLoadTxt(t){document.getElementById('loadTxt').textContent=t;}