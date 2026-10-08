import { fileURLToPath } from "node:url";
import { compile } from "svelte/compiler";
import { runAdapterAcceptance } from "../../adapter-core/tests/adapter-acceptance.ts";
import { svelteTarget } from "../src/emitter.ts";

runAdapterAcceptance({
  target: svelteTarget,
  dependencyDirectory: fileURLToPath(
    new URL("../node_modules", import.meta.url),
  ),
  runtime: fileURLToPath(new URL("../src/runtime.ts", import.meta.url)),
  islandModule: "./Island.svelte",
  plugins: [
    {
      name: "acceptance-svelte",
      transform(source, id, options) {
        if (!id.endsWith(".svelte")) return undefined;
        return compile(source, {
          filename: id,
          generate: options?.ssr ? "server" : "client",
          css: "external",
        }).js;
      },
    },
  ],
  files: {
    "Host.svelte": `<script>import {onMount} from "svelte";import Document from "./Document.svelte";
let show=$state(true);let count=$state(0);onMount(()=>{window.__acceptance.ready=true;window.__acceptance.removeArticle=()=>{show=false;};});</script>
<main data-host-layout><p>Host before</p><button onclick={()=>count++}>Host count {count}</button>{#if show}<Document />{/if}<p>Host after</p></main>`,
    "Island.svelte": `<script module>if(typeof window!=="undefined")window.__acceptance.moduleLoads++;</script>
<script>import {onMount} from "svelte";let {payload}=$props();let count=$state(payload.start);
onMount(()=>{window.__acceptance.mounted.push(payload.name);return()=>{window.__acceptance.cleaned.push(payload.name);};});</script>
<button data-counter onclick={()=>count++}>{payload.name} count {count}</button>`,
    "Unrelated.svelte": `<p>UNRELATED_IMPLEMENTATION_SENTINEL</p>`,
    "server.js": `import Host from "./Host.svelte";import {render} from "svelte/server";export const markup=render(Host).body;`,
    "client.js": `import Host from "./Host.svelte";import {metadata} from "./Document.svelte";import {hydrate} from "svelte";
window.__acceptance??={ready:false,moduleLoads:0,mounted:[],cleaned:[],route:"host-route",globalState:"host-state"};
window.__acceptance.metadata=metadata;hydrate(Host,{target:document.getElementById("app")});`,
  },
});
