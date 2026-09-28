import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiinX - 数字分身 Agent 平台",
  description: "创建你的数字分身，或用一句话找到你想认识的人。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("eido-theme");if(t!=="dark")t="light";localStorage.setItem("eido-theme",t);document.documentElement.dataset.theme=t;var b=localStorage.getItem("eido-chat-background");if(b)document.documentElement.style.setProperty("--chat-background-image",'url("'+b+'")');var n=Number(localStorage.getItem("eido-chat-background-blur"));if(!Number.isFinite(n))n=0;n=Math.min(24,Math.max(0,Math.round(n)));document.documentElement.style.setProperty("--chat-background-blur",n+"px");}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
