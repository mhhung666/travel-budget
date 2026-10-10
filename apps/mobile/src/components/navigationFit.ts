import { useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent, type TextLayoutEvent } from 'react-native';

/** Measurements are scoped to the current width, text size and translations, not a sticky flag. */
export function useNavigationFit(labels: string) {
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [container, setContainer] = useState<{ windowWidth: number; width: number } | null>(null);
  const width = container?.windowWidth === windowWidth ? container.width : windowWidth;
  const key = `${width}:${fontScale}:${labels}`;
  const [overflow, setOverflow] = useState<string | null>(null);
  return {
    compact: fontScale >= 1.5 || width < 300 || overflow === key,
    onLayout: (event: LayoutChangeEvent) => {
      const measured = event.nativeEvent.layout.width;
      if (measured > 0) setContainer({ windowWidth, width: measured });
    },
    onTextLayout: (event: TextLayoutEvent) => {
      if (event.nativeEvent.lines.length > 1) setOverflow(key);
    },
  };
}
export type NavigationFit = ReturnType<typeof useNavigationFit>;
