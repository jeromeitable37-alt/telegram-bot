'use client';

import { useState } from 'react';

const bg='#0c1523', surface='#18283b', border='#304359', fg='#eaf3fc', muted='#aebed2', accent='#62b9f7';
export default function SetupPage() {
  const [secret,setSecret]=useState('');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState(null);
  const [error,setError]=useState('');
  async function run(method) {
    if (!secret.trim() || busy) return;
    setBusy(true);
    setError('');
    setStatus(null);
    try {
      const response=await fetch('/api/setup/webhook',{
        method,
        headers:{Authorization:'Bearer '+secret.trim()},
        cache:'no-store'
      });
      const data=await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Setup request failed.');
      setStatus(data);
    } catch(err) {
      setError(err.message || 'Connection failed.');
    } finally {
      setBusy(false);
    }
  }
  return <main style={{background:bg,color:fg,minHeight:'100vh',padding:'50px 18px'}}>
    <div style={{maxWidth:640,margin:'auto'}}>
      <p style={{color:accent,letterSpacing:2,fontSize:13,fontWeight:800}}>TELEGRAM MULTI-GROUP MANAGER</p>
      <h1 style={{fontSize:'clamp(28px,5vw,40px)',lineHeight:1.2,margin:'12px 0'}}>Activate your Telegram bot</h1>
      <p style={{color:muted,lineHeight:1.7}}>This page registers the production Telegram webhook using the bot token already saved in your Vercel environment. Do not paste your BotFather token here.</p>
      <section style={{border:'1px solid '+border,background:surface,borderRadius:18,padding:24,marginTop:28}}>
        <label htmlFor="secret" style={{display:'block',fontWeight:700,marginBottom:9}}>Vercel CRON_SECRET</label>
        <input id="secret" type="password" autoComplete="off" spellCheck={false} value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Enter CRON_SECRET privately"
          style={{boxSizing:'border-box',background:bg,color:fg,padding:14,border:'1px solid '+border,borderRadius:10,fontSize:16,width:'100%'}}/>
        <p style={{fontSize:13,color:muted,lineHeight:1.6}}>Use the same CRON_SECRET you saved in Vercel Production. This secret is only sent to your own website over HTTPS, and is not stored in browser storage.</p>
        <div style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:18}}>
          <button disabled={!secret.trim()||busy} onClick={()=>run('GET')} style={{padding:'13px 20px',borderRadius:10,border:'1px solid '+border,color:fg,background:'#30465e',fontWeight:700,cursor:'pointer'}}>Check status</button>
          <button disabled={!secret.trim()||busy} onClick={()=>run('POST')} style={{padding:'13px 20px',borderRadius:10,border:0,background:accent,color:'#05172a',fontWeight:800,cursor:'pointer'}}>{busy?'Connecting...':'Activate webhook'}</button>
        </div>
        {error&&<p role="alert" style={{padding:15,color:'#ffc4c4',background:'#5a2835',borderRadius:10,marginTop:18}}>{error}</p>}
        {status&&<div role="status" style={{padding:16,background:'#183b36',borderRadius:10,marginTop:18,lineHeight:1.8}}>
          <strong>{status.active?'✅ Telegram webhook is active':'⚠️ Webhook not active for this domain'}</strong>
          <div>Bot: @{status.bot?.username||'unknown'}</div>
          <div style={{overflowWrap:'anywhere'}}>Webhook URL: {status.webhookUrl||'Not registered'}</div>
          <div>Pending Telegram updates: {status.pendingUpdates}</div>
          {status.lastError&&<p style={{color:'#ffd0d0',overflowWrap:'anywhere'}}>Telegram last error: {status.lastError}</p>}
        </div>}
      </section>
      <section style={{lineHeight:1.85,marginTop:30,color:muted}}>
        <h2 style={{color:fg,fontSize:21}}>After activation</h2>
        <p>1. Open <a href="https://t.me/yaje37_bot" style={{color:accent}}>@yaje37_bot</a> and send <code>/start</code>.</p>
        <p>2. Add the bot as administrator to every Telegram group you want managed.</p>
        <p>3. Test <code>/id</code>, <code>/help</code>, and <code>/panel</code> inside each group. Anti-links and anti-flood remain OFF until enabled.</p>
        <p style={{fontSize:13}}>Never send your token or setup secret to ChatGPT or commit them to GitHub.</p>
      </section>
    </div>
  </main>;
}
