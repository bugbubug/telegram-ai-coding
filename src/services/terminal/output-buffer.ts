import { OUTPUT_DEBOUNCE_MS, TG_MAX_MESSAGE_LENGTH } from "../../shared/constants.js";
import { chunkMessage, stripAnsiCodes } from "../../shared/utils.js";

export class OutputBuffer {
  private buffer = "";
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly onFlush: (chunk: string) => void,
    private readonly debounceMs = OUTPUT_DEBOUNCE_MS,
    private readonly maxMessageLength = TG_MAX_MESSAGE_LENGTH,
  ) {}

  public append(chunk: string): void {
    this.buffer += stripAnsiCodes(chunk);
    this.scheduleFlush();
  }

  public flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.buffer.length === 0) {
      return;
    }

    const payload = this.buffer;
    this.buffer = "";
    for (const chunk of chunkMessage(payload, this.maxMessageLength)) {
      this.onFlush(chunk);
    }
  }

  public dispose(): void {
    this.flush();
  }

  private scheduleFlush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.flush();
    }, this.debounceMs);
  }
}
