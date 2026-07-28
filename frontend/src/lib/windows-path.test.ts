import { describe, expect, it } from 'vitest'
import { trimWindowsFilePathToFolder } from './windows-path'

describe('windows-path helpers', () => {
  it('trims the filename from a Windows file path', () => {
    expect(trimWindowsFilePathToFolder('I:\\My Drive\\Hako\\Giải Trí Đến Chết\\24855.epub')).toBe(
      'I:\\My Drive\\Hako\\Giải Trí Đến Chết',
    )
  })
})
