const BACKGROUND_COLOR = "#171717";
const GRID_COLOR = "#1c1c1c";
const LINE_COLOR = "#FF0041";

/*
  * CanvasDrawer
  * 
  * */
export default class CanvasDrawer {
  constructor(canvas) {
    this._canvas = canvas;
    this._context = this._canvas.getContext("2d");

    this.width = this._canvas.width;
    this.height = this._canvas.height;

    this.clear();
  }

  /*
  * clear
  * publis
  * */
  clear() {
    this._context.fillStyle = BACKGROUND_COLOR;
    this._context.fillRect(0, 0, this.width, this.height);
    this._context.beginPath();

    for (let x = 0.5; x <= this.width; x += 20) {
      this._context.moveTo(x, 0);
      this._context.lineTo(x, this.height);
    }
    for (let y = 0.5; y <= this.height; y += 20) {
      this._context.moveTo(0, y);
      this._context.lineTo(this.width, y);
    }

    this._context.strokeStyle = GRID_COLOR;
    this._context.stroke();
  }

  /*
  * Рисует последовательно все переданные в него данные
  * public
  * */
  *draw() {
    this.clear();
    this._context.beginPath();
    this._context.moveTo(0, this.height / 2);

    let value;
    let i = 0;
    while (value !== null) {
      value = yield;
      this._context.lineTo(i++, value + this.height / 2);
    }
    this._context.strokeStyle = LINE_COLOR;
    this._context.stroke();
  }
}
