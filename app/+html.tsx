import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        {/* Safari Smart App Banner: "Open"/"Get" the RallyHUB app on every web page. */}
        <meta name="apple-itunes-app" content="app-id=6762097230" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>
        {/* Shown instantly while the app and its fonts download (the app renders
            nothing until then, which looked like a blank page). Removed by the
            root layout once fonts are loaded. */}
        <div id="rally-boot" dangerouslySetInnerHTML={{ __html: bootSplash }} />
        {children}
      </body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #F4F6F8;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #1E3A5F;
  }
}`;

const bootSplash = `
<style>
#rally-boot{position:fixed;inset:0;z-index:9999;background:#1E3A5F;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
#rally-boot .w{color:#fff;font-weight:800;font-size:30px;letter-spacing:-0.5px}
#rally-boot .w span{color:rgba(255,255,255,0.55);font-weight:600}
#rally-boot .d{width:28px;height:28px;border-radius:50%;border:3px solid rgba(255,255,255,0.2);border-top-color:#FF7A59;animation:rb 0.8s linear infinite}
@keyframes rb{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){#rally-boot .d{animation:none}}
</style>
<div class="w">Rally<span>HUB</span></div>
<div class="d" role="progressbar" aria-label="Loading"></div>`;
