import { fileURLToPath } from "node:url";
import { runDeliveryAcceptance } from "../../adapter-core/tests/delivery-acceptance.ts";
import { vueTarget } from "../src/emitter.ts";
runDeliveryAcceptance({
  target: vueTarget,
  dependencyDirectory: fileURLToPath(
    new URL("../node_modules", import.meta.url),
  ),
  runtime: fileURLToPath(new URL("../src/runtime.ts", import.meta.url)),
  islandModule: "./Island.js",
  artifactMount:
    'import {createApp} from "vue";const hostMount=(module,target,props)=>{const app=createApp(module.default,props);app.mount(target);return app;};const hostUnmount=app=>app.unmount();',
  files: {
    "Host.js":
      'import {h,defineComponent} from "vue";import Document from "./Document.js";export default defineComponent({setup(){return ()=>h("main",null,[h(Document,{instanceId:"one"}),h(Document,{instanceId:"two"})]);}});',
    "Island.js":
      'import {h,ref,onMounted,defineComponent} from "vue";if(typeof window!=="undefined")window.__moduleLoads++;export default defineComponent({props:["payload","initialState","hostContext","envelopeExtensions","block","inputVersion","document","resources","references","extensions","contract"],setup(props){const state=ref(0);onMounted(()=>window.__inputs.push({...props}));return ()=>h("section",null,[h("pre",{"data-payload":true},JSON.stringify(props.payload)),h("button",{"data-state":true,onClick:()=>state.value++},"State "+state.value)]);}});',
    "server.js":
      'import Host from "./Host.js";import {createSSRApp} from "vue";import {renderToString} from "vue/server-renderer";export const markup=await renderToString(createSSRApp(Host));',
    "client.js":
      'import Host from "./Host.js";import {createSSRApp} from "vue";window.__inputs=[];window.__moduleLoads=0;createSSRApp(Host).mount(document.getElementById("app"));',
  },
});
