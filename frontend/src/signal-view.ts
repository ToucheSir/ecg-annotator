import { LitElement, html, customElement, property } from "lit-element";
import uPlot from "uplot";

const DEFAULT_SAMPLE_RATE = 240;

function cellCount(min: number, max: number, scale: number = 1) {
  return Math.ceil(Math.max(Math.abs(min), max) * scale) / scale;
}

@customElement("signal-view")
export default class SignalView extends LitElement {
  private view?: uPlot;
  // set to 2+ for tighter y-axis clamping
  private scaleFactor = 1;

  @property()
  signals: any = {};

  @property({ type: Number })
  sampleRate: number = DEFAULT_SAMPLE_RATE;

  updateView() {
    if (this.view && this.signals && this.signals.I) {
      // TODO what if we want to display another lead or >1 lead?
      const signal = this.signals.I;
      const index = signal.map((_: any, i: number) => i / this.sampleRate);
      this.view.setData([index, signal]);

      const { width, height } = this.view;
      const yCells = cellCount(
        Math.min.apply(null, signal),
        Math.max.apply(null, signal),
        this.scaleFactor
      );
      // 10s * 5 cells/s or 0.2s/cell
      const yMax = (yCells * width) / 50;
      // Height of axes labels, tooltips, etc.
      // N.B. b(ounding) box dimensions are not pre-scaled by devicePixelRatio
      const yDiff = Math.abs(height - this.view.bbox.height / devicePixelRatio);
      this.view.setSize({
        width,
        height: 4 * yMax + yDiff,
      });
    }
  }

  firstUpdated() {
    const width = this.clientWidth;
    this.view = new uPlot(
      {
        width,
        // 0 initial height helps with cell calculations later
        height: 0,
        series: [
          {
            value: (_, rawValue) => rawValue.toFixed(2) + "s",
          },
          {
            label: "Lead I",
            width: 1.5 / devicePixelRatio,
            paths: smoothPath,
            value: (_, rawValue) => rawValue.toFixed(2) + "mV",
          },
        ],
        scales: {
          x: { time: true },
          y: {
            // uPlot resets the y-axis after a double-click zoom out in the x-axis (!),
            // so we have to enforce cell clamping here
            range: (_, newMin: number, newMax: number) => {
              const yCells = cellCount(newMin, newMax, this.scaleFactor);
              return [-yCells, yCells];
            },
          },
        },
        axes: [
          {
            space: 1,
            // Every small square (.04s) x 5
            incrs: [0.2],
            values: (_, ticks, __) =>
              ticks.map((x, i) => (i % 5 === 0 ? x.toFixed(2) : "")),
            grid: {
              stroke: "rgba(128, 128, 128, 0.3)",
            },
            label: "Time (s)",
          },
          {
            space: 1,
            // Every small square (.1mV) x 5
            incrs: [0.5, 1],
            label: "Lead I (mV)",
            values: (_, ticks, __) => ticks.map((x) => x.toFixed(1)),
          },
        ],
      },
      [[], []],
      this.renderRoot.querySelector(".chart-root") as HTMLElement
    );
    this.updateView();
  }

  updated(changedProps: Map<string | number | symbol, unknown>) {
    super.updated(changedProps);
    this.updateView();
  }

  render() {
    return html`
      <link rel="stylesheet" href="/web_modules/uplot/dist/uPlot.min.css" />
      <div class="chart-root"></div>
    `;
  }
}

// Adapted from https://github.com/leeoniya/uPlot/blob/master/demos/line-smoothing.html#L33
function smoothPath(u: uPlot, sidx: number, i0: number, i1: number) {
  const s = u.series[sidx];
  const xdata = u.data[0] as number[];
  const ydata = u.data[sidx] as number[];
  const scaleX = "x";
  const scaleY = s.scale!;

  const stroke = new Path2D();
  stroke.moveTo(xdata[0], ydata[0]);
  for (let i = i0; i <= i1 - 1; i++) {
    let x1 = u.valToPos(xdata[i + 1], scaleX, true);
    let y1 = u.valToPos(ydata[i + 1], scaleY, true);
    stroke.lineTo(x1, y1);
  }

  const fill = new Path2D(stroke);
  let minY = u.valToPos(u.scales[scaleY].min!, scaleY, true);
  let minX = u.valToPos(u.scales[scaleX].min!, scaleX, true);
  let maxX = u.valToPos(u.scales[scaleX].max!, scaleX, true);
  fill.lineTo(maxX, minY);
  fill.lineTo(minX, minY);

  return { stroke, fill };
}
