export function validWelcomeThreadId(value) {
  const id=Number(value);
  return Number.isSafeInteger(id)&&id>1?id:null;
}
export function welcomeDeliveryOptions(groupId,recipientId,settings={}) {
  const options={};
  const topic=validWelcomeThreadId(settings.welcome_thread_id);
  if(String(groupId)===String(recipientId)&&topic) options.message_thread_id=topic;
  return options;
}
export function shouldClearJoinEvent(settings={},message={}) {
  return Boolean(settings.welcome_thread_id && settings.welcome_clear_join_event!==false &&
    Number.isSafeInteger(Number(message.message_id)) && Number(message.message_id)>0 &&
    message.chat?.id && Array.isArray(message.new_chat_members) && message.new_chat_members.length>0);
}
export function welcomeTopicLabel(settings={}) {
  const id=validWelcomeThreadId(settings.welcome_thread_id);
  return id ? 'Topic #'+id : 'Not configured (General)';
}
