export interface IOcrWord {
  text: string;
  confidence: number | null;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface IOcrPage {
  pageNumber: number;
  ocrText: string;
  words?: IOcrWord[];
}
