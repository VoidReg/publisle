import { createApp, h } from "vue";
import Article from "./article.md";
createApp({
  render: () =>
    h("main", null, [
      h(Article, { instanceId: "one" }),
      h(Article, { instanceId: "two" }),
    ]),
}).mount("#app");
