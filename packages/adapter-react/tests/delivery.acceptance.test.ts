import { fileURLToPath } from "node:url";
import { runDeliveryAcceptance } from "../../adapter-core/tests/delivery-acceptance.ts";
import { reactTarget } from "../src/emitter.ts";
runDeliveryAcceptance({
  target: reactTarget,
  dependencyDirectory: fileURLToPath(
    new URL("../node_modules", import.meta.url),
  ),
  runtime: fileURLToPath(new URL("../src/runtime.ts", import.meta.url)),
  islandModule: "./Island.jsx",
  artifactMount:
    'import {createRoot} from "react-dom/client";import {createElement as h} from "react";const hostMount=(module,target,props)=>{const root=createRoot(target);root.render(h(module.default,props));return root;};const hostUnmount=root=>root.unmount();',
  files: {
    "Host.jsx":
      'import {createElement as h,Fragment} from "react";import Document from "./Document.jsx";export default function Host(){return h(Fragment,null,h(Document,{instanceId:"one"}),h(Document,{instanceId:"two"}));}',
    "Island.jsx":
      'import {createElement as h,useState,useEffect} from "react";if(typeof window!=="undefined")window.__moduleLoads++;export default function Island(props){const [state,setState]=useState(0);useEffect(()=>{window.__inputs.push(props);},[]);return h("section",null,h("pre",{"data-payload":true},JSON.stringify(props.payload)),h("button",{"data-state":true,onClick:()=>setState(state+1)},"State "+state));}',
    "server.js":
      'import Host from "./Host.jsx";import {createElement} from "react";import {renderToString} from "react-dom/server";export const markup=renderToString(createElement(Host));',
    "client.js":
      'import Host from "./Host.jsx";import {hydrateRoot} from "react-dom/client";import {createElement} from "react";window.__inputs=[];window.__moduleLoads=0;hydrateRoot(document.getElementById("app"),createElement(Host));',
  },
});
