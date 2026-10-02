import { buildItineraryPdf } from './itineraryPdf';
import type { ItineraryPdfModel } from './itineraryPdfModel';

self.onmessage = async (event: MessageEvent<{ model: ItineraryPdfModel; fontUrl: string }>) => {
  try {
    const blob = await buildItineraryPdf(event.data.model, event.data.fontUrl);
    self.postMessage({ blob });
  } catch {
    // Do not expose potentially sensitive document content in errors/logs.
    self.postMessage({ error: true });
  }
};
