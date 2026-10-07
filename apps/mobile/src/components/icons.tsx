import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { sizing } from '@/theme/tokens';

export type IconName =
  | 'map-pin'
  | 'plus'
  | 'user'
  | 'chevron-left'
  | 'user-plus'
  | 'check'
  | 'alert'
  | 'info'
  | 'spinner';

type Segment = readonly [number, number, number, number];
const paths: Partial<Record<IconName, readonly Segment[]>> = {
  'map-pin': [
    [6, 12, 10, 18],
    [10, 18, 14, 12],
  ],
  plus: [
    [3, 10, 17, 10],
    [10, 3, 10, 17],
  ],
  'chevron-left': [
    [12, 4, 6, 10],
    [6, 10, 12, 16],
  ],
  'user-plus': [
    [14, 8, 20, 8],
    [17, 5, 17, 11],
  ],
  check: [
    [3, 10, 8, 15],
    [8, 15, 17, 5],
  ],
  alert: [
    [10, 2, 1, 18],
    [1, 18, 19, 18],
    [19, 18, 10, 2],
    [10, 7, 10, 11],
  ],
  info: [[10, 9, 10, 14]],
};

/** Decorative native outlines: their owning control supplies the translated accessible label. */
export function Icon({ name, color }: { name: IconName; color: string }) {
  const stroke = sizing.iconStroke;
  const outline = (style: ViewStyle) => (
    <View style={[{ position: 'absolute', borderWidth: stroke, borderColor: color }, style]} />
  );
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: sizing.icon, height: sizing.icon, flexShrink: 0 }}
    >
      {name === 'spinner' ? (
        <ActivityIndicator size="small" color={color} style={{ width: 20, height: 20 }} />
      ) : (
        <>
          {(paths[name] ?? []).map(([x1, y1, x2, y2], index) => {
            const width = Math.hypot(x2 - x1, y2 - y1);
            return (
              <View
                key={index}
                style={{
                  position: 'absolute',
                  left: (x1 + x2 - width) / 2,
                  top: (y1 + y2 - stroke) / 2,
                  width,
                  height: stroke,
                  borderRadius: stroke / 2,
                  backgroundColor: color,
                  transform: [{ rotate: `${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI}deg` }],
                }}
              />
            );
          })}
          {name === 'map-pin' && (
            <>
              {outline({ left: 4, top: 1, width: 12, height: 12, borderRadius: 6 })}
              {outline({ left: 8, top: 5, width: 4, height: 4, borderRadius: 2 })}
            </>
          )}
          {(name === 'user' || name === 'user-plus') && (
            <>
              {outline({ left: 6, top: 1, width: 8, height: 8, borderRadius: 4 })}
              {outline({
                left: 3,
                top: 12,
                width: 14,
                height: 7,
                borderTopLeftRadius: 7,
                borderTopRightRadius: 7,
                borderBottomWidth: 0,
              })}
            </>
          )}
          {name === 'info' && outline({ left: 1, top: 1, width: 18, height: 18, borderRadius: 9 })}
          {(name === 'info' || name === 'alert') && (
            <View
              style={{
                position: 'absolute',
                left: 9,
                top: name === 'info' ? 5 : 14,
                width: stroke,
                height: stroke,
                borderRadius: stroke / 2,
                backgroundColor: color,
              }}
            />
          )}
        </>
      )}
    </View>
  );
}
