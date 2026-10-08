import { fileURLToPath } from "node:url";
import { compile } from "svelte/compiler";
import { runDeliveryAcceptance } from "../../adapter-core/tests/delivery-acceptance.ts";
import { svelteTarget } from "../src/emitter.ts";
runDeliveryAcceptance({
  target: svelteTarget,
  dependencyDirectory: fileURLToPath(
    new URL("../node_modules", import.meta.url),
  ),
  runtime: fileURLToPath(new URL("../src/runtime.ts", import.meta.url)),
  islandModule: "./Island.svelte",
  artifactMount:
    'import {mount,unmount} from "svelte";const hostMount=(module,target,props)=>mount(module.default,{target,props});const hostUnmount=instance=>unmount(instance);',
  plugins: [
    {
      name: "svelte-delivery-fixture",
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
    "Host.svelte":
      '<script>import Document from "./Document.svelte";</script><Document instanceId="one"/><Document instanceId="two"/>',
    "Island.svelte":
      '<script module>if(typeof window!=="undefined")window.__moduleLoads++;</script><script>import {onMount} from "svelte";let props=$props();let state=$state(0);onMount(()=>{window.__inputs.push(props);});</script><section><pre data-payload>{JSON.stringify(props.payload)}</pre><button data-state onclick={()=>state++}>State {state}</button></section>',
    "server.js":
      'import Host from "./Host.svelte";import {render} from "svelte/server";export const markup=render(Host).body;',
    "client.js":
      'import Host from "./Host.svelte";import {hydrate} from "svelte";window.__inputs=[];window.__moduleLoads=0;hydrate(Host,{target:document.getElementById("app")});',
  },
});
