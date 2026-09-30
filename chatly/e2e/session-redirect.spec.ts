import { expect, test } from '@playwright/test'
import { NextResponse } from 'next/server'
import { redirectWithSession } from '../src/lib/supabase/middleware'

test('auth redirects preserve refreshed cookies and prevent shared caching', () => {
  const session = NextResponse.next()
  session.cookies.set('sb-test-auth-token.0', 'refreshed-token', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  })
  session.cookies.set('sb-test-auth-token.1', '', { maxAge: 0, path: '/' })
  session.headers.set('Cache-Control', 'private, no-store')
  session.headers.set('Pragma', 'no-cache')
  session.headers.set('Expires', '0')

  const response = redirectWithSession(new URL('https://chatly.example/chats'), session)
  expect(response.status).toBe(307)
  expect(response.cookies.getAll()).toEqual(session.cookies.getAll())
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(response.headers.get('Pragma')).toBe('no-cache')
  expect(response.headers.get('Expires')).toBe('0')
  expect(response.headers.get('Location')).toBe('https://chatly.example/chats')
})
