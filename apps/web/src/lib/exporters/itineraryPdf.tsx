import { pdfBreakWord } from './pdfText';
import { Font, pdf } from '@react-pdf/renderer';
import ItineraryPdfDocument from '@/components/export/ItineraryPdfDocument';
import type { ItineraryPdfModel } from './itineraryPdfModel';

let registered = false;
export async function buildItineraryPdf(model: ItineraryPdfModel, fontUrl: string): Promise<Blob> {
  if (!registered) {
    Font.register({ family: 'TravelCJK', src: fontUrl });
    // Permit unspaced CJK and long URLs to wrap without dropping characters.
    Font.registerHyphenationCallback(pdfBreakWord);
    registered = true;
  }
  return pdf(<ItineraryPdfDocument model={model} />).toBlob();
}
