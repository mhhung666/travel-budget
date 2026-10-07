export const colors = {
  light: {
    background: '#F6F8F7',
    surface: '#FFFFFF',
    text: '#18181B',
    muted: '#5F6565',
    primary: '#1B7E74',
    onPrimary: '#FFFFFF',
    primaryPressed: '#14685F',
    selected: '#EFF9F6',
    border: '#D8E3DF',
    controlBorder: '#7B8E87',
    disabled: '#E5ECE9',
    onDisabled: '#536159',
    success: '#177347',
    successSurface: '#E8F5ED',
    warning: '#8D4B09',
    warningSurface: '#FFF3D9',
    info: '#175BAB',
    infoSurface: '#EDF4FF',
    // Compatibility for screens that use the previous informational surface token.
    notice: '#EDF4FF',
    danger: '#B42318',
    dangerSurface: '#FDEEEB',
    dangerFill: '#B42318',
    onDanger: '#FFFFFF',
    focus: '#175BAB',
  },
  dark: {
    background: '#101817',
    surface: '#182321',
    text: '#F4FAF8',
    muted: '#ADBEB8',
    primary: '#37BEAC',
    onPrimary: '#032621',
    primaryPressed: '#66D1BF',
    selected: '#1D3B34',
    border: '#364A43',
    controlBorder: '#728A80',
    disabled: '#283A34',
    onDisabled: '#B0C1B9',
    success: '#6BDBA3',
    successSurface: '#183B29',
    warning: '#F5C45C',
    warningSurface: '#382D16',
    info: '#8FBBFF',
    infoSurface: '#1C2F48',
    notice: '#1C2F48',
    danger: '#FFB4A9',
    dangerSurface: '#44231F',
    dangerFill: '#FFB4A9',
    onDanger: '#3E0D09',
    focus: '#8FBBFF',
  },
};

export type Palette = (typeof colors)['light'];
export type Tone = 'info' | 'success' | 'warning' | 'danger';

export const spacing = { tiny: 4, small: 8, compact: 12, medium: 16, large: 24, section: 32 };
export const radius = { card: 16, control: 12, badge: 999 };
export const sizing = { border: 1, touch: 48, input: 52, amount: 72, icon: 20, iconStroke: 2 };
export const typography = {
  page: { fontSize: 24, lineHeight: 32 },
  section: { fontSize: 20, lineHeight: 28 },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12, lineHeight: 18 },
  metric: { fontSize: 24, lineHeight: 32 },
  amount: { fontSize: 32, lineHeight: 40 },
};

export function toneColors(palette: Palette, tone: Tone) {
  return { foreground: palette[tone], background: palette[`${tone}Surface`] };
}
