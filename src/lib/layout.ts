/** Shared layout numbers so the 3D camera framing can make room for the 2D UI. */
export const LAYOUT = {
  /** Width at/above which the side-panel (desktop) layout is used. */
  desktopMinWidth: 1024,
  /** Desktop detail panel width in px (also the right-hand gutter the camera avoids). */
  panelWidth: 440,
  /** Mobile bottom-sheet peek height, as a fraction of the viewport height. */
  sheetPeek: 0.42,
}

export const DESKTOP_QUERY = `(min-width: ${LAYOUT.desktopMinWidth}px)`

export const isDesktopWidth = (width: number) => width >= LAYOUT.desktopMinWidth
