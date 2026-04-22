import { describe, expect, it } from 'vitest';
import { toPosixPath } from '../utils';

describe('toPosixPath', () => {
  it('converts Windows backslashes to forward slashes', () => {
    expect(toPosixPath('C:\\Users\\saul\\file.xlsx')).toBe('C:/Users/saul/file.xlsx');
  });

  it('leaves POSIX paths unchanged', () => {
    expect(toPosixPath('/Users/saul/file.xlsx')).toBe('/Users/saul/file.xlsx');
  });

  it('handles mixed separators', () => {
    expect(toPosixPath('C:\\Users/saul\\file.xlsx')).toBe('C:/Users/saul/file.xlsx');
  });
});
