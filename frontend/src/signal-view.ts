import { LitElement, html, customElement, property } from "lit-element";
import uPlot from "uplot";

const DEFAULT_SAMPLE_RATE = 240;

@customElement("signal-view")
export default class SignalView extends LitElement {
  private view?: uPlot;

  @property()
  signals: any = {};

  @property({ type: Number })
  sampleRate: number = DEFAULT_SAMPLE_RATE;

  updateData() {
    if (this.view && this.signals && this.signals.I) {
      const signal = this.signals.I.map((x: number) => x);
      const index = signal.map((_: any, i: number) => i / this.sampleRate);
      this.view.setData([index, signal]);
    }
  }

  firstUpdated() {
    const yMax = 3;
    const width = this.clientWidth;
    const height = width / yMax;
    this.view = new uPlot(
      {
        width,
        height,
        series: [
          {
            value: (_, rawValue) => rawValue.toFixed(2) + "s",
          },
          {
            label: "Lead I",
            width: 2,
            paths: smoothPath,
            value: (_, rawValue) => rawValue.toFixed(2) + "mV",
          },
        ],
        scales: { x: { time: true }, y: { range: [-yMax, yMax] } },
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
    this.updateData();
  }

  updated(changedProps: Map<string | number | symbol, unknown>) {
    super.updated(changedProps);
    this.updateData();
  }

  render() {
    return html`
      <link rel="stylesheet" href="uPlot.min.css" />
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

  return {
    stroke,
    fill,
  };
}
