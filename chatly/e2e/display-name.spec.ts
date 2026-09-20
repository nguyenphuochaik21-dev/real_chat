import { expect, test } from '@playwright/test'
import { getCompactDisplayName } from '../src/lib/utils'

test('chat header keeps the first and last parts of a long name', () => {
  expect(getCompactDisplayName('Nguyễn Xuân Hiếu')).toBe('Nguyễn Hiếu')
  expect(getCompactDisplayName('Hải Nguyễn Phước')).toBe('Hải Phước')
  expect(getCompactDisplayName('Chatly')).toBe('Chatly')
})
