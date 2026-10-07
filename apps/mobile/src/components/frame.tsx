import { createContext, useContext, type PropsWithChildren } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { usePalette } from '@/theme/usePalette';

const Edges = createContext<Edge[]>(['top', 'bottom', 'left', 'right']);
/** The containing navigator owns its header/footer insets; the content owns the remainder. */
export function ContentInsets({ edges, children }: PropsWithChildren<{ edges: Edge[] }>) {
  return <Edges.Provider value={edges}>{children}</Edges.Provider>;
}
/** A list uses this frame directly, without an outer ScrollView. */
export function ScreenFrame({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const p = usePalette();
  const edges = useContext(Edges);
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: p.background }, style]}>
      {children}
    </SafeAreaView>
  );
}
