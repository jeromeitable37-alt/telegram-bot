import Script from 'next/script';
export const metadata={
  title:'YAJETZY V6 | Telegram Community Control Center',
  description:'YAJE file library, member support, moderation review and secure community hub'
};
export default function MiniLayout({children}){
  return <>
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
    {children}
  </>;
}
