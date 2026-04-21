export type DocumentId = number;

export interface Document {
  id: DocumentId;
  title: string;
  body: string;
  tags: string[];
  createdAt: Date;
}

export interface NewDocument {
  title: string;
  body: string;
  tags?: string[];
}
