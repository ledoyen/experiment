import type { Agent } from "../data/types";
import { World } from "../model/World";

export class GameView {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private camX = 900;
  private camY = 550;
  private zoom = .8;
  private dragging = false;
  private origin = { x: 0, y: 0, camX: 0, camY: 0 };
  private agentHoverHandler: ((agent: Agent | null, screenX: number, screenY: number) => void) | null = null;
  private agentClickHandler: ((agent: Agent | null) => void) | null = null;
  private pointerDown = { x: 0, y: 0, moved: false, agent: null as Agent | null };

  constructor(root: HTMLElement, private readonly world: World) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "world";
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.bind();
  }

  setAgentHoverHandler(handler: (agent: Agent | null, screenX: number, screenY: number) => void) {
    this.agentHoverHandler = handler;
  }

  setAgentClickHandler(handler: (agent: Agent | null) => void) {
    this.agentClickHandler = handler;
  }

  render() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = "#b6cb96";
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.save();
    this.ctx.translate(w / 2, h / 2);
    this.ctx.scale(this.zoom, this.zoom);
    this.ctx.translate(-this.camX, -this.camY);

    this.drawTerrain();

    for (const agent of this.world.agents) {
      this.ctx.fillStyle = this.world.color(agent.job);
      this.ctx.beginPath();
      this.ctx.arc(agent.x, agent.y, 3.5 / this.zoom, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  private drawTerrain() {
    const c = this.ctx;
    c.fillStyle = "#7ea56e";
    c.fillRect(0, 0, this.world.width, this.world.height);

    c.fillStyle = "#6e9ebe";
    c.beginPath();
    c.moveTo(720, 0);
    c.bezierCurveTo(850, 260, 610, 500, 790, 1100);
    c.lineTo(930, 1100);
    c.bezierCurveTo(760, 520, 980, 250, 840, 0);
    c.closePath();
    c.fill();

    for (let x = 90; x < 540; x += 58) {
      for (let y = 80; y < 980; y += 56) {
        if ((x * 7 + y * 11) % 5 === 0) continue;
        c.fillStyle = "#416b43";
        c.beginPath();
        c.arc(x + ((y / 56) % 2) * 10, y, 18, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#71523b";
        c.fillRect(x - 3, y + 12, 6, 20);
      }
    }

    c.fillStyle = "#9b9759";
    c.fillRect(1040, 180, 520, 310);
    c.strokeStyle = "rgba(80,70,35,.35)";

    for (let x = 1050; x < 1560; x += 28) {
      c.beginPath();
      c.moveTo(x, 180);
      c.lineTo(x, 490);
      c.stroke();
    }

    for (let i = 0; i < 36; i++) {
      const x = 960 + (i % 9) * 72;
      const y = 570 + Math.floor(i / 9) * 72;

      c.fillStyle = "#d0bc94";
      c.fillRect(x, y, 40, 28);
      c.fillStyle = "#8e6345";
      c.beginPath();
      c.moveTo(x - 4, y);
      c.lineTo(x + 20, y - 20);
      c.lineTo(x + 44, y);
      c.closePath();
      c.fill();
    }
  }

  private bind() {
    window.addEventListener("resize", () => this.render());

    this.canvas.addEventListener("pointerdown", event => {
      const rect = this.canvas.getBoundingClientRect();
      const worldX = this.camX + (event.clientX - rect.left - rect.width / 2) / this.zoom;
      const worldY = this.camY + (event.clientY - rect.top - rect.height / 2) / this.zoom;
      const agent = this.world.getAgentAtWorldPosition(worldX, worldY, 12 / this.zoom);

      this.dragging = true;
      this.pointerDown = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
        agent
      };
      this.origin = {
        x: event.clientX,
        y: event.clientY,
        camX: this.camX,
        camY: this.camY
      };
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", event => {
      if (this.dragging) {
        const dx = event.clientX - this.origin.x;
        const dy = event.clientY - this.origin.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.pointerDown.moved = true;
        this.camX = this.origin.camX - dx / this.zoom;
        this.camY = this.origin.camY - dy / this.zoom;
      }

      const rect = this.canvas.getBoundingClientRect();
      const worldX = this.camX + (event.clientX - rect.left - rect.width / 2) / this.zoom;
      const worldY = this.camY + (event.clientY - rect.top - rect.height / 2) / this.zoom;
      const agent = this.world.getAgentAtWorldPosition(worldX, worldY, 12 / this.zoom);
      this.canvas.style.cursor = agent
        ? (this.dragging ? "grabbing" : "pointer")
        : (this.dragging ? "grabbing" : "default");
      this.agentHoverHandler?.(agent, event.clientX, event.clientY);
    });

    this.canvas.addEventListener("pointerleave", event => {
      if (!this.dragging) this.canvas.style.cursor = "default";
      this.agentHoverHandler?.(null, event.clientX, event.clientY);
    });

    this.canvas.addEventListener("pointerup", event => {
      const rect = this.canvas.getBoundingClientRect();
      const worldX = this.camX + (event.clientX - rect.left - rect.width / 2) / this.zoom;
      const worldY = this.camY + (event.clientY - rect.top - rect.height / 2) / this.zoom;
      const agent = this.world.getAgentAtWorldPosition(worldX, worldY, 12 / this.zoom);

      this.dragging = false;
      this.canvas.style.cursor = agent ? "pointer" : "default";

      if (!this.pointerDown.moved && this.pointerDown.agent && agent?.id === this.pointerDown.agent.id) {
        this.agentClickHandler?.(agent);
      }

      this.canvas.releasePointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("wheel", event => {
      event.preventDefault();
      this.zoom = Math.max(.35, Math.min(2.7, this.zoom * (event.deltaY < 0 ? 1.08 : .92)));
    }, { passive: false });
  }
}
