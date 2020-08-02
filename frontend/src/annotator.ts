import {
  LitElement,
  html,
  customElement,
  property,
  query,
  css,
} from "lit-element";
import { until } from "lit-html/directives/until";
import dialogPolyfill from "dialog-polyfill";

import "./label-buttons";
import "./signal-view";
import SegmentCollection, {
  Segment,
  ScanDirection,
  Annotator,
  Annotation,
} from "./record-collection";

@customElement("conduit-annotator")
export default class AnnotatorApp extends LitElement {
  private segments?: SegmentCollection;

  @property({ attribute: false })
  currentSegment?: Segment;

  @property({ attribute: false })
  annotator?: Annotator;

  @property({ type: Number })
  position = -1;

  @property({ attribute: false })
  classes: any[] = [];

  @query("#abstain-dialog-template")
  private abstainDialogTemplate?: HTMLTemplateElement;

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
    const [classes, annotator] = await Promise.all([
      fetch("/api/classes").then((r) => r.json()),
      fetch("/api/annotators/me").then<Annotator>((r) => r.json()),
    ]);
    this.classes = classes;
    this.annotator = annotator;
    
    const campaign = annotator.current_campaign;
    this.segments = new SegmentCollection(
      new URL("/api/segments", location.href),
      campaign
    );
    this.position = Math.min(
      // Still -1 if no segments annotated
      campaign.segments.indexOf(campaign.last_annotated_segment),
      // Second last segment
      campaign.segments.length - 2
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

  private async showAbstainDialog() {
    const dialogConent = this.abstainDialogTemplate!.content.cloneNode(true);
    const dialog = document.createElement("dialog");

    dialog.append(dialogConent);
    dialogPolyfill.registerDialog(dialog);
    document.body.appendChild(dialog);
    dialog
      .querySelector("#cancel")
      ?.addEventListener("click", () => dialog.close(), { capture: false });
    dialog.showModal();

    const reason: string = await new Promise((res, rej) => {
      dialog.onclose = () => {
        try {
          const reasonInput = dialog
            .querySelector("form")
            ?.elements.namedItem("reason") as HTMLInputElement;
          res(reasonInput.value.trim());
        } catch (e) {
          rej(e);
        }
      };
    });
    document.body.removeChild(dialog);
    return reason;
  }

  private async saveAnnotation({ detail: { label } }: CustomEvent) {
    if (!this.annotator || !this.currentSegment) {
      throw ReferenceError("no annotator and record selected");
    }

    const { username } = this.annotator;
    const dataUrl = `/api/segments/${this.currentSegment._id}`;
    const annotationUrl = `${dataUrl}/annotations/${username}`;
    const annotation: Annotation = { label, confidence: 1 };
    if (label === "ABSTAIN") {
      const comments = await this.showAbstainDialog();
      if (!comments) {
        return;
      }
      annotation.comments = comments;
    }
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
      <link
        rel="stylesheet"
        href="/web_modules/dialog-polyfill/dist/dialog-polyfill.css"
      />
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
            .options=${this.classes}
            @select-label=${this.saveAnnotation}
          ></label-buttons>
        </div>

        <template id="abstain-dialog-template">
          <form method="dialog">
            <datalist id="abstain-reasons">
              <option value="too noisy to annotate">
                (suggestion) too noisy to annotate
              </option>
            </datalist>
            <input
              type="text"
              name="reason"
              required
              pattern=".*?[^\\s].*?"
              list="abstain-reasons"
              placeholder="reason for abstaining"
            />
            <menu>
              <!-- N.B. type="button" doesn't trigger on enter -->
              <button type="button" id="cancel">Cancel</button>
              <button>Submit</button>
            </menu>
          </form>
        </template>
      </main>
    `;
  }
}
