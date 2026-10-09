import type { JsonValue } from "@publisle/schema";
export default function mount(
  target: HTMLElement,
  input: JsonValue,
): { dispose: () => void } {
  const button = document.createElement("button");
  button.dataset.counter = "";
  let count = 0;
  button.textContent = "Count 0";
  const update = () => {
    button.textContent = `Count ${String(++count)}`;
  };
  button.addEventListener("click", update);
  target.append(button);
  window.__mounts = (window.__mounts ?? 0) + 1;
  if ((input as { inputVersion?: number }).inputVersion !== 1)
    throw new Error("Missing island ABI");
  return {
    dispose() {
      button.removeEventListener("click", update);
      button.remove();
      window.__unmounts = (window.__unmounts ?? 0) + 1;
    },
  };
}
