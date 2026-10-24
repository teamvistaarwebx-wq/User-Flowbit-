import { describe, expect, it } from 'vitest'
import { brandColorsAllowed, checkContrast, contrastRatio, DEFAULT_THEME, normalizeHex, resolveTheme, themeCss, themeVars } from './brand-theme'

describe('brand theme', () => {
  it('normalizes hex input and refuses anything else', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('12abEF')).toBe('#12abef')
    expect(normalizeHex('red')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
  })

  it('falls back to Flowbit colours for missing or invalid values', () => {
    expect(resolveTheme(null)).toEqual(DEFAULT_THEME)
    expect(resolveTheme({ primary: '#FF0000', secondary: 'blue;}body{', accent: null })).toEqual({ ...DEFAULT_THEME, primary: '#ff0000' })
  })

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('grades colours against the dark surfaces', () => {
    expect(checkContrast('#eac1dc').level).toBe('good')
    expect(checkContrast('#4b2a8c').level).toBe('poor')
    expect(checkContrast('#bb62a5').level).toBe('ui_only')
  })

  it('emits CSS variables only for a custom theme, never raw input', () => {
    expect(themeCss(null)).toBe('')
    expect(themeCss(DEFAULT_THEME)).toBe('')
    const css = themeCss({ primary: '#0ea5e9', secondary: 'x}</style><script>', accent: '#fde68a' })
    expect(css.startsWith(':root{')).toBe(true)
    expect(css).toContain('--orchid:#0ea5e9')
    expect(css).toContain('--chip-active:#4b2a8c')
    expect(css).not.toContain('<')
  })

  it('drives every brand gradient, including the alt button, selected, step, Arc and stroke ones', () => {
    const vars = themeVars({ primary: '#0ea5e9', secondary: '#1e3a8a', accent: '#fde68a' })
    for (const key of ['--grad-button-alt', '--grad-selected', '--grad-step', '--grad-stroke-brand', '--arc-glow', '--grad-arc-pill', '--grad-arc-word', '--grad-brand-word']) {
      expect(vars[key], key).toBeTruthy()
      expect(vars[key], key).toMatch(/#0ea5e9|#1e3a8a|#fde68a/)
      expect(vars[key], key).not.toMatch(/#bb62a5|#4b2a8c|#eac1dc/)
    }
  })

  it('is a Suite feature, open during the workspace trial', () => {
    expect(brandColorsAllowed({ subscription: { status: 'trialing', plan: 'trial' } })).toBe(true)
    expect(brandColorsAllowed({ subscription: { status: 'active', plan: 'suite' } })).toBe(true)
    // V2-REVIEW E2: the Free plan is stored as trialing but does not get the trial's Suite perks.
    expect(brandColorsAllowed({ subscription: { status: 'trialing', plan: 'trial', accountType: 'free' } })).toBe(false)
    expect(brandColorsAllowed({ subscription: { status: 'active', plan: 'custom' } })).toBe(false)
  })
})

describe('theme presets', () => {
  it('offers 6 to 8 presets that pass the contrast checks', async () => {
    const { THEME_PRESETS, checkContrast, contrastRatio, presetOf, DEFAULT_THEME } = await import('./brand-theme')
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(6)
    expect(THEME_PRESETS.length).toBeLessThanOrEqual(8)
    for (const p of THEME_PRESETS) {
      expect(checkContrast(p.theme.primary).level, `${p.key} primary`).not.toBe('poor')
      expect(checkContrast(p.theme.accent).level, `${p.key} accent`).toBe('good')
      expect(contrastRatio(p.theme.secondary, '#ffffff'), `${p.key} secondary`).toBeGreaterThanOrEqual(4.5)
    }
    expect(presetOf(DEFAULT_THEME)).toBe('flowbit')
    expect(presetOf({ primary: '#123456', secondary: '#000000', accent: '#ffffff' })).toBeNull()
  })
})

describe('primary button contrast (R2 13.2)', () => {
  it('keeps white label text at 4.5:1 or more across the label zone for every preset', async () => {
    // Arrange
    const { THEME_PRESETS, BUTTON_LABEL_ZONE, buttonGradientStops } = await import('./brand-theme')

    for (const preset of THEME_PRESETS) {
      // Act
      const labelStops = buttonGradientStops(preset.theme).filter(([, stop]) => stop >= BUTTON_LABEL_ZONE.from)

      // Assert
      expect(labelStops.length, preset.key).toBeGreaterThanOrEqual(2)
      for (const [color] of labelStops) expect(contrastRatio(color, '#ffffff'), `${preset.key} ${color}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('darkens a light colour just enough for white text and leaves a dark one alone', async () => {
    // Arrange
    const { darkenForWhiteText } = await import('./brand-theme')

    // Act
    const saffron = darkenForWhiteText('#e6a817')
    const violet = darkenForWhiteText('#4b2a8c')

    // Assert
    expect(contrastRatio(saffron, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(saffron, '#ffffff')).toBeLessThan(6)
    expect(violet).toBe('#4b2a8c')
  })

  it('uses the safe stops in the themed --grad-button', () => {
    // Arrange
    const theme = { primary: '#e6a817', secondary: '#f5f5f5', accent: '#fde7a8' }

    // Act
    const gradient = themeVars(theme)['--grad-button']

    // Assert
    expect(gradient).toMatch(/^linear-gradient\(90deg, #fde7a8 0%, #e6a817 15%, #[0-9a-f]{6} 30%, #[0-9a-f]{6} 70%, #[0-9a-f]{6} 100%\)$/)
    expect(gradient).not.toContain('#f5f5f5')
  })
})

describe('dark surfaces (R2 19.3)', () => {
  it('checks contrast against the real --bg, --bg-2 and card colours', async () => {
    // Arrange, Act
    const { DARK_SURFACES } = await import('./brand-theme')

    // Assert
    expect(DARK_SURFACES).toEqual(['#171717', '#1a1a1a', '#27272b'])
  })

  it('grades Flowbit orchid by its worst surface, the cards', () => {
    // Arrange, Act
    const orchid = checkContrast('#bb62a5')

    // Assert
    expect(orchid.ratio).toBeCloseTo(contrastRatio('#bb62a5', '#27272b'), 1)
    expect(orchid.level).toBe('ui_only')
  })
})

describe('workspacePrimary (R2 19.1)', () => {
  it("shows the brand colour on Suite and Flowbit's once brand colours lapse", async () => {
    // Arrange
    const { workspacePrimary } = await import('./brand-theme')
    const theme = { primary: '#3ba7e0', secondary: '#1e3a8a', accent: '#a5e4ff' }

    // Act
    const suite = workspacePrimary({ theme, subscription: { status: 'active', plan: 'suite' } })
    const lapsed = workspacePrimary({ theme, subscription: { status: 'active', plan: 'custom' } })
    const missing = workspacePrimary(null)

    // Assert
    expect(suite).toBe('#3ba7e0')
    expect(lapsed).toBe(DEFAULT_THEME.primary)
    expect(missing).toBe(DEFAULT_THEME.primary)
  })
})


describe('link colour (R2 19.2)', () => {
  it('lightens the primary until it reads as text on every dark surface, for every preset', async () => {
    // Arrange
    const { THEME_PRESETS, DARK_SURFACES, lightenForDarkText } = await import('./brand-theme')

    for (const preset of THEME_PRESETS) {
      // Act
      const link = lightenForDarkText(preset.theme.primary)

      // Assert
      for (const surface of DARK_SURFACES) expect(contrastRatio(link, surface), `${preset.key} on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('leaves an already readable colour alone', async () => {
    // Arrange
    const { lightenForDarkText } = await import('./brand-theme')

    // Act, Assert
    expect(lightenForDarkText('#eac1dc')).toBe('#eac1dc')
  })

  it('sets --link for a custom theme and nothing for the default one', async () => {
    // Arrange
    const { lightenForDarkText } = await import('./brand-theme')

    // Act
    const vars = themeVars({ primary: '#3ba7e0', secondary: '#1e3a8a', accent: '#a5e4ff' })

    // Assert
    expect(vars['--link']).toBe(lightenForDarkText('#3ba7e0'))
    expect(themeCss(DEFAULT_THEME)).toBe('')
  })
})
