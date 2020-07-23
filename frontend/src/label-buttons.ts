import { LitElement, html, customElement, property, css } from "lit-element";
import { classMap } from "lit-html/directives/class-map";
import { repeat } from "lit-html/directives/repeat";
import hotkeys from "hotkeys-js";

@customElement("label-buttons")
export default class LabelButtons extends LitElement {
  @property({ attribute: false })
  options: { name: string; value: string; description: string }[] = [];

  @property()
  value?: string;

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

    button {
      margin: 0.5em 0;
      padding: 0.25em;
      width: 100%;
      display: flex;
      justify-content: space-between;
    }

    .selected {
      font-weight: bold;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    hotkeys("*", (evt, _) => {
      if (evt.repeat) {
        return;
      }
      const keyValue = Number.parseInt(evt.key, 10);
      if (
        Number.isInteger(keyValue) &&
        keyValue >= 1 &&
        keyValue <= this.options.length
      ) {
        this.changeSelection(this.options[keyValue - 1].value);
      }
    });
  }

  private changeSelection(value: string) {
    this.value = value;
    this.dispatchEvent(new Event("change"));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    hotkeys.unbind("*");
  }

  render() {
    return html`<div>
      <details open style="text-align: justify">
        <summary style="cursor: pointer">
          <strong>Annotation Instructions</strong>
        </summary>
        <ul style="padding-left: 0">
          <li>
            Use the buttons or number keys (1-4) to select a label for each
            segment.
          </li>
          <li>
            Click and drag on the chart to zoom in, and double click to zoom out
            again.
          </li>
        </ul>
      </details>
      ${repeat(this.options, (c, i) => {
        const selected = c.value === this.value;
        return html`
          <button
            type="button"
            class=${classMap({ selected })}
            ?disabled=${selected}
            @click="${(evt: Event) => {
              // Prevent from interfering with arrow keys
              (evt.target as HTMLElement).blur();
              this.changeSelection(c.value);
            }}"
          >
            <abbr title=${(selected ? "(Selected) " : "") + c.description}>
              ${c.name}
            </abbr>
            <kbd>${i + 1}</kbd>
          </button>
        `;
      })}
    </div>`;
  }
}
