import pc from 'picocolors';

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private currentFrame = 0;
  private text = '';
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private isTTY = process.stdout.isTTY;

  constructor(text = '') {
    this.text = text;
  }

  start(text?: string) {
    if (text) this.text = text;
    if (!this.isTTY) {
      console.log(this.text);
      return;
    }

    if (this.timer) clearInterval(this.timer);

    // Hide cursor
    process.stdout.write('\u001B[?25l');
    this.render();

    this.timer = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.render();
    }, 80);
  }

  private render() {
    const frame = pc.cyan(this.frames[this.currentFrame]);
    process.stdout.write(`\r${frame} ${this.text}`);
  }

  update(text: string) {
    this.text = text;
    if (!this.isTTY) {
      console.log(text);
      return;
    }
    this.render();
  }

  stop(text?: string, status: 'success' | 'fail' | 'warn' | 'info' = 'success') {
    if (!this.isTTY) {
      if (text) console.log(text);
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Clear line
    process.stdout.write('\r\u001B[K');

    // Show cursor
    process.stdout.write('\u001B[?25h');

    const message = text || this.text;
    let symbol = '';
    if (status === 'success') {
      symbol = pc.green('✔');
    } else if (status === 'fail') {
      symbol = pc.red('✖');
    } else if (status === 'warn') {
      symbol = pc.yellow('⚠');
    } else {
      symbol = pc.blue('ℹ');
    }

    console.log(`${symbol} ${message}`);
  }
}
