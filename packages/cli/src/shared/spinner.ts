import pc from 'picocolors';

export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: NodeJS.Timeout | null = null;
  private index = 0;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start() {
    this.interval = setInterval(() => {
      process.stdout.write(`\r${pc.cyan(this.frames[this.index])} ${this.message}`);
      this.index = (this.index + 1) % this.frames.length;
    }, 80);
  }

  stop(message: string = 'Done!') {
    if (this.interval) {
      clearInterval(this.interval);
      process.stdout.write(`\r${pc.green('✔')} ${message}\n`);
    }
  }
}
