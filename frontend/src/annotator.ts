import { LitElement, html, customElement, property, css } from "lit-element";
import { repeat } from "lit-html/directives/repeat";
import { live } from "lit-html/directives/live";
import hotkeys from "hotkeys-js";

import "./signal-view";
import createSegmentCollection, {
  Segment,
  SegmentCollectionCursor,
} from "./record-collection";

interface Annotator {
  _id: string;
  name: string;
  username: string;
}

const classes = [
  { name: "Afib", value: "A", colour: "red" },
  { name: "Normal", value: "N", colour: "white" },
  { name: "Other", value: "O", colour: "blue" },
  { name: "Abstain", value: "", colour: "blue" },
];

@customElement("conduit-annotator")
export default class AnnotatorApp extends LitElement {
  private segments?: SegmentCollectionCursor;

  @property({ attribute: false })
  currentSegment?: Segment;

  @property({ attribute: false })
  annotator?: Annotator;

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

    #app {
      display: flex;
      justify-content: center;
    }

    #header {
      margin: auto 10px;
    }

    #button-bar {
      margin-top: 2em;
    }

    #signals {
      width: 80vw;
    }

    .annotation-button {
      margin: 0 5px;
      padding: 5px;
      border: 2px solid black;
      border-radius: 5px;
    }

    .selected {
      background: black;
      color: white;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    hotkeys("*", (evt, _) => {
      if (evt.repeat) {
        return;
      }

      if (evt.key == "ArrowLeft") {
        this.prevRecord();
      } else if (evt.key === "ArrowRight") {
        this.nextRecord();
      }

      const keyValue = Number.parseInt(evt.key, 10);
      if (
        Number.isInteger(keyValue) &&
        keyValue >= 1 &&
        keyValue <= classes.length
      ) {
        this.saveAnnotation(classes[keyValue - 1].value);
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    hotkeys.unbind("*");
  }

  async firstUpdated() {
    const annRes = await fetch("/api/annotators/me");
    this.annotator = await annRes.json();
    this.segments = await createSegmentCollection(
      new URL("/api/segments", location.href)
    );
    const { value, done } = await this.segments.next();
    if (!done) {
      this.currentSegment = value!;
      console.log(this.currentSegment);
    }
  }

  private async prevRecord() {
    if (this.segments && this.currentSegment) {
      const { value } = await this.segments?.previous();
      if (value) {
        this.currentSegment = value;
      }
    }
  }
  private async nextRecord() {
    if (this.segments && this.currentSegment) {
      const { value, done } = await this.segments?.next();
      if (!done && value) {
        this.currentSegment = value;
      }
    }
  }

  private async saveAnnotation(label: string) {
    if (!this.annotator || !this.currentSegment) {
      throw ReferenceError("no annotator and record selected");
    }

    const { username } = this.annotator;
    const dataUrl = `/api/segments/${this.currentSegment._id}`;
    const annotationUrl = `${dataUrl}/annotations/${username}`;
    const annotation = { label, confidence: 1 };
    this.currentSegment.annotations[username] = annotation;
    this.nextRecord();
    return fetch(annotationUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(annotation),
    });
  }

  render() {
    let annHeader: any = "";
    let annPanel: any = "";
    const position = this.segments ? this.segments.position : 0;
    if (this.annotator && this.currentSegment) {
      const annotation = this.currentSegment.annotations[
        this.annotator.username
      ];
      annHeader = html`
        <span id="header">
          | Segment ${position + 1} / ${this.segments?.length}
        </span>
      `;
      annPanel = html`<signal-view
          id="signals"
          .signals=${this.currentSegment?.signals}
        ></signal-view>
        <div id="button-bar">
          ${repeat(
            classes,
            (c, i) => html`
              <div>
                <input
                  type="radio"
                  name="label"
                  value=${c.name}
                  .checked=${live(c.value === annotation?.label)}
                  @change="${(evt: InputEvent) => {
                    // Prevent arrow keys scrolling through radio button
                    (evt.target as HTMLInputElement).blur();
                    this.saveAnnotation(c.value);
                  }}"
                />
                ${c.name}<kbd>${i + 1}</kbd>
              </div>
            `
          )}
        </div>`;
    }

    return html`
      <div id="app">
        <div>
          <div style="display: flex; justify-content: center">
            <strong>${this.annotator?.name}</strong>
            ${annHeader}
          </div>
          <div style="display: flex">${annPanel}</div>
        </div>
      </div>
    `;
  }
}
