export class Timestamp {
  constructor(private readonly value: Date) {
    if (!(value instanceof Date)) {
      throw new Error('Timestamp must be a valid Date object')
    }
    if (isNaN(value.getTime())) {
      throw new Error('Timestamp must be a valid date')
    }
  }

  toDate(): Date {
    return new Date(this.value)
  }

  toISOString(): string {
    return this.value.toISOString()
  }

  toUnixTimestamp(): number {
    return Math.floor(this.value.getTime() / 1000)
  }

  toMilliseconds(): number {
    return this.value.getTime()
  }

  equals(other: Timestamp): boolean {
    return this.value.getTime() === other.value.getTime()
  }

  isBefore(other: Timestamp): boolean {
    return this.value.getTime() < other.value.getTime()
  }

  isAfter(other: Timestamp): boolean {
    return this.value.getTime() > other.value.getTime()
  }

  isSameAs(other: Timestamp): boolean {
    return this.equals(other)
  }

  addMilliseconds(ms: number): Timestamp {
    return new Timestamp(new Date(this.value.getTime() + ms))
  }

  addSeconds(seconds: number): Timestamp {
    return this.addMilliseconds(seconds * 1000)
  }

  addMinutes(minutes: number): Timestamp {
    return this.addMilliseconds(minutes * 60 * 1000)
  }

  addHours(hours: number): Timestamp {
    return this.addMilliseconds(hours * 60 * 60 * 1000)
  }

  addDays(days: number): Timestamp {
    return this.addMilliseconds(days * 24 * 60 * 60 * 1000)
  }

  subtractMilliseconds(ms: number): Timestamp {
    return new Timestamp(new Date(this.value.getTime() - ms))
  }

  subtractSeconds(seconds: number): Timestamp {
    return this.subtractMilliseconds(seconds * 1000)
  }

  subtractMinutes(minutes: number): Timestamp {
    return this.subtractMilliseconds(minutes * 60 * 1000)
  }

  subtractHours(hours: number): Timestamp {
    return this.subtractMilliseconds(hours * 60 * 60 * 1000)
  }

  subtractDays(days: number): Timestamp {
    return this.subtractMilliseconds(days * 24 * 60 * 60 * 1000)
  }

  differenceInMilliseconds(other: Timestamp): number {
    return Math.abs(this.value.getTime() - other.value.getTime())
  }

  differenceInSeconds(other: Timestamp): number {
    return Math.floor(this.differenceInMilliseconds(other) / 1000)
  }

  differenceInMinutes(other: Timestamp): number {
    return Math.floor(this.differenceInSeconds(other) / 60)
  }

  differenceInHours(other: Timestamp): number {
    return Math.floor(this.differenceInMinutes(other) / 60)
  }

  differenceInDays(other: Timestamp): number {
    return Math.floor(this.differenceInHours(other) / 24)
  }

  format(options?: Intl.DateTimeFormatOptions): string {
    return this.value.toLocaleDateString(undefined, options)
  }

  formatTime(options?: Intl.DateTimeFormatOptions): string {
    return this.value.toLocaleTimeString(undefined, options)
  }

  formatDateTime(options?: Intl.DateTimeFormatOptions): string {
    return this.value.toLocaleString(undefined, options)
  }

  toRelativeString(): string {
    const now = Timestamp.now()
    const diffMs = now.toMilliseconds() - this.toMilliseconds()
    
    if (diffMs < 0) {
      return 'in the future'
    }

    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSeconds < 60) {
      return diffSeconds <= 1 ? 'just now' : `${diffSeconds} seconds ago`
    } else if (diffMinutes < 60) {
      return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`
    } else if (diffHours < 24) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
    } else if (diffDays < 30) {
      return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`
    } else {
      return this.format({ year: 'numeric', month: 'short', day: 'numeric' })
    }
  }

  isToday(): boolean {
    const today = new Date()
    return (
      this.value.getDate() === today.getDate() &&
      this.value.getMonth() === today.getMonth() &&
      this.value.getFullYear() === today.getFullYear()
    )
  }

  isYesterday(): boolean {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return (
      this.value.getDate() === yesterday.getDate() &&
      this.value.getMonth() === yesterday.getMonth() &&
      this.value.getFullYear() === yesterday.getFullYear()
    )
  }

  isThisWeek(): boolean {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    
    return this.value >= weekStart
  }

  isThisMonth(): boolean {
    const now = new Date()
    return (
      this.value.getMonth() === now.getMonth() &&
      this.value.getFullYear() === now.getFullYear()
    )
  }

  toString(): string {
    return this.value.toISOString()
  }

  static now(): Timestamp {
    return new Timestamp(new Date())
  }

  static fromDate(date: Date): Timestamp {
    return new Timestamp(new Date(date))
  }

  static fromISOString(isoString: string): Timestamp {
    const date = new Date(isoString)
    return new Timestamp(date)
  }

  static fromUnixTimestamp(unixTimestamp: number): Timestamp {
    return new Timestamp(new Date(unixTimestamp * 1000))
  }

  static fromMilliseconds(ms: number): Timestamp {
    return new Timestamp(new Date(ms))
  }

  static min(...timestamps: Timestamp[]): Timestamp {
    if (timestamps.length === 0) {
      throw new Error('At least one timestamp is required')
    }
    
    return timestamps.reduce((min, current) => 
      current.isBefore(min) ? current : min
    )
  }

  static max(...timestamps: Timestamp[]): Timestamp {
    if (timestamps.length === 0) {
      throw new Error('At least one timestamp is required')
    }
    
    return timestamps.reduce((max, current) => 
      current.isAfter(max) ? current : max
    )
  }

  static sort(timestamps: Timestamp[], ascending: boolean = true): Timestamp[] {
    const sorted = [...timestamps].sort((a, b) => 
      a.toMilliseconds() - b.toMilliseconds()
    )
    
    return ascending ? sorted : sorted.reverse()
  }
}