declare module 'js-cookie' {
  interface CookieAttributes {
    expires?: number | Date
    path?: string
    domain?: string
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
  }
  export function get(name: string): string | undefined
  export function set(name: string, value: string, options?: CookieAttributes): string
  export function remove(name: string, options?: CookieAttributes): void
}
