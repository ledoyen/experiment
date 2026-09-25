import "./style.css";
import { defaultParameters } from "./data/defaults";
import { World } from "./model/World";
import { GameView } from "./render/GameView";
import { AppUi } from "./ui/AppUi";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");

const world = new World(defaultParameters());
const view = new GameView(root, world);
const ui = new AppUi(root, world, view);
ui.mount();

let last = performance.now();
function frame(now: number) {
  const seconds = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (ui.shouldRun()) world.step(Math.max(1, Math.floor(seconds * 60 * ui.currentSpeed())));
  ui.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
