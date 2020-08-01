import { LitElement, html, customElement, property, css } from "lit-element";
import { until } from "lit-html/directives/until";

import "./label-buttons";
import "./signal-view";
import SegmentCollection, {
  Segment,
  ScanDirection,
  Annotator,
} from "./record-collection";

const classes = [
  { name: "AFib", value: "AFIB", description: "Atrial Fibrillation" },
  { name: "Normal", value: "NORMAL", description: "Normal Sinus Rhythm" },
  { name: "Other", value: "OTHER", description: "Other Arrhythmia" },
  {
    name: "Abstain",
    value: "ABSTAIN",
    description: "Unsure/None of the Above",
  },
];

@customElement("conduit-annotator")
export default class AnnotatorApp extends LitElement {
  private segments?: SegmentCollection;

  @property({ attribute: false })
  currentSegment?: Segment;

  @property({ attribute: false })
  annotator?: Annotator;

  @property({ type: Number })
  position = -1;

  static styles = css`
    /* Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/kbd */
    kbd {
      background-color: #eee;
      border-radius: 3px;
      border: 1px solid #b4b4b4;
      box-shadow: 0 1px 1px rgba(0, 0, 0, 0.2),
        0 2px 0 0 rgba(255, 255, 255, 0.7) inset;
      color: #333;
      display: inline-block;
      font-size: 0.85em;
      font-weight: 700;
      line-height: 1;
      padding: 2px 4px;
      white-space: nowrap;
    }

    #header {
      text-align: center;
      display: inline-block;
      width: 100%;
    }

    #body {
      width: 100%;
      display: flex;
    }

    signal-view {
      flex-grow: 3;
    }

    label-buttons {
      margin-top: 1em;
      min-width: 250px;
    }
  `;

  async firstUpdated() {
    const annRes = await fetch("/api/annotators/me");
    const annotator = await annRes.json();
    this.annotator = annotator;
    this.segments = new SegmentCollection(
      new URL("/api/segments", location.href),
      annotator.current_campaign
    );
    return this.nextRecord();
  }

  private async prevRecord() {
    if (this.segments && this.position > 0) {
      this.currentSegment = await this.segments.get(
        --this.position,
        ScanDirection.Backwards
      );
    }
  }
  private async nextRecord() {
    if (this.segments && this.position < this.segments.length - 1) {
      this.currentSegment = await this.segments.get(
        ++this.position,
        ScanDirection.Forwards
      );
    }
  }

  private async saveAnnotation({ detail: { label } }: CustomEvent) {
    if (!this.annotator || !this.currentSegment) {
      throw ReferenceError("no annotator and record selected");
    }

    const { username } = this.annotator;
    const dataUrl = `/api/segments/${this.currentSegment._id}`;
    const annotationUrl = `${dataUrl}/annotations/${username}`;
    const annotation = { label, confidence: 1 };
    this.currentSegment.annotations[username] = annotation;
    await fetch(annotationUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(annotation),
    });
    this.nextRecord();
  }

  private updatedOr(cond: boolean) {
    return until(this.updateComplete.then((x) => !x || cond));
  }

  render() {
    const segmentStats = this.segments
      ? ` | Segment ${this.position + 1} / ${this.segments?.length}`
      : "";
    const annotation = this.currentSegment?.annotations[
      this.annotator!.username
    ];

    const moveButtons =
      this.annotator?.designation &&
      this.annotator.designation.toLowerCase() != "student"
        ? html`<button
              @click=${this.prevRecord}
              ?disabled=${this.updatedOr(this.position <= 0)}
            >
              Prev
            </button>
            <button
              @click=${this.nextRecord}
              ?disabled=${this.updatedOr(
                this.position >= (this.segments?.length ?? 0) - 1
              )}
            >
              Next
            </button>`
        : null;
    return html`
      <main>
        <div id="header">
          ${this.annotator?.name}${segmentStats} ${moveButtons}
        </div>
        <div id="body">
          <signal-view
            id="signals"
            .signals=${this.currentSegment?.signals ?? {}}
          ></signal-view>
          <label-buttons
            id="button-bar"
            .value=${annotation?.label ?? ""}
            .options=${classes}
            @select-label=${this.saveAnnotation}
          ></label-buttons>
        </div>
      </main>
    `;
  }
}
