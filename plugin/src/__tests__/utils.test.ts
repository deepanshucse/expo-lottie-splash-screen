import { DEFAULT_BACKGROUND_COLOR, normalizeHexColor, resolveOptions } from '../utils';

describe('normalizeHexColor', () => {
  it('uppercases #RRGGBB and #AARRGGBB', () => {
    expect(normalizeHexColor('#1a1a2e', 'backgroundColor')).toBe('#1A1A2E');
    expect(normalizeHexColor('#801a1a2e', 'backgroundColor')).toBe('#801A1A2E');
  });

  it('expands #RGB, which Android Color.parseColor does not accept', () => {
    expect(normalizeHexColor('#fff', 'backgroundColor')).toBe('#FFFFFF');
  });

  it('accepts a missing # and surrounding whitespace', () => {
    expect(normalizeHexColor(' 1A1A2E ', 'backgroundColor')).toBe('#1A1A2E');
  });

  it.each(['white', '#12345', '#GGGGGG', '"); evil("', ''])('rejects %p', (value) => {
    expect(() => normalizeHexColor(value, 'backgroundColor')).toThrow(/backgroundColor/);
  });
});

describe('resolveOptions', () => {
  it('uses the same defaults for every platform', () => {
    expect(resolveOptions({ animationFile: './a.json' })).toEqual({
      animationFile: './a.json',
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      darkBackgroundColor: undefined,
      autoHide: false,
    });
  });

  it('validates darkBackgroundColor', () => {
    expect(
      resolveOptions({ animationFile: './a.json', darkBackgroundColor: '#000' }).darkBackgroundColor
    ).toBe('#000000');
    expect(() =>
      resolveOptions({ animationFile: './a.json', darkBackgroundColor: 'black' })
    ).toThrow(/darkBackgroundColor/);
  });
});
