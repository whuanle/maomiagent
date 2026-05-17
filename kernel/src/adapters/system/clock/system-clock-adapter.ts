import type { ClockPort } from "../../../core"

export class SystemClockAdapter implements ClockPort {
  constructor(private readonly nowFn: () => number = () => Date.now()) {}

  now(): number {
    return this.nowFn()
  }
}
