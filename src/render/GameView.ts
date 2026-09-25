import { World } from "../model/World";

export class GameView {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private camX = 900;
  private camY = 550;
  private zoom = .8;
  private dragging = false;
  private origin = { x: 0, y: 0, camX: 0, camY: 0 };

  constructor(root: HTMLElement, private readonly world: World) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "world";
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.bind();
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
    for (const a of this.world.agents) {
      this.ctx.fillStyle = this.world.color(a.job);
      this.ctx.beginPath();
      this.ctx.arc(a.x, a.y, 3.5 / this.zoom, 0, Math.PI * 2);
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
      c.beginPath(); c.moveTo(x, 180); c.lineTo(x, 490); c.stroke();
    }

    for (let i = 0; i < 36; i++) {
      const x = 960 + (i % 9) * 72;
      const y = 570 + Math.floor(i / 9) * 72;
      c.fillStyle = "#d0bc94";
      c.fillRect(x, y, 40, 28);
      c.fillStyle = "#8e6345";
      c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 20, y - 20); c.lineTo(x + 44, y); c.closePath(); c.fill();
    }
  }

  private bind() {
    window.addEventListener("resize", () => this.render());
    this.canvas.addEventListener("pointerdown", e => {
      this.dragging = true;
      this.origin = { x: e.clientX, y: e.clientY, camX: this.camX, camY: this.camY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", e => {
      if (!this.dragging) return;
      this.camX = this.origin.camX - (e.clientX - this.origin.x) / this.zoom;
      this.camY = this.origin.camY - (e.clientY - this.origin.y) / this.zoom;
    });
    this.canvas.addEventListener("pointerup", e => {
      this.dragging = false;
      this.canvas.releasePointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("wheel", e => {
      e.preventDefault();
      this.zoom = Math.max(.35, Math.min(2.7, this.zoom * (e.deltaY < 0 ? 1.08 : .92)));
    }, { passive: false });
  }
}
