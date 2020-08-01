import {
  LitElement,
  html,
  customElement,
  property,
  css,
  query,
} from "lit-element";
import { repeat } from "lit-html/directives/repeat";
import hotkeys from "hotkeys-js";

@customElement("label-buttons")
export default class LabelButtons extends LitElement {
  @property({ attribute: false })
  options: { name: string; value: string; description: string }[] = [];

  @property()
  value: string = "";

  @query("#class-selection")
  private labelForm?: HTMLFormElement;

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

  private get labelInput() {
    return this.labelForm?.elements.namedItem("label") as RadioNodeList;
  }

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
        this.labelInput.value = this.options[keyValue - 1].value;
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    hotkeys.unbind("*");
  }

  private submitSelection(evt: Event) {
    evt.preventDefault();
    this.value = this.labelInput.value;
    console.log(this.value);
    this.dispatchEvent(
      new CustomEvent("select-label", {
        detail: { label: this.value },
      })
    );
  }

  render() {
    return html`<div>
      <details open style="text-align: justify">
        <summary style="cursor: pointer">
          <strong>Annotation Instructions</strong>
        </summary>
        <ul style="padding-left: 0">
          <li>
            Use the buttons or number keys (1-${this.options.length}) to select
            a label for each segment.
          </li>
          <li>
            Click and drag on the chart to zoom in, and double click to zoom out
            again.
          </li>
        </ul>
      </details>
      <form id="class-selection" @submit=${this.submitSelection}>
        ${repeat(this.options, (c, i) => {
          return html`
            <div>
              <!-- using .checked ensures the state is updated instead set statically -->
              <input
                type="radio"
                id=${c.name}
                name="label"
                value=${c.value}
                required
                .checked=${c.value === this.value}
              />
              <label for=${c.name}>
                <abbr title=${c.description}>
                  ${c.name}
                </abbr>
                <kbd>${i + 1}</kbd>
              </label>
            </div>
          `;
        })}
        <input type="submit" value="Submit" style="margin-top: 1em" />
      </form>
    </div>`;
  }
}
