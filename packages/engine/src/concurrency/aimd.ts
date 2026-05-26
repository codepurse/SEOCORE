export interface AimdConcurrencyControllerOptions {
  initialConcurrency: number;
  minConcurrency: number;
  maxConcurrency: number;
  backoffFactor: number; // multiplicative decrease, e.g., 0.5
  increment: number; // additive increase, e.g., 1
  windowSize: number; // number of requests in window
}

export class AimdConcurrencyController {
  private currentConcurrency: number;
  private readonly options: AimdConcurrencyControllerOptions;
  private window: { success: boolean; timestamp: number }[] = [];
  private inFlight: number = 0;

  constructor(options: Partial<AimdConcurrencyControllerOptions> = {}) {
    this.options = {
      initialConcurrency: 3,
      minConcurrency: 1,
      maxConcurrency: 10,
      backoffFactor: 0.5,
      increment: 1,
      windowSize: 20,
      ...options,
    };
    this.currentConcurrency = this.options.initialConcurrency;
  }

  get concurrency(): number {
    return this.currentConcurrency;
  }

  async acquire(): Promise<void> {
    // Wait until we have available capacity
    while (this.inFlight >= this.currentConcurrency) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.inFlight++;
  }

  release(success: boolean): void {
    this.inFlight--;
    this.window.push({ success, timestamp: Date.now() });
    
    // Trim window
    if (this.window.length > this.options.windowSize) {
      this.window.shift();
    }
    
    // Update concurrency based on window
    this.adjustConcurrency();
  }

  private adjustConcurrency(): void {
    if (this.window.length < this.options.windowSize) return;

    const successRate = this.window.filter(w => w.success).length / this.window.length;

    if (successRate < 0.9) {
      // Too many failures, decrease concurrency (multiplicative decrease)
      this.currentConcurrency = Math.max(
        this.options.minConcurrency,
        Math.floor(this.currentConcurrency * this.options.backoffFactor)
      );
      // Clear window to allow recovery
      this.window = [];
    } else {
      // Success rate is good, increase concurrency (additive increase)
      this.currentConcurrency = Math.min(
        this.options.maxConcurrency,
        this.currentConcurrency + this.options.increment
      );
    }
  }
}
