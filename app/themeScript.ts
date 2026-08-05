// The theme's two constants and the script that applies it, kept apart from
// app/theme.ts because that file is a client module (it has hooks) and the
// root layout — a server component — needs the script string. A server
// component can't reach into a "use client" module for a plain value; every
// export it sees there is a client reference.

export const THEME_STORAGE_KEY = "cb-theme-v1";
export const THEME_CHANGED_EVENT = "cb-theme-changed";

// The two colours the browser chrome takes — the address bar on Android, the
// status bar area on an installed iOS app. They're the page ground in each
// theme, and they're literals rather than var(--cb-cream) because a <meta>
// tag can't resolve a custom property; the value has to be a colour.
export const CHROME_LIGHT = "#f7f4eb";
export const CHROME_DARK = "#1f241c";

// Runs in <head>, before anything paints.
//
// This has to be a blocking inline script and not a React effect. An effect
// runs after the first paint, which means a visitor who chose dark gets one
// frame of cream — the white flash every themed site with a toggle has had at
// some point. Stamping the attribute here means the very first paint is
// already in the right theme.
//
// It also owns the system-change listener, so a phone flipping to dark at
// sunset carries the page with it whether or not React has hydrated, and it
// is the only thing that ever writes data-theme: app/theme.ts sets the
// preference and fires the event, and this decides what that means.
//
// Kept deliberately small and dependency-free — it's inlined into every
// document — and wrapped in try/catch because Safari's private browsing
// throws on a localStorage read and a throw here happens before there is an
// app to catch it.
export const THEME_SCRIPT = `(function(){try{
var r=document.documentElement,K=${JSON.stringify(THEME_STORAGE_KEY)};
var mq=window.matchMedia("(prefers-color-scheme: dark)");
function read(){try{var v=localStorage.getItem(K);return v==="light"||v==="dark"?v:"system"}catch(e){return "system"}}
function apply(){
var p=read(),t=p==="system"?(mq.matches?"dark":"light"):p;
r.setAttribute("data-theme",t);
var m=document.querySelector('meta[name="theme-color"]');
if(m)m.setAttribute("content",t==="dark"?${JSON.stringify(CHROME_DARK)}:${JSON.stringify(CHROME_LIGHT)});
}
apply();
mq.addEventListener("change",apply);
window.addEventListener(${JSON.stringify(THEME_CHANGED_EVENT)},apply);
}catch(e){}})();`;
