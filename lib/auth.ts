import Cookies from "js-cookie"

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin123"
const AUTH_COOKIE = "law_calendar_auth"

export const login = (password:string) => {
  if (password === ADMIN_PASSWORD) {
    Cookies.set(AUTH_COOKIE, "admin", { expires: 7, secure: true, sameSite: "strict" })
    return true
  }
  return false
}

export const logout = () => { Cookies.remove(AUTH_COOKIE) }
export const isAdmin = () => Cookies.get(AUTH_COOKIE) === "admin"
export const getAuthStatus = () => ({ isLoggedIn: isAdmin(), userType: isAdmin() ? "admin" : "visitor" })
