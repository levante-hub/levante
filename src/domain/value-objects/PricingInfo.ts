export class PricingInfo {
  constructor(
    private readonly inputCostPerToken: number,
    private readonly outputCostPerToken: number,
    private readonly currency: string = 'USD'
  ) {
    if (inputCostPerToken < 0) {
      throw new Error('Input cost per token cannot be negative')
    }
    if (outputCostPerToken < 0) {
      throw new Error('Output cost per token cannot be negative')
    }
    if (!currency.trim()) {
      throw new Error('Currency cannot be empty')
    }
    if (currency.length !== 3) {
      throw new Error('Currency must be a 3-character ISO code (e.g., USD, EUR)')
    }
  }

  getInputCostPerToken(): number {
    return this.inputCostPerToken
  }

  getOutputCostPerToken(): number {
    return this.outputCostPerToken
  }

  getCurrency(): string {
    return this.currency
  }

  calculateInputCost(tokenCount: number): number {
    if (tokenCount < 0) {
      throw new Error('Token count cannot be negative')
    }
    return this.inputCostPerToken * tokenCount
  }

  calculateOutputCost(tokenCount: number): number {
    if (tokenCount < 0) {
      throw new Error('Token count cannot be negative')
    }
    return this.outputCostPerToken * tokenCount
  }

  calculateTotalCost(inputTokens: number, outputTokens: number): number {
    return this.calculateInputCost(inputTokens) + this.calculateOutputCost(outputTokens)
  }

  isMoreExpensiveThan(other: PricingInfo): boolean {
    if (this.currency !== other.currency) {
      throw new Error('Cannot compare pricing with different currencies')
    }
    
    const avgThisCost = (this.inputCostPerToken + this.outputCostPerToken) / 2
    const avgOtherCost = (other.inputCostPerToken + other.outputCostPerToken) / 2
    
    return avgThisCost > avgOtherCost
  }

  isFree(): boolean {
    return this.inputCostPerToken === 0 && this.outputCostPerToken === 0
  }

  equals(other: PricingInfo): boolean {
    return (
      this.inputCostPerToken === other.inputCostPerToken &&
      this.outputCostPerToken === other.outputCostPerToken &&
      this.currency === other.currency
    )
  }

  toString(): string {
    if (this.isFree()) {
      return 'Free'
    }
    
    return `Input: ${this.formatCost(this.inputCostPerToken)}/${this.formatTokenUnit()}, Output: ${this.formatCost(this.outputCostPerToken)}/${this.formatTokenUnit()}`
  }

  toJSON(): {
    inputCostPerToken: number;
    outputCostPerToken: number;
    currency: string;
  } {
    return {
      inputCostPerToken: this.inputCostPerToken,
      outputCostPerToken: this.outputCostPerToken,
      currency: this.currency
    }
  }

  private formatCost(cost: number): string {
    const symbol = this.getCurrencySymbol()
    
    if (cost >= 1) {
      return `${symbol}${cost.toFixed(2)}`
    } else if (cost >= 0.01) {
      return `${symbol}${cost.toFixed(4)}`
    } else if (cost >= 0.0001) {
      return `${symbol}${cost.toFixed(6)}`
    } else {
      return `${symbol}${cost.toExponential(2)}`
    }
  }

  private formatTokenUnit(): string {
    return '1K tokens'
  }

  private getCurrencySymbol(): string {
    switch (this.currency) {
      case 'USD': return '$'
      case 'EUR': return '€'
      case 'GBP': return '£'
      default: return this.currency + ' '
    }
  }

  // Factory methods
  static free(): PricingInfo {
    return new PricingInfo(0, 0)
  }

  static perThousandTokens(inputCost: number, outputCost: number, currency = 'USD'): PricingInfo {
    return new PricingInfo(inputCost, outputCost, currency)
  }

  static perMillionTokens(inputCost: number, outputCost: number, currency = 'USD'): PricingInfo {
    return new PricingInfo(inputCost / 1000, outputCost / 1000, currency)
  }

  static fromJSON(data: { inputCostPerToken: number; outputCostPerToken: number; currency?: string }): PricingInfo {
    return new PricingInfo(
      data.inputCostPerToken,
      data.outputCostPerToken,
      data.currency || 'USD'
    )
  }
}