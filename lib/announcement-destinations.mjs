export function validAnnouncementThread(value){
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>1?n:null;
}
export function announcementTargets(thread){
  const targets=[{label:'General',extra:{}}];
  const id=validAnnouncementThread(thread);
  if(id)targets.push({label:'Announcements',extra:{message_thread_id:id}});
  return targets;
}
export function announcementDestinationLabel(thread){
  const id=validAnnouncementThread(thread);
  return id?'General + Announcements (topic '+id+')':'General only (configure with /announcetopic here)';
}
