declare module "node:path" {
  export function resolve(...paths: string[]): string
}

declare module "node:url" {
  export function pathToFileURL(path: string): URL
}

declare module "node:crypto" {
  export function randomUUID(): string
}