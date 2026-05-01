# Document Ingestion

## Capability
Multi-format document loading and preprocessing for RAG pipelines.

## Supported Formats

| Format | Parser | Preserves Structure | Metadata Extraction |
|--------|--------|---------------------|---------------------|
| PDF | pdf-parse | Text flow | Title, author, pages |
| Markdown | marked | Headers, lists, code | Frontmatter |
| HTML | cheerio | Main content | Title, meta tags |
| Plain Text | native | N/A | Filename, encoding |

## Usage

```typescript
import { DocumentLoader } from '@reaatech/hybrid-rag-ingestion';

const loader = new DocumentLoader({
  maxFileSize: 10 * 1024 * 1024, // 10MB
  extractMetadata: true,
});

const document = await loader.load('path/to/document.pdf');
console.log(document.content); // Cleaned text
console.log(document.metadata); // { title, author, date, source }
```

## Preprocessing Pipeline

1. **Unicode normalization** — NFC form
2. **Whitespace normalization** — collapse multiple spaces/newlines
3. **Header/footer removal** — detect and remove repeating patterns
4. **Table extraction** — convert tables to markdown format

## Error Handling

- **File not found** → `ENOENT` error
- **Unsupported format** → `UnsupportedFormatError`
- **File too large** → `FileSizeExceededError`
- **Parse failure** → `DocumentParseError` with partial content if available

## Security Considerations

- File size limits enforced (default 10MB, configurable)
- Content type validation before parsing
- Duplicate detection via content hashing (SHA-256)
- No external resource loading (SSRF protection)
