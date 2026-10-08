import type { IslandInput } from "../../../packages/schema/src/island-input.ts";

// This is host/user code, not a built-in Publisle implementation.
export function mount(target: HTMLElement, input: IslandInput): () => void {
  let count = typeof input.initialState === "number" ? input.initialState : 0;
  const button = document.createElement("button");
  button.setAttribute("data-counter", input.block.id);
  const render = () => {
    button.textContent = `Count ${String(count)}`;
  };
  const increment = () => {
    count++;
    render();
  };
  button.addEventListener("click", increment);
  render();
  target.append(button);
  return () => {
    button.removeEventListener("click", increment);
    button.remove();
  };
}
