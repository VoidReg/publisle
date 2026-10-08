import { fileURLToPath } from "node:url";
import { runAdapterAcceptance } from "../../adapter-core/tests/adapter-acceptance.ts";
import { reactTarget } from "../src/emitter.ts";

runAdapterAcceptance({
  target: reactTarget,
  dependencyDirectory: fileURLToPath(
    new URL("../node_modules", import.meta.url),
  ),
  runtime: fileURLToPath(new URL("../src/runtime.ts", import.meta.url)),
  islandModule: "./Island.jsx",
  files: {
    "Host.jsx": `import {createElement as h,useState,useEffect} from "react";
import Document from "./Document.jsx";
export default function Host(){const [show,setShow]=useState(true);const [count,setCount]=useState(0);
useEffect(()=>{window.__acceptance.ready=true;window.__acceptance.removeArticle=()=>setShow(false);},[]);
return h("main",{"data-host-layout":true},h("p",null,"Host before"),h("button",{onClick:()=>setCount(n=>n+1)},"Host count "+count),show?h(Document):null,h("p",null,"Host after"));}`,
    "Island.jsx": `import {createElement as h,useState,useEffect} from "react";
if(typeof window!=="undefined")window.__acceptance.moduleLoads++;
export default function Island({payload}){const [count,setCount]=useState(payload.start);
useEffect(()=>{window.__acceptance.mounted.push(payload.name);return()=>{window.__acceptance.cleaned.push(payload.name);};},[]);
return h("button",{"data-counter":true,onClick:()=>setCount(n=>n+1)},payload.name+" count "+count);}`,
    "Unrelated.jsx": `export default function Unrelated(){return "UNRELATED_IMPLEMENTATION_SENTINEL";}`,
    "server.js": `import Host from "./Host.jsx";import {createElement} from "react";import {renderToString} from "react-dom/server";export const markup=renderToString(createElement(Host));`,
    "client.js": `import Host from "./Host.jsx";import {metadata} from "./Document.jsx";import {createElement} from "react";import {hydrateRoot} from "react-dom/client";
window.__acceptance??={ready:false,moduleLoads:0,mounted:[],cleaned:[],route:"host-route",globalState:"host-state"};
window.__acceptance.metadata=metadata;hydrateRoot(document.getElementById("app"),createElement(Host));`,
  },
});
