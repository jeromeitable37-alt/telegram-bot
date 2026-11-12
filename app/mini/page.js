'use client';
import {useEffect,useMemo,useState,useCallback} from 'react';
import './mini.css';

const securityOptions=[
  ['security_shield_enabled','Main Security Shield'],
  ['security_block_bots','Block joining bot accounts'],
  ['security_newcomer_links','Guard links from new members (6h)'],
  ['security_newcomer_media','Guard video uploads from new members (1h)'],
  ['security_sensitive_spam','Detect suspicious/scam promotions'],
  ['security_auto_mute','Mute/ban persistent spammers']
];
const initialTabs=[
  ['home','⌂','Overview'],['search','⌕','File Finder'],['library','▣','File Center'],
  ['how','✧','Ask YAJETZY AI'],['member','◈','Member Hub'],['admin','⚙','Admin Console']
];
function Card({children,className=''}){return <section className={'v6-card '+className}>{children}</section>;}
function Tag({children,tone='neutral'}){return <span className={'v6-tag '+tone}>{children}</span>;}
function Empty({children}){return <div className="v6-empty">{children}</div>;}
const button=(text,fn,variant='secondary',disabled=false)=><button type="button" className={'v6-btn '+variant} disabled={disabled} onClick={fn}>{text}</button>;
const fmt=date=>date?new Date(date).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
function FileRow({file,admin,onReview,onSend,busy}){
  const color=file.reviewStatus==='approved'?'ok':file.reviewStatus==='rejected'?'bad':'warn';
  return <div className="v6-file">
    <span className="v6-file-icon">{file.mime?.includes('pdf')?'▤':'▣'}</span>
    <div className="v6-file-meta"><strong>{file.name}</strong>{file.sourceGroup&&<small className="v6-source-group">From: {file.sourceGroup}</small>}
      <div className="v6-filename-detail"><Tag tone={color}>{file.reviewStatus}</Tag><span>{fmt(file.createdAt)}</span>{file.approvedForDelivery&&<Tag tone="ok">Send enabled</Tag>}</div>
    </div>
    <div className="v6-file-actions">
      {file.link?<a className="v6-btn secondary" href={file.link} target="_blank" rel="noreferrer">Open Telegram</a>:<span className="v6-pending">Awaiting review</span>}
      {file.reviewStatus==='approved'&&file.approvedForDelivery&&onSend&&button('📥 Send to topic',()=>onSend(file),'primary',busy)}
      {admin&&file.reviewStatus!=='approved'&&button('Approve',()=>onReview(file.id,'approved'),'primary')}
      {admin&&file.reviewStatus!=='rejected'&&button('Reject',()=>onReview(file.id,'rejected'),'danger')}
    </div>
  </div>;
}
export default function YAJETZYMiniApp(){
  const [auth,setAuth]=useState('');
  const [starting,setStarting]=useState(true);
  const [boot,setBoot]=useState(null);
  const [groupId,setGroupId]=useState('');
  const [data,setData]=useState(null);
  const [tab,setTab]=useState('home');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState('');
  const [searchScope,setSearchScope]=useState('current');
  const [allSearchBusy,setAllSearchBusy]=useState(false);
  const [searchResults,setSearchResults]=useState(null);
  const [sendTopic,setSendTopic]=useState('1');
  const [sentLink,setSentLink]=useState('');
  const [howQuestion,setHowQuestion]=useState('');
  const [howHistory,setHowHistory]=useState([]);
  const [howBusy,setHowBusy]=useState(false);
  const [ticketText,setTicketText]=useState('');
  const [reportReason,setReportReason]=useState('');
  const [reportUser,setReportUser]=useState('');
  const [reportMessage,setReportMessage]=useState('');
  const [announce,setAnnounce]=useState('');
  const [bulkText,setBulkText]=useState('');
  const [answers,setAnswers]=useState({});
  const [menu,setMenu]=useState(false);
  const host='https://t.me/yaje37_bot';
  const api=useCallback(async(path,body=null)=>{
    const res=await fetch('/api/v6'+path,{
      method:body?'POST':'GET',
      headers:{'x-telegram-init-data':auth,...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const json=await res.json().catch(()=>({error:'Server response was unavailable.'}));
    if(!res.ok||!json.ok)throw new Error(json.error||'Request failed');
    return json;
  },[auth]);
  useEffect(()=>{
    let attempts=0, timer;
    function initialize(){
      const app=window.Telegram?.WebApp;
      if(app){
        app.ready();app.expand();
        if(app.initData){setAuth(app.initData);setStarting(false);return;}
      }
      if(++attempts<18)timer=setTimeout(initialize,180);
      else setStarting(false);
    }
    initialize();
    return()=>clearTimeout(timer);
  },[]);
  useEffect(()=>{
    if(!auth)return;
    let done=false;
    api('?mode=bootstrap').then(v=>{
      if(done)return;
      setBoot(v);
      const first=v.groups?.[0]?.chatId||'';
      if(first)setGroupId(first);
    }).catch(e=>{if(!done)setNotice(e.message);});
    return()=>{done=true;};
  },[auth,api]);
  const refresh=useCallback(async(id)=>{
    if(!id)return;
    const v=await api('?mode=snapshot&chatId='+encodeURIComponent(id));
    setData(v);
  },[api]);
  useEffect(()=>{
    if(!groupId)return;
    let active=true;
    api('?mode=snapshot&chatId='+encodeURIComponent(groupId)).then(v=>{if(active)setData(v);})
      .catch(e=>{if(active)setNotice(e.message);});
    return()=>{active=false;};
  },[groupId,api]);
  useEffect(()=>{
    const listed=(data?.topics||[]).filter(t=>t.listed);
    if(listed.length&&!listed.some(t=>String(t.id)===sendTopic))setSendTopic(String(listed[0].id));
  },[data,sendTopic]);
  useEffect(()=>{
    if(searchScope==='all')return;
    if(!groupId||search.trim().length<2){setSearchResults(null);return;}
    let active=true;
    const t=setTimeout(()=>{
      api('?mode=search&chatId='+encodeURIComponent(groupId)+'&q='+encodeURIComponent(search))
        .then(v=>{if(active)setSearchResults(v);}).catch(e=>{if(active)setNotice(e.message);});
    },290);
    return()=>{active=false;clearTimeout(t);};
  },[search,groupId,api,searchScope]);

  const searchConnectedGroups=async()=>{
    if(allSearchBusy||search.trim().length<2)return;
    setAllSearchBusy(true);setNotice('');setSearchResults(null);
    try{
      const result=await api('?mode=searchall&q='+encodeURIComponent(search.trim()));
      setSearchResults(result);
    }catch(error){setNotice(error.message);}
    finally{setAllSearchBusy(false);}
  };
  const change=async(body,after)=>{
    if(busy)return;
    setBusy(true);setNotice('');
    try{
      const res=await api('',{chatId:groupId,...body});
      if(res.note)setNotice(res.note);
      else setNotice('✓ Changes saved.');
      await refresh(groupId);
      if(after)after();
    }catch(e){setNotice(e.message);}
    finally{setBusy(false);}
  };
  const admin=data?.group?.admin;
  const nav=initialTabs.filter(x=>x[0]!=='admin'||admin);
  const topics=data?.topics||[];
  const adminData=data?.adminData||{};
  const featured=useMemo(()=>[...topics].filter(x=>x.listed).slice(0,5),[topics]);
  const adminReview=(id,status)=>change({action:'file_review',messageId:id,status});
  const sendFile=async(file)=>{
    if(busy||!sendTopic)return;
    setBusy(true);setSentLink('');setNotice('');
    try{
      const result=await api('',{chatId:groupId,action:'file_send',messageId:file.id,threadId:sendTopic});
      setSentLink(result.link||'');
      setNotice('✅ Reviewed file sent to '+result.topicName+' in Telegram.');
    }catch(error){setNotice(error.message);}
    finally{setBusy(false);}
  };
  const askInApp=async()=>{
    const q=howQuestion.trim();
    if(howBusy||q.length<5||q.length>500)return;
    setHowBusy(true);setNotice('');
    const key=Date.now()+'-'+Math.random().toString(36).slice(2);
    setHowHistory(prev=>[...prev.slice(-7),{key,question:q,answer:'',mode:'loading'}]);
    setHowQuestion('');
    try{
      const result=await api('',{chatId:groupId,action:'ask_ai',question:q});
      setHowHistory(prev=>prev.map(item=>item.key===key?
        {...item,answer:result.answer,mode:result.mode}:item));
      if(result.notice)setNotice(result.notice);
    }catch(error){
      setHowHistory(prev=>prev.map(item=>item.key===key?
        {...item,answer:error.message,mode:'error'}:item));
    }finally{setHowBusy(false);}
  };

  if(starting)return <div className="v6-center"><div className="v6-spinner"/>Connecting securely to Telegram…</div>;
  if(!auth)return <main className="v6-locked"><div className="v6-logo">Y</div><h1>Open YAJETZY in Telegram</h1><p>This dashboard verifies your Telegram identity. A normal browser link cannot sign you in.</p><a href={host} className="v6-btn primary">Open @yaje37_bot</a><p className="v6-small">Send /hub and tap Open Control Center.</p></main>;
  if(!boot)return <div className="v6-center"><div className="v6-spinner"/>Verifying Telegram identity…{notice&&<p>{notice}</p>}</div>;
  if(!boot.groups?.length)return <main className="v6-locked"><div className="v6-logo">Y</div><h2>No available communities</h2><p>Join a community managed by YAJETZY to use its hub.</p><a href={host} className="v6-btn primary">Back to bot</a></main>;
  return <div className="v6-app">
    <aside className={'v6-sidebar '+(menu?'mobile-open':'')}>
      <div className="v6-brand"><div className="v6-logo">Y</div><div><strong>YAJETZY</strong><span>COMMUNITY OS · V7</span></div></div>
      <div className="v6-sidelabel">WORKSPACE</div>
      <select aria-label="Select Telegram group" className="v6-select" value={groupId} onChange={e=>{setGroupId(e.target.value);setData(null);setSearch('');setSearchResults(null);setHowHistory([]);setSentLink('');setTab('home');setMenu(false);}}>
        {boot.groups.map(g=><option key={g.chatId} value={g.chatId}>{g.title}</option>)}
      </select>
      <div className="v6-sidelabel">EXPLORE</div>
      <nav className="v6-nav">
        {nav.map(([name,icon,title])=><button key={name} className={tab===name?'active':''} onClick={()=>{setTab(name);setMenu(false);}}><span>{icon}</span>{title}{name==='admin'&&adminData.stats?.pending_files>0&&<em>{adminData.stats.pending_files}</em>}</button>)}
      </nav>
      <div className="v6-sidebar-foot"><span className="v6-dot"/> Connected with Telegram <p>Signed identity · Group-scoped access</p></div>
    </aside>
    <main className="v6-main">
      <header className="v6-header"><div className="v6-heading"><button className="v6-mobile-menu" onClick={()=>setMenu(!menu)}>☰</button><span className="v6-breadcrumb">{data?.group?.title||'Loading workspace'} / {nav.find(t=>t[0]===tab)?.[2]}</span></div><div className="v6-account"><Tag tone={admin?'ok':'neutral'}>{admin?'Admin':'Member'}</Tag><span className="v6-avatar">{(boot.user?.name||'Y').slice(0,1).toUpperCase()}</span></div></header>
      {notice&&<div className="v6-notice" role="status"><span>{notice} {sentLink&&<a href={sentLink} target="_blank" rel="noreferrer">Open sent post ↗</a>}</span><button onClick={()=>{setNotice('');setSentLink('');}} aria-label="Dismiss">×</button></div>}
      {!data?<div className="v6-center"><div className="v6-spinner"/>Loading community dashboard…</div>:<div className="v6-content">
        {tab==='home'&&<>
          <div className="v6-hero"><div><div className="v6-eyebrow">WELCOME TO YOUR COMMUNITY</div><h1>Everything YAJE.<br/><span>One command center.</span></h1><p>Find verified resources, get help, and keep your Telegram community organized.</p><div className="v6-hero-actions">{button('Explore files →',()=>setTab('search'),'primary')}{button('Ask YAJETZY AI',()=>setTab('how'))}</div></div><div className="v6-hero-art"><div className="v6-orbit"><span>Y</span></div></div></div>
          <div className="v6-stats">
            <Card><span>▣</span><strong>{admin?adminData.stats?.files||0:data.files.length}</strong><label>Files in library</label></Card>
            <Card><span>⌕</span><strong>{data.notes.length}</strong><label>Saved notes</label></Card>
            <Card><span>◫</span><strong>{topics.length}</strong><label>Topic directories</label></Card>
            <Card><span>◇</span><strong>{admin?adminData.stats?.open_tickets||0:data.myTickets.filter(t=>t.status==='open').length}</strong><label>Open support tickets</label></Card>
          </div>
          <div className="v6-columns"><Card><div className="v6-section-title"><h2>Topic directory</h2><span>Explore YAJE</span></div><div className="v6-topic-list">{featured.map(t=><a href={t.url} target="_blank" rel="noreferrer" key={t.id}><span>⌁</span><div><strong>{t.title}</strong><small>{t.description||'Telegram discussion topic'}</small></div><b>↗</b></a>)}{!featured.length&&<Empty>No topics registered yet.</Empty>}</div></Card>
            <Card><div className="v6-section-title"><h2>Quick start</h2></div><div className="v6-checks"><div><i>{data.rulesAccepted?'✓':'1'}</i><p><strong>Review community rules</strong><small>{data.rulesAccepted?'Acknowledged':'Open Member Hub to acknowledge'}</small></p></div><div><i>2</i><p><strong>Search the file library</strong><small>Find approved files & helpful notes</small></p></div><div><i>3</i><p><strong>Need help?</strong><small>Open a support ticket for moderators</small></p></div></div>{button('Open Member Hub',()=>setTab('member'),'secondary')}</Card></div>
        </>}
        {tab==='search'&&<>
          <div className="v6-page-heading"><div className="v6-eyebrow">SMART DISCOVERY</div><h1>Find files across Telegram.</h1><p>Search this group or every connected group you belong to. Multi-group results stay private to verified source-group members.</p></div>
          <Card className="v6-scope-card">
            <div className="v6-section-title"><h2>Search scope</h2><Tag>Verified group access</Tag></div>
            <div className="v6-scope-selector">
              <button type="button" className={searchScope==='current'?'v6-btn primary':'v6-btn secondary'} onClick={()=>{setSearchScope('current');setSearchResults(null);}}>📁 This group</button>
              <button type="button" className={searchScope==='all'?'v6-btn primary':'v6-btn secondary'} onClick={()=>{setSearchScope('all');setSearchResults(null);}}>🌐 All Connected Groups</button>
            </div>
            {searchScope==='all'&&<p className="v6-secondary">Only approved files from groups where YAJETZY has admin access, the group admin enabled /filehub on, and your Telegram membership is verified. External private files open in their ORIGINAL group—they aren't copied into unrelated chats.</p>}
          </Card>

          {searchScope==='current'&&<Card className="v6-topic-picker">
            <div className="v6-section-title"><h2>📥 Send approved files to Telegram</h2><Tag tone="ok">Connected to {data.group.title}</Tag></div>
            <div className="v6-row-picker">
              <label htmlFor="v6-send-topic">Choose destination topic</label>
              <select id="v6-send-topic" className="v6-select" value={sendTopic} onChange={e=>setSendTopic(e.target.value)}>
                {topics.filter(t=>t.listed).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <p className="v6-secondary">Select a result and tap “Send to topic.” YAJETZY will copy the reviewed Telegram message into that discussion. One file per member every 30 seconds.</p>
          </Card>}
          <div className="v6-search"><span>⌕</span><input placeholder="Search tutorials, screen recorder, guide…" value={search} onChange={e=>{setSearch(e.target.value);if(searchScope==='all')setSearchResults(null);}} /></div>
          {searchScope==='all'&&<div className="v6-federated-action">
            {button(allSearchBusy?'Searching…':'🔎 Search Connected Groups',searchConnectedGroups,'primary',allSearchBusy||search.trim().length<2)}
            <span>Search across connected groups on demand. Minimum 8 seconds between queries.</span>
          </div>}
          {search.length<2?<Card><Empty>Type at least two letters to search your community's resources.</Empty></Card>:
          searchScope==='all'&&!searchResults?<Card><Empty>Tap “Search Connected Groups” to find reviewed files across groups you're a member of.</Empty></Card>:
          <div className="v6-columns"><Card><div className="v6-section-title"><h2>Matching files</h2><span>{searchResults?.files?.length||0} results</span></div>
            {searchResults?.files?.map(f=><FileRow key={(f.sourceChatId||groupId)+':'+f.id} file={f} admin={searchScope==='current'&&admin} onReview={adminReview} onSend={searchScope==='current'?sendFile:undefined} busy={busy}/>)}
            {!searchResults?.files?.length&&<Empty>{searchResults?.errorMessage||'No reviewed files found in your accessible groups. Ask a source group admin to enable /filehub on and review uploads.'}</Empty>}
          </Card>
          {searchScope==='current'?<Card><div className="v6-section-title"><h2>Matching notes</h2><span>{searchResults?.notes?.length||0} results</span></div>{searchResults?.notes?.map(n=><div className="v6-note" key={n.slug}><b>#{n.slug}</b><p>{n.content}</p></div>)}{!searchResults?.notes?.length&&<Empty>No matching notes yet.</Empty>}</Card>
          :<Card><div className="v6-section-title"><h2>Verified connected groups</h2><span>{searchResults?.groups?.length||0}</span></div>
            {searchResults?.groups?.map(g=><div key={g.id} className="v6-setting"><div><strong>{g.name}</strong><small>Telegram membership verified</small></div><Tag tone="ok">Connected</Tag></div>)}
            {!searchResults?.groups?.length&&<Empty>No authorized file-sharing groups connected yet.</Empty>}
            <p className="v6-secondary">Bot cannot automatically join your Telegram groups or retrieve old message history. Group admins must add YAJETZY, enable file sharing and approve files. Private posts are only opened in their source groups.</p>
          </Card>}
          </div>}
        </>}
        {tab==='library'&&<>
          <div className="v6-page-heading"><div className="v6-eyebrow">CURATED RESOURCE HUB</div><h1>Smart File Center</h1><p>Community uploads are indexed automatically in enabled topics. Admin review is required before a download link becomes available here.</p></div>
          {admin&&<div className="v6-inline"><Tag tone="warn">Pending reviews: {adminData.stats?.pending_files||0}</Tag><span>Open each source and check authenticity before approving.</span></div>}
          <Card><div className="v6-section-title"><h2>Destination discussion</h2></div><select className="v6-select" value={sendTopic} onChange={e=>setSendTopic(e.target.value)} aria-label="Choose Telegram topic to send files">{topics.filter(t=>t.listed).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select><p className="v6-secondary">Use 📥 Send to topic only for reviewed, permitted files.</p></Card>
          <Card><div className="v6-section-title"><h2>Files</h2><span>{data.files.length} items</span></div>{[...data.files].sort((a,b)=>(a.reviewStatus==='pending'?0:1)-(b.reviewStatus==='pending'?0:1)).map(f=><FileRow file={f} key={f.id} admin={admin} onReview={adminReview} onSend={sendFile} busy={busy}/>)}{!data.files.length&&<Empty>No indexed files yet. Forward reviewed documents into a file-indexing topic or use the admin bulk link importer.</Empty>}</Card>
          {admin&&<Card><div className="v6-section-title"><h2>Bulk import Telegram post links</h2><Tag>Admin only</Tag></div><p className="v6-secondary">Paste up to 30 links, one per line. Each must have its original Telegram message URL and a filename. Links start as pending until reviewed.</p><textarea rows="5" className="v6-textarea" placeholder={'https://t.me/c/4476272910/4/555 | YAJE-Guide.pdf\nhttps://t.me/c/4476272910/7/557 | Example.apk'} value={bulkText} onChange={e=>setBulkText(e.target.value)} />{button(busy?'Saving…':'Import links',()=>change({action:'import_links',entries:bulkText},()=>setBulkText('')),'primary',busy)}</Card>}
        </>}
        
        {tab==='how'&&<>
          <div className="v6-page-heading"><div className="v6-eyebrow">PERSONAL TECH ASSISTANT</div><h1>Ask YAJETZY AI</h1><p>Ask technology questions in Taglish or English. Responses appear privately in this Mini App, not in the Telegram discussion.</p></div>
          <Card className="v6-ai-panel">
            <div className="v6-section-title"><h2>✧ Technology help</h2><Tag tone="ok">Member of {data.group.title}</Tag></div>
            <p className="v6-secondary">Topics: Android troubleshooting, device safety, app compatibility, tutorials, and general technology. If AI isn't configured, YAJETZY provides basic guidance instead.</p>
            {!howHistory.length&&<div className="v6-ai-examples">
              {['What is Android rooting and its risks?','What should I check after a bootloop?','How do I verify an app source?'].map(q=><button type="button" key={q} onClick={()=>setHowQuestion(q)}>{q} ↗</button>)}
            </div>}
            <div className="v6-ai-history">
              {howHistory.map(item=><div className="v6-ai-exchange" key={item.key}>
                <div className="v6-ai-bubble user"><strong>You</strong><p>{item.question}</p></div>
                <div className={'v6-ai-bubble bot '+(item.mode==='error'?'error':'')}><strong>✧ YAJETZY {item.mode==='basic'?'Basic Help':item.mode==='ai'?'AI':''}</strong>
                  <p>{item.mode==='loading'?'Preparing an answer…':item.answer}</p></div>
              </div>)}
            </div>
            <form className="v6-ai-compose" onSubmit={e=>{e.preventDefault();askInApp();}}>
              <label htmlFor="v6-how-question">Your question</label>
              <textarea id="v6-how-question" className="v6-textarea" rows="3" maxLength={500} value={howQuestion} onChange={e=>setHowQuestion(e.target.value)} placeholder="How can I safely troubleshoot my Android phone?" />
              <div className="v6-ai-compose-bottom"><span>{howQuestion.length}/500 · Maximum 15 questions per day</span><button type="submit" className="v6-btn primary" disabled={howBusy||howQuestion.trim().length<5}>{howBusy?'Answering…':'Ask YAJETZY →'}</button></div>
            </form>
            <p className="v6-secondary">Do not share passwords or private information. If AI is connected, questions are sent to the configured AI provider; answers can be mistaken. Device-specific steps should be checked against official documentation.</p>
          </Card>
        </>}
{tab==='member'&&<>
          <div className="v6-page-heading"><div className="v6-eyebrow">YOUR COMMUNITY</div><h1>Member Hub</h1><p>Everything you need to get started and receive support.</p></div>
          <div className="v6-columns">
            <Card><div className="v6-section-title"><h2>Community rules</h2><Tag tone={data.rulesAccepted?'ok':'warn'}>{data.rulesAccepted?'Read & acknowledged':'Please review'}</Tag></div><p className="v6-rules">{data.group.rules}</p>{!data.rulesAccepted&&button('I have read the rules',()=>change({action:'rules_ack'}),'primary',busy)}</Card>
            <Card><div className="v6-section-title"><h2>Ask for support</h2><span>Private to moderators</span></div><textarea className="v6-textarea" rows="4" placeholder="Describe the issue or question…" value={ticketText} onChange={e=>setTicketText(e.target.value)} />{button('Submit ticket',()=>change({action:'ticket_create',message:ticketText},()=>setTicketText('')),'primary',busy||ticketText.trim().length<5)}</Card>
            <Card><div className="v6-section-title"><h2>Your support tickets</h2></div>{data.myTickets.map(t=><div className="v6-ticket" key={t.id}><div><strong>#{t.id}</strong><Tag tone={t.status==='closed'?'neutral':'warn'}>{t.status}</Tag></div><p>{t.message}</p>{t.admin_reply&&<blockquote>{t.admin_reply}</blockquote>}</div>)}{!data.myTickets.length&&<Empty>No support requests yet.</Empty>}</Card>
            <Card><div className="v6-section-title"><h2>Report a concern</h2><span>Moderator review only</span></div><p className="v6-secondary">Use for spam, harassment or community safety. Reports are not automatic bans.</p><input className="v6-input" placeholder="Telegram user ID (optional)" value={reportUser} onChange={e=>setReportUser(e.target.value)} /><input className="v6-input" placeholder="Original message ID (optional)" value={reportMessage} onChange={e=>setReportMessage(e.target.value)} /><textarea className="v6-textarea" rows="3" placeholder="Explain what happened…" value={reportReason} onChange={e=>setReportReason(e.target.value)}/>{button('Submit confidential report',()=>change({action:'report_create',reason:reportReason,targetUserId:reportUser,messageId:reportMessage},()=>{setReportReason('');setReportUser('');setReportMessage('');}),'secondary',busy||reportReason.trim().length<3)}</Card>
          </div>
        </>}
        {tab==='admin'&&admin&&<>
          <div className="v6-page-heading"><div className="v6-eyebrow">MANAGEMENT ACCESS</div><h1>Admin Console</h1><p>Review files, moderation reports, support requests, and topic settings. Telegram permissions are verified for each action.</p></div>
          <div className="v6-stats"><Card><span>▣</span><strong>{adminData.stats?.pending_files||0}</strong><label>Files to review</label></Card><Card><span>⚑</span><strong>{adminData.stats?.reports||0}</strong><label>Pending reports</label></Card><Card><span>◈</span><strong>{adminData.stats?.open_tickets||0}</strong><label>Open tickets</label></Card><Card><span>▤</span><strong>{adminData.stats?.actions_7d||0}</strong><label>Actions / 7 days</label></Card></div>
          <div className="v6-columns">
            <Card><div className="v6-section-title"><h2>🛡️ Security Shield</h2><Tag tone={adminData.security?.security_shield_enabled?'ok':'warn'}>{adminData.security?.security_shield_enabled?'ACTIVE':'OFF'}</Tag></div>
              <p className="v6-secondary">Automatically remove high-confidence spam, block unauthorized bots joining, and escalate repeated violations. Admins are exempt. Uploaded media itself is not scanned.</p>
              {securityOptions.map(([key,label])=><div className="v6-setting" key={key}>
                <div><strong>{label}</strong></div>
                <label><input type="checkbox" checked={adminData.security?.[key]===true} onChange={e=>change({action:'security_toggle',field:key,enabled:e.target.checked})} disabled={busy}/>{adminData.security?.[key]?'ON':'OFF'}</label>
              </div>)}
              <div className="v6-section-title v6-top-gap"><h2>Recent security actions</h2></div>
              {adminData.securityEvents?.map((e,i)=><div className="v6-log" key={i}><span>{e.reason.replaceAll('_',' ')} · {e.action} <small>#{e.user_id}</small></span><small>{fmt(e.created_at)}</small></div>)}
              {!adminData.securityEvents?.length&&<Empty>No security incidents recorded yet.</Empty>}
              <p className="v6-secondary">Required Telegram permissions: Delete Messages and Ban Users/Restrict Members.</p>
            </Card>
            <Card><div className="v6-section-title"><h2>Moderation queue</h2><Tag tone="warn">{adminData.reports?.filter(r=>r.status==='pending').length||0} pending</Tag></div>{adminData.reports?.map(r=><div className="v6-ticket" key={r.id}><div><strong>Report #{r.id}</strong><Tag tone={r.status==='pending'?'warn':'neutral'}>{r.status}</Tag></div><small>Reporter {r.reporter_id} · Target {r.targetUserId||'unassigned'} · {fmt(r.created_at)}</small><p>{r.reason}</p>{r.status==='pending'&&<div className="v6-action-row">{button('Mark reviewed',()=>change({action:'report_review',id:r.id,status:'reviewed'}),'primary',busy)}{button('Dismiss',()=>change({action:'report_review',id:r.id,status:'dismissed'}),'secondary',busy)}</div>}</div>)}{!adminData.reports?.length&&<Empty>No moderation reports.</Empty>}</Card>
            <Card><div className="v6-section-title"><h2>Support queue</h2></div>{adminData.tickets?.map(t=><div className="v6-ticket" key={t.id}><div><strong>Ticket #{t.id}</strong><Tag tone={t.status==='closed'?'neutral':'warn'}>{t.status}</Tag></div><small>User {t.userId} · {fmt(t.updated_at)}</small><p>{t.message}</p>{t.admin_reply&&<blockquote>{t.admin_reply}</blockquote>}{t.status!=='closed'&&<><textarea rows="2" className="v6-textarea" placeholder="Write a moderator reply" value={answers[t.id]||''} onChange={e=>setAnswers(x=>({...x,[t.id]:e.target.value}))}/><div className="v6-action-row">{button('Reply',()=>change({action:'ticket_answer',id:t.id,answer:answers[t.id]||''}), 'primary',busy||!(answers[t.id]||'').trim())}{button('Close',()=>change({action:'ticket_answer',id:t.id,close:true}), 'secondary',busy)}</div></>}</div>)}{!adminData.tickets?.length&&<Empty>No support tickets.</Empty>}</Card>
            <Card><div className="v6-section-title"><h2>Topic controls</h2><span>File indexing & directory</span></div>{topics.map(t=><div className="v6-setting" key={t.id}><div><strong>{t.title}</strong><small>Topic #{t.id}</small></div><label><input type="checkbox" checked={t.listed} onChange={e=>change({action:'topic_update',threadId:t.id,field:'listed',enabled:e.target.checked})} disabled={busy}/> Menu</label><label><input type="checkbox" checked={t.file_index_enabled} onChange={e=>change({action:'topic_update',threadId:t.id,field:'file_index_enabled',enabled:e.target.checked})} disabled={busy}/> Index</label></div>)}<p className="v6-secondary">Refresh the pinned General menu via Telegram /panel after changing visibility.</p></Card>
            <Card><div className="v6-section-title"><h2>Announcement</h2></div><p className="v6-secondary">Send an announcement to the selected group. The message is not scheduled.</p><textarea className="v6-textarea" rows="4" placeholder="Announcement text…" value={announce} onChange={e=>setAnnounce(e.target.value)} />{button('Post to group',()=>{if(window.confirm('Post this announcement to the Telegram group?'))change({action:'announce',message:announce,confirm:true},()=>setAnnounce(''));},'primary',busy||announce.trim().length<5)}<div className="v6-section-title v6-top-gap"><h2>Recent actions</h2></div>{adminData.logs?.map((l,i)=><div className="v6-log" key={i}><span>{l.action}</span><small>{fmt(l.created_at)}</small></div>)}</Card>
          </div>
        </>}
      </div>}
      <footer className="v6-footer"><span>YAJETZY V7 · Secure Telegram community platform</span><a href={host}>Open bot ↗</a></footer>
    </main>
  </div>;
}
