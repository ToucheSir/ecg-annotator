import {
  LitElement,
  html,
  customElement,
  property,
  css,
  query,
} from "lit-element";
import { repeat } from "lit-html/directives/repeat";

const shortcutKeys = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "-",
  "=",
  "~",
];

@customElement("label-buttons")
export default class LabelButtons extends LitElement {
  @property({ attribute: false })
  options: { name: string; value: string; description: string }[] = [];

  @property()
  value: string = "";

  @query("#class-selection")
  private labelForm?: HTMLFormElement;

  private listener?: (evt: KeyboardEvent) => void;

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
    this.listener = (evt: KeyboardEvent) => {
      if (evt.repeat) {
        return;
      }
      const shortcutIndex = shortcutKeys.indexOf(evt.key);
      if (shortcutIndex >= 0) {
        this.labelInput.value = this.options[shortcutIndex].value;
      }
    };
    document.body.addEventListener("keydown", this.listener, {
      capture: false,
      passive: true,
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.body.removeEventListener("keydown", this.listener!);
  }

  private submitSelection(evt: Event) {
    evt.preventDefault();
    this.value = this.labelInput.value;
    this.dispatchEvent(
      new CustomEvent("select-label", {
        detail: { label: this.value },
      })
    );
  }

  shouldUpdate(changedProps: any) {
    const res = super.shouldUpdate(changedProps);
    console.log(changedProps);
    return res;
  }

  render() {
    return html`<div>
      <details open style="text-align: justify">
        <summary style="cursor: pointer">
          <strong>Annotation Instructions</strong>
        </summary>
        <ul style="padding-left: 0">
          <li>
            Use the buttons or keyboard shortcuts to select a label for each
            segment.
          </li>
          <li>
            Click and drag on the chart to zoom in, and double click to zoom out
            again.
          </li>
        </ul>
      </details>
      <form id="class-selection" @submit=${this.submitSelection}>
        ${repeat(this.options, (c, i) => {
          console.log(c.value, this.value, c.value === this.value);

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
                @change=${() => this.value = c.value}
              />
              <label for=${c.name}>
                <kbd>${shortcutKeys[i]}</kbd>
                <abbr title=${c.description}> ${c.name} </abbr>
              </label>
            </div>
          `;
        })}
        <input type="submit" value="Submit" style="margin-top: 1em" />
      </form>
    </div>`;
  }
}
