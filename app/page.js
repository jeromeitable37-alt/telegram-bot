const features = [
  ['🛡️', 'Moderation', 'Link protection, flood controls, warnings, mute and ban'],
  ['👋', 'Welcome messages', 'Custom messages and group rules'],
  ['✅', 'Join request queue', 'Admin approval and denial buttons'],
  ['📣', 'Announcements', 'Immediate posts and daily Manila-time reminders'],
  ['📊', 'Group settings', 'Independent controls for every Telegram group']
];
export default function Home() {
  return <main style={{maxWidth:880,margin:'0 auto',padding:'56px 24px'}}>
    <p style={{color:'#7cc7f9',fontWeight:700,letterSpacing:2,fontSize:13}}>TELEGRAM AUTOMATION</p>
    <h1 style={{fontSize:'clamp(2rem,6vw,3.3rem)',margin:'12px 0'}}>Multi-Group Manager</h1>
    <p style={{color:'#adbed1',fontSize:18,lineHeight:1.6}}>A bot-first management system for multiple Telegram groups. Manage everything with admin commands inside Telegram.</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(235px,1fr))',gap:14,marginTop:30}}>
      {features.map(([icon,title,subtitle])=><div key={title} style={{background:'#182436',border:'1px solid #304259',borderRadius:14,padding:20}}>
        <div style={{fontSize:26}}>{icon}</div><h2 style={{fontSize:18}}>{title}</h2><p style={{color:'#b9c8d8',lineHeight:1.5}}>{subtitle}</p>
      </div>)}
    </div>
    <div style={{marginTop:30,background:'#162a33',padding:20,borderRadius:12}}>
      <strong>Secure by design:</strong> Admin commands check actual Telegram group administrator status. No private chat histories are exposed on this website.
    </div>
    <p style={{color:'#91a4bd',marginTop:30}}>Health endpoint: /api/health · Telegram webhook: /api/telegram · Daily job: /api/cron/daily</p>
  </main>;
}
