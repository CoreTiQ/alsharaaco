import Cookies from 'js-cookie'

const COOKIE_NAME = 'law_calendar_auth'
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123'

export function login(password: string): boolean {
  if (password === ADMIN_PASSWORD) {
    Cookies.set(COOKIE_NAME, 'admin', { expires: 7, secure: true, sameSite: 'strict' })
    return true
  }
  return false
}

export function logout(): void { Cookies.remove(COOKIE_NAME) }
export function isAdmin(): boolean { return Cookies.get(COOKIE_NAME) === 'admin' }
export function getAuthStatus() { return { isLoggedIn: isAdmin(), userType: isAdmin() ? 'admin' : 'visitor' } }
