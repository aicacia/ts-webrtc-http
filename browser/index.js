import{bytesToInteger as e,integerToBytes as t}from"https://unpkg.com/@aicacia/hash@0/browser/index.js";import{MAX_INT as n}from"https://unpkg.com/@aicacia/rand@0/browser/index.js";const r=4096;function a(e,t){const n=new Uint8Array(e.byteLength+t.byteLength);return n.set(e),n.set(t,e.byteLength),n}function o(e,t,n){if(n.byteLength>=e.byteLength-t){const r=new Uint8Array(2*e.byteLength);return r.set(e),r.set(n,t),r}return e.set(n,t),e}function i(){return Math.random()*n|0}function s(e,t,n){return new WritableStream({write(r){!function(e,t,n){if(t.byteLength<n)e.send(t);else{let r=0;for(;r<t.byteLength;){const a=Math.min(n,t.byteLength-r);e.send(t.slice(r,r+a)),r+=a}}}(e,a(t,r),n)}})}function c(e,t=r){const n=new Uint8Array(t);let a=0;const o=e.getWriter();async function i(){a>0&&(await o.write(n.slice(0,a)),a=0)}return new WritableStream({write:async function(e){e.byteLength>n.byteLength-a&&await i(),e.byteLength>=n.byteLength?await o.write(e):(n.set(e,a),a+=e.byteLength)},async close(){await i(),await o.close()}})}const w=/^([^: \t]+):[ \t]*((?:.*[^ \t])|)/,d=/^[ \t]+(.*[^ \t])/,u=/^([A-Z-]+) ([^ ]+) HTTP\/(\d)\.(\d)$/,f=/^HTTP\/(\d)\.(\d) (\d{3}) ?(.*)$/,l="\n".charCodeAt(0),y="\r".charCodeAt(0),h=new TextEncoder,b=new TextDecoder;class g extends Request{constructor(e,t){const n=t?.headers;if(super(e,t),n){const e=new Headers(n);Object.defineProperty(this,"headers",{value:e,writable:!1})}}}async function L(e){const t=k(e),[n,r]=await async function(e){const{done:t,value:n}=await e.readLine();if(t)throw new Error("Unexpected end of request");const r=u.exec(n);if(!r)throw new Error(`Invalid request line: ${n}`);return[r[1],r[2],+r[3],+r[4]]}(t),[a,o,i]=await v(t),s=x(t,o,i);return new g(r,{method:n,headers:a,body:s,mode:"same-origin",credentials:"include",duplex:"half"})}async function m(e){const t=k(e),[n,r]=await async function(e){const{done:t,value:n}=await e.readLine();if(t)throw new Error("Unexpected end of request");const r=f.exec(n);if(!r)throw new Error(`Invalid response line: ${n}`);return[+r[3],r[4],+r[1],+r[2]]}(t),[a,o,i]=await v(t),s=x(t,o,i);return new Response(s,{status:n,statusText:r,headers:a})}async function p(e,t){const n=e.getWriter(),[r,o]=t instanceof Request?[t,null]:[null,t];r?await n.write(h.encode(`${r.method} ${r.url} HTTP/1.1\r\n`)):await n.write(h.encode(`HTTP/1.1 ${o.status} ${o.statusText}\r\n`));const i=t.headers;let s=0,c=!1;t.body&&(s=Number.parseInt(i.get("Content-Length")||"0",10),c="chunked"===i.get("Transfer-Encoding")?.toLowerCase());for(const[e,t]of i.entries())await n.write(h.encode(`${e}: ${t}\r\n`));if(t.body)if(r){const r=await async function(e){try{const{done:t,value:n}=await e.read();if(t)return new Uint8Array;let r=n;for(;;){const{done:t,value:n}=await e.read();if(t)break;r=a(r,n)}return r}finally{e.releaseLock()}}(t.body.getReader());await n.write(h.encode(`Content-Length: ${r.byteLength}\r\n\r\n`)),await n.write(r),n.releaseLock(),e.close()}else await n.write(h.encode("\r\n")),n.releaseLock(),await(x(k(t.body.getReader()),c,s)?.pipeTo(e));else await n.write(h.encode("\r\n")),n.releaseLock(),e.close()}async function v(e){const t=new Headers;let n=!1,r=0;for(;;){const{done:a,value:o}=await e.readLine();if(a)throw new Error("Unexpected end of headers");if(""===o)break;const i=w.exec(o);if(!i)throw new Error(`Invalid header line: ${o}`);let s=i[2];for(;;){const e=d.exec(s);if(!e)break;s=e[1]}const c=i[1].toLowerCase();"transfer-encoding"===c&&"chunked"===s.toLowerCase()?n=!0:"content-length"===c&&(r=+s),t.append(i[1],s)}return[t,n,r]}function x(e,t,n){if(!t&&0===n)return null;const r=new TransformStream;return async function(e,t,n,r){const a=t.getWriter();try{if(n)for(;;){const{done:t,value:n}=await e.readLine();if(t)throw new Error("Unexpected end of stream");if(w.exec(n)){await e.readLine();break}const r=Number.parseInt(n,16);if(!r)break;let o=r;for(;o>0;){const{done:t,value:n}=await e.read(r);if(t)throw new Error("Unexpected end of stream");o-=n.byteLength,await a.write(n)}await e.readLine()}else{let t=r;for(;t>0;){const{done:n,value:r}=await e.read(t);if(n)throw new Error("Unexpected end of stream");t-=r.byteLength,await a.write(r)}}}finally{e.releaseLock(),a.releaseLock(),t.close()}}(e,r.writable,t,n),r.readable}function k(e,t=r){let n=new Uint8Array(t),a=0,i=0,s=!1;async function c(t){if(s)return t<i;for(;t>i;){const{done:t,value:r}=await e.read();if(t){s=!0;break}n=o(n,i,r),i+=r.byteLength}return t<i}return{readLine:async function(){let e=a,t=!0;for(;t;){if(n[e]===y&&n[e+1]===l){const t=b.decode(n.slice(a,e));return a=e+2,{done:!1,value:t}}e++,e>=i&&(t=await c(e))}return{done:!0}},read:async function(e){const t=a+e;await c(t);const r=Math.min(i-a,e);if(0===r)return{done:!0};const o=n.slice(a,a+r);return a+=r,{done:!1,value:o}},releaseLock:function(){e.releaseLock()}}}function T(n){const r=new Map;async function a(t){const n=new Uint8Array(t.data),a=e(n);await async function(e,t){const n=r.get(e);if(!n)throw new Error(`No connection found for id: ${e}`);await n.writer.write(t)}(a,n.slice(4))}n.addEventListener("message",a);const o=(e,a)=>new Promise(((o,w)=>{const d=new g(e,a),u=function(){let e=i();for(;r.has(e);)e=i();const n=t(new Uint8Array(4),e),a=new TransformStream,o={idBytes:n,stream:a,writer:a.writable.getWriter()};return r.set(e,o),o}();p(c(s(n,u.idBytes,16384)),d).then((()=>m(u.stream.readable.getReader()).then(o))).catch(w)}));return o.destroy=()=>n.removeEventListener("message",a),o}function E(n,r){const a=new Map;async function o(e,o){let i=a.get(e);i||(i=function(){const e=new TransformStream;return{stream:e,writer:e.writable.getWriter()}}(),a.set(e,i),async function(e,a){const o=await L(a.stream.readable.getReader()),i=await r(o),w=c(s(n,t(new Uint8Array(4),e),16384));await p(w,i)}(e,i)),await i.writer.write(o)}async function i(t){const n=new Uint8Array(t.data),r=e(n);await o(r,n.slice(4))}return n.addEventListener("message",i),()=>{n.removeEventListener("message",i)}}export{T as createWebRTCFetch,E as createWebRTCServer};
//# sourceMappingURL=index.js.map
