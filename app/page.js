
const modules=[
  {icon:'📁',title:'Smart File Center',body:'Organized Telegram posts with searchable filenames, link imports and admin approval.'},
  {icon:'🔎',title:'Smart Search',body:'Search matching notes, filenames and community resources—even with partial text.'},
  {icon:'🛡️',title:'Moderation Center',body:'Member reports, review history, warning tools and administrator-controlled actions.'},
  {icon:'🎟️',title:'Member Hub',body:'Community rules, onboarding acknowledgements and support tickets.'},
  {icon:'📊',title:'Admin Console',body:'Review queue, moderation activity, topic management and announcements.'},
  {icon:'🔐',title:'Telegram-verified access',body:'Signed Mini App identity and current Telegram group permissions; no separate account needed.'}
];
export const metadata={title:'YAJETZY V6 – YAJE Community OS',description:'Telegram Mini App, smart file library and moderation tools'};
export default function Home(){
  return <main style={{fontFamily:'Inter,system-ui,sans-serif',background:'radial-gradient(circle at 80% 4%,#174956,#091422 52%)',color:'#e4f5ff',minHeight:'100vh',padding:'60px 20px'}}>
    <div style={{maxWidth:1000,margin:'auto'}}>
      <div style={{letterSpacing:'3px',fontSize:12,color:'#59e6c1',fontWeight:800}}>YAJETZY · V6 COMMUNITY OS</div>
      <h1 style={{fontSize:'clamp(38px,7vw,65px)',letterSpacing:'-3px',margin:'17px 0 12px'}}>Manage together.<br/><span style={{color:'#51e4bd'}}>Find anything.</span></h1>
      <p style={{fontSize:16,lineHeight:1.75,color:'#bed1df',maxWidth:630}}>The secure community hub for YAJE Discussions. Find approved Telegram files, ask for support, and review community activity—all from one Mini App.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'28px 0 42px'}}>
        <a href="https://t.me/yaje37_bot?start=v6" style={{background:'#54e0bb',color:'#0a2a2d',padding:'13px 19px',fontWeight:800,textDecoration:'none',borderRadius:11}}>🚀 Open in Telegram</a>
        <a href="/mini" style={{background:'#23394f',color:'#eaf5fc',padding:'13px 19px',fontWeight:700,textDecoration:'none',borderRadius:11,border:'1px solid #38526a'}}>View Mini App</a>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:15}}>
        {modules.map(m=><article key={m.title} style={{border:'1px solid #29435b',background:'#101f31',borderRadius:16,padding:23}}>
          <div style={{fontSize:24}}>{m.icon}</div><h2 style={{fontSize:17}}>{m.title}</h2><p style={{fontSize:13,color:'#adc1d0',lineHeight:1.65}}>{m.body}</p>
        </article>)}
      </div>
      <div style={{padding:'24px 0',color:'#809bb2',fontSize:12}}>Sign-in requires opening YAJETZY inside Telegram. The system cannot import historical Telegram files without existing message links or forwarded posts.</div>
    </div>
  </main>;
}
