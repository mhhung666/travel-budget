import { Fragment } from 'react';
import { Document, Page, Text, View, Link, StyleSheet } from '@react-pdf/renderer';
import type { ItineraryPdfModel } from '@/lib/exporters/itineraryPdfModel';
import type { PdfBlock } from '@/lib/exporters/itineraryPdfMarkdown';
import { pdfText } from '@/lib/exporters/pdfText';

// Keep relative lineHeight off Page: inherited values compound on repeated dynamic footers.
const styles = StyleSheet.create({
  page: {
    fontFamily: 'TravelCJK',
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 52,
    paddingHorizontal: 42,
    color: '#182330',
  },
  title: { fontSize: 21, marginBottom: 8 },
  meta: { fontSize: 9, color: '#526172', marginBottom: 5 },
  day: { fontSize: 14, marginTop: 18, marginBottom: 6, color: '#144e63' },
  activity: { marginTop: 9, borderTopWidth: 0.5, borderTopColor: '#d5dde4', paddingTop: 6 },
  activityTitle: { fontSize: 11, marginBottom: 3 },
  paragraph: { marginBottom: 5 },
  footer: {
    position: 'absolute',
    bottom: 23,
    left: 42,
    right: 42,
    fontSize: 8,
    color: '#526172',
    textAlign: 'right',
  },
});

function Markdown({ content }: { content: PdfBlock[] }) {
  return content.map((block, index) => {
    if (block.kind === 'rule')
      return (
        <View
          key={index}
          style={{ borderBottomWidth: 0.5, borderBottomColor: '#aaa', marginVertical: 6 }}
        />
      );
    return (
      <Text
        key={index}
        orphans={2}
        widows={2}
        minPresenceAhead={block.kind === 'heading' ? 24 : 0}
        style={[
          styles.paragraph,
          block.kind === 'heading'
            ? { fontSize: 15 - Math.min(block.depth ?? 1, 4), marginTop: 6 }
            : {},
          block.kind === 'quote' ? { paddingLeft: 10, color: '#526172' } : {},
          block.kind === 'code' ? { backgroundColor: '#f0f3f5', padding: 5, fontSize: 9 } : {},
        ]}
      >
        {block.content.map((part, i) => {
          // The static CJK face has no italic/bold face: underline/color provide emphasis.
          const style = {
            textDecoration: part.strike
              ? ('line-through' as const)
              : part.bold || part.emphasis
                ? ('underline' as const)
                : ('none' as const),
            color: part.url ? '#12628b' : undefined,
            backgroundColor: part.code ? '#eef1f3' : undefined,
          };
          return part.url ? (
            <Link key={i} src={part.url} style={style}>
              {pdfText(part.text)}
            </Link>
          ) : (
            <Text key={i} style={style}>
              {pdfText(part.text)}
            </Text>
          );
        })}
      </Text>
    );
  });
}

export default function ItineraryPdfDocument({ model }: { model: ItineraryPdfModel }) {
  const labels = model.labels;
  return (
    <Document title={model.name} language={model.locale}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{pdfText(model.name)}</Text>
        {model.dates && <Text style={styles.meta}>{pdfText(model.dates)}</Text>}
        <Text style={styles.meta}>{pdfText(`${labels.generated}: ${model.generated}`)}</Text>
        <Text style={styles.meta}>
          {pdfText(
            `${labels.range}: ${model.days.map((day) => day.heading.split(' · ')[0]).join(', ')}`
          )}
        </Text>
        {model.days.map((day, index) => (
          <Fragment key={index}>
            <Text style={styles.day} minPresenceAhead={32}>
              {pdfText(day.heading)}
            </Text>
            {day.location && <Text style={styles.meta}>{pdfText(day.location)}</Text>}
            <Markdown content={day.content} />
            {day.activities.map((activity, i) => (
              <View key={i} style={styles.activity}>
                <Text style={styles.activityTitle} minPresenceAhead={18}>
                  {pdfText([activity.time, activity.title].filter(Boolean).join('  '))}
                </Text>
                <Text style={styles.meta}>
                  {pdfText([activity.type, activity.location].filter(Boolean).join(' · '))}
                </Text>
                {activity.note && (
                  <Text style={styles.paragraph} orphans={2} widows={2}>
                    {pdfText(activity.note)}
                  </Text>
                )}
                {activity.confirmation && (
                  <Text>{pdfText(`${labels.confirmation}: ${activity.confirmation}`)}</Text>
                )}
              </View>
            ))}
          </Fragment>
        ))}
        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${pdfText(Array.from(model.name).slice(0, 32).join(''))}  ·  ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
